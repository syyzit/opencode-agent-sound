import { spawn } from "node:child_process"
import { existsSync, readdirSync, statSync } from "node:fs"
import { homedir } from "node:os"
import { extname, join } from "node:path"
import { Plugin } from "@opencode/plugin"

// Plays custom sounds for agent completion, permission requests, and errors.
// Set the corresponding built-in desktop sounds to None to avoid two sounds:
// Settings > General > Sounds > Agent / Permissions / Errors > None.
//
// Default layout:
//   ~/.config/opencode/sounds/agent/
//   ~/.config/opencode/sounds/permissions/
//   ~/.config/opencode/sounds/errors/
//
// Each entry can be an audio file or a directory of audio files. With a
// directory, one file is picked at random (never the same one twice in a row).
const SOUND_ROOT = join(homedir(), ".config/opencode/sounds")

const DEFAULTS = {
  agent: join(SOUND_ROOT, "agent"),
  permissions: join(SOUND_ROOT, "permissions"),
  errors: join(SOUND_ROOT, "errors"),
} as const

type SoundKind = keyof typeof DEFAULTS

const EVENT_KINDS: Record<string, SoundKind> = {
  "session.execution.succeeded": "agent",
  "permission.asked": "permissions",
  "session.execution.failed": "errors",
}

const AUDIO_EXTENSIONS = new Set([
  ".mp3",
  ".wav",
  ".m4a",
  ".aac",
  ".ogg",
  ".flac",
  ".aiff",
  ".aif",
])

// Do not stack sounds: one at a time, and no more than one every few seconds.
const COOLDOWN_MS = 3000

const state = globalThis as typeof globalThis & {
  __agentSoundSeen?: Set<string>
  __agentSoundLast?: number
  __agentSoundPlaying?: boolean
  __agentSoundLastPlayed?: Partial<Record<SoundKind, string>>
}

// Several plugin instances can receive the same event, so IDs are shared.
const seen = (state.__agentSoundSeen ??= new Set<string>())
const lastPlayed = (state.__agentSoundLastPlayed ??= {})

function expandHome(path: string) {
  if (path === "~") return homedir()
  if (path.startsWith("~/")) return join(homedir(), path.slice(2))
  return path
}

function isFile(path: string) {
  try {
    return statSync(path).isFile()
  } catch {
    return false
  }
}

function candidates(target: string): string[] {
  try {
    if (statSync(target).isDirectory()) {
      return readdirSync(target)
        .filter((name) => !name.startsWith(".") && AUDIO_EXTENSIONS.has(extname(name).toLowerCase()))
        .map((name) => join(target, name))
        .filter(isFile)
    }
  } catch {}

  return isFile(target) ? [target] : []
}

function filesFor(kind: SoundKind, target: string): string[] {
  const files = candidates(target)
  if (files.length > 0 || kind !== "agent") return files

  // Backwards compatibility: agent sounds may live directly in sounds/.
  return candidates(SOUND_ROOT)
}

function pick(kind: SoundKind, target: string): string | undefined {
  const files = filesFor(kind, target)
  if (files.length === 0) return undefined
  if (files.length === 1) return files[0]

  const previous = lastPlayed[kind]
  const pool = previous ? files.filter((file) => file !== previous) : files
  const chosen = pool[Math.floor(Math.random() * pool.length)]

  lastPlayed[kind] = chosen
  return chosen
}

function play(kind: SoundKind, target: string) {
  if (process.platform !== "darwin") return

  const now = Date.now()

  if (state.__agentSoundPlaying) return
  if (now - (state.__agentSoundLast ?? 0) < COOLDOWN_MS) return

  const file = pick(kind, target)
  if (!file || !existsSync(file)) return

  state.__agentSoundLast = now
  state.__agentSoundPlaying = true

  const done = () => {
    state.__agentSoundPlaying = false
  }

  const child = spawn("afplay", [file], { stdio: "ignore" })
  child.once("error", done)
  child.once("exit", done)
}

function optionPath(options: Record<string, unknown>, key: SoundKind) {
  const value = options[key]
  return typeof value === "string" && value ? expandHome(value) : DEFAULTS[key]
}

export default Plugin.define({
  id: "agent-sound",
  setup(ctx) {
    const options = (ctx.options ?? {}) as Record<string, unknown>
    const targets: Record<SoundKind, string> = {
      agent: optionPath(options, "agent"),
      permissions: optionPath(options, "permissions"),
      errors: optionPath(options, "errors"),
    }
    const controller = new AbortController()

    void (async () => {
      try {
        for await (const event of ctx.event.subscribe({ signal: controller.signal })) {
          // Some OpenCode builds ignore the `types` subscribe option, so check
          // the event name explicitly.
          const kind = EVENT_KINDS[event.type]
          if (!kind) continue

          // Ignore events replayed from the server's recent-event buffer.
          if (typeof event.created === "number" && Date.now() - event.created > 60_000) continue

          if (seen.has(event.id)) continue
          seen.add(event.id)
          if (seen.size > 4096) seen.clear()

          // Agent completion is quiet for subagents; permission requests and
          // errors from subagents still matter, so those always play.
          if (kind === "agent") {
            if (event.type !== "session.execution.succeeded") continue
            const sessionID = event.data.sessionID
            if (!sessionID) continue

            try {
              const session = await ctx.session.get({ sessionID })
              if (session.parentID) continue
            } catch {}
          }

          play(kind, targets[kind])
        }
      } catch (error) {
        if (!controller.signal.aborted) console.error("agent-sound:", error)
      }
    })()

    return () => controller.abort()
  },
})
