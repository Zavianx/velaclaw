---
summary: "Run the ACP bridge for IDE integrations"
read_when:
  - Setting up ACP-based IDE integrations
  - Debugging ACP session routing to the Gateway
title: "acp"
---

# acp

Run the [Agent Client Protocol (ACP)](https://agentclientprotocol.com/) bridge that talks to an Velaclaw Gateway.

This command speaks ACP over stdio for IDEs and forwards prompts to the Gateway
over WebSocket. It keeps ACP sessions mapped to Gateway session keys.

`velaclaw acp` is a Gateway-backed ACP bridge, not a full ACP-native editor
runtime. It focuses on session routing, prompt delivery, and basic streaming
updates.

If you want an external MCP client to talk directly to Velaclaw channel
conversations instead of hosting an ACP harness session, use
[`velaclaw mcp serve`](/cli/mcp) instead.

## What this is not

This page is often confused with ACP harness sessions.

`velaclaw acp` means:

- Velaclaw acts as an ACP server
- an IDE or ACP client connects to Velaclaw
- Velaclaw forwards that work into a Gateway session

This is different from [ACP Agents](/tools/acp-agents), where Velaclaw runs an
external harness such as Codex or Claude Code through `acpx`.

Quick rule:

- editor/client wants to talk ACP to Velaclaw: use `velaclaw acp`
- Velaclaw should launch Codex/Claude/Gemini as an ACP harness: use `/acp spawn` and [ACP Agents](/tools/acp-agents)

## Compatibility Matrix

| ACP area                                                              | Status      | Notes                                                                                                                                                                                                                                            |
| --------------------------------------------------------------------- | ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `initialize`, `newSession`, `prompt`, `cancel`                        | Implemented | Core bridge flow over stdio to Gateway chat/send + abort.                                                                                                                                                                                        |
| `listSessions`, slash commands                                        | Implemented | Session list works against Gateway session state; commands are advertised via `available_commands_update`.                                                                                                                                       |
| `loadSession`                                                         | Partial     | Rebinds the ACP session to a Gateway session key and replays stored user/assistant text history. Tool/system history is not reconstructed yet.                                                                                                   |
| Prompt content (`text`, embedded `resource`, images)                  | Partial     | Text/resources are flattened into chat input; images become Gateway attachments.                                                                                                                                                                 |
| Session modes                                                         | Partial     | `session/set_mode` is supported and the bridge exposes initial Gateway-backed session controls for thought level, tool verbosity, reasoning, usage detail, and elevated actions. Broader ACP-native mode/config surfaces are still out of scope. |
| Session info and usage updates                                        | Partial     | The bridge emits `session_info_update` and best-effort `usage_update` notifications from cached Gateway session snapshots. Usage is approximate and only sent when Gateway token totals are marked fresh.                                        |
| Tool streaming                                                        | Partial     | `tool_call` / `tool_call_update` events include raw I/O, text content, and best-effort file locations when Gateway tool args/results expose them. Embedded terminals and richer diff-native output are still not exposed.                        |
| Per-session MCP servers (`mcpServers`)                                | Unsupported | Bridge mode rejects per-session MCP server requests. Configure MCP on the Velaclaw gateway or agent instead.                                                                                                                                     |
| Client filesystem methods (`fs/read_text_file`, `fs/write_text_file`) | Unsupported | The bridge does not call ACP client filesystem methods.                                                                                                                                                                                          |
| Client terminal methods (`terminal/*`)                                | Unsupported | The bridge does not create ACP client terminals or stream terminal ids through tool calls.                                                                                                                                                       |
| Session plans / thought streaming                                     | Unsupported | The bridge currently emits output text and tool status, not ACP plan or thought updates.                                                                                                                                                         |

## Known Limitations

- `loadSession` replays stored user and assistant text history, but it does not
  reconstruct historic tool calls, system notices, or richer ACP-native event
  types.
- If multiple ACP clients share the same Gateway session key, event and cancel
  routing are best-effort rather than strictly isolated per client. Prefer the
  default isolated `acp:<uuid>` sessions when you need clean editor-local
  turns.
- Gateway stop states are translated into ACP stop reasons, but that mapping is
  less expressive than a fully ACP-native runtime.
- Initial session controls currently surface a focused subset of Gateway knobs:
  thought level, tool verbosity, reasoning, usage detail, and elevated
  actions. Model selection and exec-host controls are not yet exposed as ACP
  config options.
- `session_info_update` and `usage_update` are derived from Gateway session
  snapshots, not live ACP-native runtime accounting. Usage is approximate,
  carries no cost data, and is only emitted when the Gateway marks total token
  data as fresh.
- Tool follow-along data is best-effort. The bridge can surface file paths that
  appear in known tool args/results, but it does not yet emit ACP terminals or
  structured file diffs.

## Usage

```bash
velaclaw acp

# Remote Gateway
velaclaw acp --url wss://gateway-host:18789 --token <token>

# Remote Gateway (token from file)
velaclaw acp --url wss://gateway-host:18789 --token-file ~/.velaclaw/gateway.token

# Attach to an existing session key
velaclaw acp --session agent:main:main

# Attach by label (must already exist)
velaclaw acp --session-label "support inbox"

# Reset the session key before the first prompt
velaclaw acp --session agent:main:main --reset-session
```

## ACP client (debug)

Use the built-in ACP client to sanity-check the bridge without an IDE.
It spawns the ACP bridge and lets you type prompts interactively.

```bash
velaclaw acp client

# Point the spawned bridge at a remote Gateway
velaclaw acp client --server-args --url wss://gateway-host:18789 --token-file ~/.velaclaw/gateway.token

# Override the server command (default: velaclaw)
velaclaw acp client --server "node" --server-args velaclaw.mjs acp --url ws://127.0.0.1:19001
```

Permission model (client debug mode):

- Auto-approval is allowlist-based and only applies to trusted core tool IDs.
- `read` auto-approval is scoped to the current working directory (`--cwd` when set).
- ACP only auto-approves narrow readonly classes: scoped `read` calls under the active cwd plus readonly search tools (`search`, `web_search`, `memory_search`). Unknown/non-core tools, out-of-scope reads, exec-capable tools, control-plane tools, mutating tools, and interactive flows always require explicit prompt approval.
- Server-provided `toolCall.kind` is treated as untrusted metadata (not an authorization source).
- This ACP bridge policy is separate from ACPX harness permissions. If you run Velaclaw through the `acpx` backend, `plugins.entries.acpx.config.permissionMode=approve-all` is the break-glass “yolo” switch for that harness session.

## How to use this

Use ACP when an IDE (or other client) speaks Agent Client Protocol and you want
it to drive an Velaclaw Gateway session.

1. Ensure the Gateway is running (local or remote).
2. Configure the Gateway target (config or flags).
3. Point your IDE to run `velaclaw acp` over stdio.

Example config (persisted):

```bash
velaclaw config set gateway.remote.url wss://gateway-host:18789
velaclaw config set gateway.remote.token <token>
```

Example direct run (no config write):

```bash
velaclaw acp --url wss://gateway-host:18789 --token <token>
# preferred for local process safety
velaclaw acp --url wss://gateway-host:18789 --token-file ~/.velaclaw/gateway.token
```

## Selecting agents

ACP does not pick agents directly. It routes by the Gateway session key.

Use agent-scoped session keys to target a specific agent:

```bash
velaclaw acp --session agent:main:main
velaclaw acp --session agent:design:main
velaclaw acp --session agent:qa:bug-123
```

Each ACP session maps to a single Gateway session key. One agent can have many
sessions; ACP defaults to an isolated `acp:<uuid>` session unless you override
the key or label.

Per-session `mcpServers` are not supported in bridge mode. If an ACP client
sends them during `newSession` or `loadSession`, the bridge returns a clear
error instead of silently ignoring them.

If you want ACPX-backed sessions to see Velaclaw plugin tools, enable the
gateway-side ACPX plugin bridge instead of trying to pass per-session
`mcpServers`. See [ACP Agents](/tools/acp-agents#plugin-tools-mcp-bridge).

## Use from `acpx` (Codex, Claude, other ACP clients)

If you want a coding agent such as Codex or Claude Code to talk to your
Velaclaw bot over ACP, use `acpx` with its built-in `velaclaw` target.

Typical flow:

1. Run the Gateway and make sure the ACP bridge can reach it.
2. Point `acpx velaclaw` at `velaclaw acp`.
3. Target the Velaclaw session key you want the coding agent to use.

Examples:

```bash
# One-shot request into your default Velaclaw ACP session
acpx velaclaw exec "Summarize the active Velaclaw session state."

# Persistent named session for follow-up turns
acpx velaclaw sessions ensure --name codex-bridge
acpx velaclaw -s codex-bridge --cwd /path/to/repo \
  "Ask my Velaclaw work agent for recent context relevant to this repo."
```

If you want `acpx velaclaw` to target a specific Gateway and session key every
time, override the `velaclaw` agent command in `~/.acpx/config.json`:

```json
{
  "agents": {
    "velaclaw": {
      "command": "env VELACLAW_HIDE_BANNER=1 VELACLAW_SUPPRESS_NOTES=1 velaclaw acp --url ws://127.0.0.1:18789 --token-file ~/.velaclaw/gateway.token --session agent:main:main"
    }
  }
}
```

For a repo-local Velaclaw checkout, use the direct CLI entrypoint instead of the
dev runner so the ACP stream stays clean. For example:

```bash
env VELACLAW_HIDE_BANNER=1 VELACLAW_SUPPRESS_NOTES=1 node velaclaw.mjs acp ...
```

This is the easiest way to let Codex, Claude Code, or another ACP-aware client
pull contextual information from an Velaclaw agent without scraping a terminal.

## Zed editor setup

Add a custom ACP agent in `~/.config/zed/settings.json` (or use Zed’s Settings UI):

```json
{
  "agent_servers": {
    "Velaclaw ACP": {
      "type": "custom",
      "command": "velaclaw",
      "args": ["acp"],
      "env": {}
    }
  }
}
```

To target a specific Gateway or agent:

```json
{
  "agent_servers": {
    "Velaclaw ACP": {
      "type": "custom",
      "command": "velaclaw",
      "args": [
        "acp",
        "--url",
        "wss://gateway-host:18789",
        "--token",
        "<token>",
        "--session",
        "agent:design:main"
      ],
      "env": {}
    }
  }
}
```

In Zed, open the Agent panel and select “Velaclaw ACP” to start a thread.

## Session mapping

By default, ACP sessions get an isolated Gateway session key with an `acp:` prefix.
To reuse a known session, pass a session key or label:

- `--session <key>`: use a specific Gateway session key.
- `--session-label <label>`: resolve an existing session by label.
- `--reset-session`: mint a fresh session id for that key (same key, new transcript).

If your ACP client supports metadata, you can override per session:

```json
{
  "_meta": {
    "sessionKey": "agent:main:main",
    "sessionLabel": "support inbox",
    "resetSession": true
  }
}
```

Learn more about session keys at [/concepts/session](/concepts/session).

## Options

- `--url <url>`: Gateway WebSocket URL (defaults to gateway.remote.url when configured).
- `--token <token>`: Gateway auth token.
- `--token-file <path>`: read Gateway auth token from file.
- `--password <password>`: Gateway auth password.
- `--password-file <path>`: read Gateway auth password from file.
- `--session <key>`: default session key.
- `--session-label <label>`: default session label to resolve.
- `--require-existing`: fail if the session key/label does not exist.
- `--reset-session`: reset the session key before first use.
- `--no-prefix-cwd`: do not prefix prompts with the working directory.
- `--provenance <off|meta|meta+receipt>`: include ACP provenance metadata or receipts.
- `--verbose, -v`: verbose logging to stderr.

Security note:

- `--token` and `--password` can be visible in local process listings on some systems.
- Prefer `--token-file`/`--password-file` or environment variables (`VELACLAW_GATEWAY_TOKEN`, `VELACLAW_GATEWAY_PASSWORD`).
- Gateway auth resolution follows the shared contract used by other Gateway clients:
  - local mode: env (`VELACLAW_GATEWAY_*`) -> `gateway.auth.*` -> `gateway.remote.*` fallback only when `gateway.auth.*` is unset (configured-but-unresolved local SecretRefs fail closed)
  - remote mode: `gateway.remote.*` with env/config fallback per remote precedence rules
  - `--url` is override-safe and does not reuse implicit config/env credentials; pass explicit `--token`/`--password` (or file variants)
- ACP runtime backend child processes receive `VELACLAW_SHELL=acp`, which can be used for context-specific shell/profile rules.
- `velaclaw acp client` sets `VELACLAW_SHELL=acp-client` on the spawned bridge process.

### `acp client` options

- `--cwd <dir>`: working directory for the ACP session.
- `--server <command>`: ACP server command (default: `velaclaw`).
- `--server-args <args...>`: extra arguments passed to the ACP server.
- `--server-verbose`: enable verbose logging on the ACP server.
- `--verbose, -v`: verbose client logging.
