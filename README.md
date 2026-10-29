# opencode-agent-sound

Custom sounds for [OpenCode Desktop](https://opencode.ai) on macOS when an
agent:

- finishes a turn
- asks for permission
- fails

Each event uses its own folder of sounds. If a folder has more than one file, one
is picked at random and the same file is not played twice in a row.

> **Platform:** macOS only. This is a server plugin, so sounds play on the
> machine running the OpenCode server. A remote or non-macOS server will not
> produce audio. Playback uses the built-in `afplay` command.

> **Using the TUI?** OpenCode already supports custom sounds through `cli.json`
> (`attention.sounds`). This plugin is mainly for OpenCode Desktop.

Sound files are not included in this repository.

## Install

With the OpenCode CLI:

```sh
opencode plugin add github:syyzit/opencode-agent-sound
```

Or clone it into your global plugin directory:

```sh
git clone https://github.com/syyzit/opencode-agent-sound.git \
  ~/.config/opencode/plugins/opencode-agent-sound
```

OpenCode discovers plugin directories under `~/.config/opencode/plugins/`
automatically. If you already have a local copy of this plugin installed,
remove it first so two copies do not play sounds at the same time.

## Add sounds

Create the folders and drop audio files into them:

```sh
mkdir -p ~/.config/opencode/sounds/{agent,permissions,errors}
```

- `~/.config/opencode/sounds/agent/` — agent finished a turn
- `~/.config/opencode/sounds/permissions/` — permission requested
- `~/.config/opencode/sounds/errors/` — execution failed

Supported extensions: `.mp3`, `.wav`, `.m4a`, `.aac`, `.ogg`, `.flac`, `.aiff`,
`.aif`.

If `agent/` is empty, audio files directly in `~/.config/opencode/sounds/` are
used as a fallback.

## Turn off the built-in sounds

OpenCode Desktop has built-in Agent, Permissions, and Errors sounds. To hear
only your files, set all three to **None**:

**Settings → General → Sounds → Agent / Permissions / Errors → None**

Otherwise you will hear both.

## Configuration

Point an event at a specific file or directory by passing plugin options. Each
value can be a file or a directory; `~/` is expanded.

```jsonc title="~/.config/opencode/opencode.jsonc"
{
  "plugins": [
    {
      "package": "opencode-agent-sound",
      "options": {
        "agent": "~/Music/agent-sounds",
        "permissions": "~/Music/permission.wav",
        "errors": "~/Music/errors"
      }
    }
  ]
}
```

Without options, the default folders above are used.

## Behaviour

- Sounds play one at a time, with a 3 second cooldown.
- Subagent completions are ignored. Permission requests and errors from
  subagents still play.
- Events replayed from the server's recent-event buffer are ignored.
- If an event arrives while another sound is playing, it is skipped rather than
  queued.

## Events used

| Sound folder | OpenCode event |
|---|---|
| `agent` | `session.execution.succeeded` |
| `permissions` | `permission.asked` |
| `errors` | `session.execution.failed` |

## License

MIT. Sound files are not part of this repository and keep their own licenses.
