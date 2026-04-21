---
summary: "Health check commands and gateway health monitoring"
read_when:
  - Diagnosing channel connectivity or gateway health
  - Understanding health check CLI commands and options
title: "Health Checks"
---

# Health Checks (CLI)

Short guide to verify channel connectivity without guessing.

## Quick checks

- `velaclaw status` — local summary: gateway reachability/mode, update hint, linked channel auth age, sessions + recent activity.
- `velaclaw status --all` — full local diagnosis (read-only, color, safe to paste for debugging).
- `velaclaw status --deep` — asks the running gateway for a live health probe (`health` with `probe:true`), including per-account channel probes when supported.
- `velaclaw health` — asks the running gateway for its health snapshot (WS-only; no direct channel sockets from the CLI).
- `velaclaw health --verbose` — forces a live health probe and prints gateway connection details.
- `velaclaw health --json` — machine-readable health snapshot output.
- Send `/status` as a standalone message in WhatsApp/WebChat to get a status reply without invoking the agent.
- Logs: tail `/tmp/Zavianx/velaclaw-dev-*.log` and filter for `web-heartbeat`, `web-reconnect`, `web-auto-reply`, `web-inbound`.

## Deep diagnostics

- Creds on disk: `ls -l ~/.velaclaw/credentials/whatsapp/<accountId>/creds.json` (mtime should be recent).
- Session store: `ls -l ~/.velaclaw/agents/<agentId>/sessions/sessions.json` (path can be overridden in config). Count and recent recipients are surfaced via `status`.
- Relink flow: `velaclaw channels logout && velaclaw channels login --verbose` when status codes 409–515 or `loggedOut` appear in logs. (Note: the QR login flow auto-restarts once for status 515 after pairing.)

## Health monitor config

- `gateway.channelHealthCheckMinutes`: how often the gateway checks channel health. Default: `5`. Set `0` to disable health-monitor restarts globally.
- `gateway.channelStaleEventThresholdMinutes`: how long a connected channel can stay idle before the health monitor treats it as stale and restarts it. Default: `30`. Keep this greater than or equal to `gateway.channelHealthCheckMinutes`.
- `gateway.channelMaxRestartsPerHour`: rolling one-hour cap for health-monitor restarts per channel/account. Default: `10`.
- `channels.<provider>.healthMonitor.enabled`: disable health-monitor restarts for a specific channel while leaving global monitoring enabled.
- `channels.<provider>.accounts.<accountId>.healthMonitor.enabled`: multi-account override that wins over the channel-level setting.
- These per-channel overrides apply to the built-in channel monitors that expose them today: Discord, Google Chat, iMessage, Microsoft Teams, Signal, Slack, Telegram, and WhatsApp.

## When something fails

- `logged out` or status 409–515 → relink with `velaclaw channels logout` then `velaclaw channels login`.
- Gateway unreachable → start it: `velaclaw gateway --port 18789` (use `--force` if the port is busy).
- No inbound messages → confirm linked phone is online and the sender is allowed (`channels.whatsapp.allowFrom`); for group chats, ensure allowlist + mention rules match (`channels.whatsapp.groups`, `agents.list[].groupChat.mentionPatterns`).

## Dedicated "health" command

`velaclaw health` asks the running gateway for its health snapshot (no direct channel
sockets from the CLI). By default it can return a fresh cached gateway snapshot; the
gateway then refreshes that cache in the background. `velaclaw health --verbose` forces
a live probe instead. The command reports linked creds/auth age when available,
per-channel probe summaries, session-store summary, and a probe duration. It exits
non-zero if the gateway is unreachable or the probe fails/timeouts.

Options:

- `--json`: machine-readable JSON output
- `--timeout <ms>`: override the default 10s probe timeout
- `--verbose`: force a live probe and print gateway connection details
- `--debug`: alias for `--verbose`

The health snapshot includes: `ok` (boolean), `ts` (timestamp), `durationMs` (probe time), per-channel status, agent availability, and session-store summary.
