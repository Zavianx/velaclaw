---
summary: "CLI reference for `velaclaw browser` (lifecycle, profiles, tabs, actions, state, and debugging)"
read_when:
  - You use `velaclaw browser` and want examples for common tasks
  - You want to control a browser running on another machine via a node host
  - You want to attach to your local signed-in Chrome via Chrome MCP
title: "browser"
---

# `velaclaw browser`

Manage Velaclaw's browser control surface and run browser actions (lifecycle, profiles, tabs, snapshots, screenshots, navigation, input, state emulation, and debugging).

Related:

- Browser tool + API: [Browser tool](/tools/browser)

## Common flags

- `--url <gatewayWsUrl>`: Gateway WebSocket URL (defaults to config).
- `--token <token>`: Gateway token (if required).
- `--timeout <ms>`: request timeout (ms).
- `--expect-final`: wait for a final Gateway response.
- `--browser-profile <name>`: choose a browser profile (default from config).
- `--json`: machine-readable output (where supported).

## Quick start (local)

```bash
velaclaw browser profiles
velaclaw browser --browser-profile velaclaw start
velaclaw browser --browser-profile velaclaw open https://example.com
velaclaw browser --browser-profile velaclaw snapshot
```

## Quick troubleshooting

If `start` fails with `not reachable after start`, troubleshoot CDP readiness first. If `start` and `tabs` succeed but `open` or `navigate` fails, the browser control plane is healthy and the failure is usually navigation SSRF policy.

Minimal sequence:

```bash
velaclaw browser --browser-profile velaclaw start
velaclaw browser --browser-profile velaclaw tabs
velaclaw browser --browser-profile velaclaw open https://example.com
```

Detailed guidance: [Browser troubleshooting](/tools/browser#cdp-startup-failure-vs-navigation-ssrf-block)

## Lifecycle

```bash
velaclaw browser status
velaclaw browser start
velaclaw browser stop
velaclaw browser --browser-profile velaclaw reset-profile
```

Notes:

- For `attachOnly` and remote CDP profiles, `velaclaw browser stop` closes the
  active control session and clears temporary emulation overrides even when
  Velaclaw did not launch the browser process itself.
- For local managed profiles, `velaclaw browser stop` stops the spawned browser
  process.

## If the command is missing

If `velaclaw browser` is an unknown command, check `plugins.allow` in
`~/.Zavianx/velaclaw-dev.json`.

When `plugins.allow` is present, the bundled browser plugin must be listed
explicitly:

```json5
{
  plugins: {
    allow: ["telegram", "browser"],
  },
}
```

`browser.enabled=true` does not restore the CLI subcommand when the plugin
allowlist excludes `browser`.

Related: [Browser tool](/tools/browser#missing-browser-command-or-tool)

## Profiles

Profiles are named browser routing configs. In practice:

- `velaclaw`: launches or attaches to a dedicated Velaclaw-managed Chrome instance (isolated user data dir).
- `user`: controls your existing signed-in Chrome session via Chrome DevTools MCP.
- custom CDP profiles: point at a local or remote CDP endpoint.

```bash
velaclaw browser profiles
velaclaw browser create-profile --name work --color "#FF5A36"
velaclaw browser create-profile --name chrome-live --driver existing-session
velaclaw browser create-profile --name remote --cdp-url https://browser-host.example.com
velaclaw browser delete-profile --name work
```

Use a specific profile:

```bash
velaclaw browser --browser-profile work tabs
```

## Tabs

```bash
velaclaw browser tabs
velaclaw browser tab new
velaclaw browser tab select 2
velaclaw browser tab close 2
velaclaw browser open https://docs.velaclaw.ai
velaclaw browser focus <targetId>
velaclaw browser close <targetId>
```

## Snapshot / screenshot / actions

Snapshot:

```bash
velaclaw browser snapshot
```

Screenshot:

```bash
velaclaw browser screenshot
velaclaw browser screenshot --full-page
velaclaw browser screenshot --ref e12
```

Notes:

- `--full-page` is for page captures only; it cannot be combined with `--ref`
  or `--element`.
- `existing-session` / `user` profiles support page screenshots and `--ref`
  screenshots from snapshot output, but not CSS `--element` screenshots.

Navigate/click/type (ref-based UI automation):

```bash
velaclaw browser navigate https://example.com
velaclaw browser click <ref>
velaclaw browser type <ref> "hello"
velaclaw browser press Enter
velaclaw browser hover <ref>
velaclaw browser scrollintoview <ref>
velaclaw browser drag <startRef> <endRef>
velaclaw browser select <ref> OptionA OptionB
velaclaw browser fill --fields '[{"ref":"1","value":"Ada"}]'
velaclaw browser wait --text "Done"
velaclaw browser evaluate --fn '(el) => el.textContent' --ref <ref>
```

File + dialog helpers:

```bash
velaclaw browser upload /tmp/velaclaw/uploads/file.pdf --ref <ref>
velaclaw browser waitfordownload
velaclaw browser download <ref> report.pdf
velaclaw browser dialog --accept
```

## State and storage

Viewport + emulation:

```bash
velaclaw browser resize 1280 720
velaclaw browser set viewport 1280 720
velaclaw browser set offline on
velaclaw browser set media dark
velaclaw browser set timezone Europe/London
velaclaw browser set locale en-GB
velaclaw browser set geo 51.5074 -0.1278 --accuracy 25
velaclaw browser set device "iPhone 14"
velaclaw browser set headers '{"x-test":"1"}'
velaclaw browser set credentials myuser mypass
```

Cookies + storage:

```bash
velaclaw browser cookies
velaclaw browser cookies set session abc123 --url https://example.com
velaclaw browser cookies clear
velaclaw browser storage local get
velaclaw browser storage local set token abc123
velaclaw browser storage session clear
```

## Debugging

```bash
velaclaw browser console --level error
velaclaw browser pdf
velaclaw browser responsebody "**/api"
velaclaw browser highlight <ref>
velaclaw browser errors --clear
velaclaw browser requests --filter api
velaclaw browser trace start
velaclaw browser trace stop --out trace.zip
```

## Existing Chrome via MCP

Use the built-in `user` profile, or create your own `existing-session` profile:

```bash
velaclaw browser --browser-profile user tabs
velaclaw browser create-profile --name chrome-live --driver existing-session
velaclaw browser create-profile --name brave-live --driver existing-session --user-data-dir "~/Library/Application Support/BraveSoftware/Brave-Browser"
velaclaw browser --browser-profile chrome-live tabs
```

This path is host-only. For Docker, headless servers, Browserless, or other remote setups, use a CDP profile instead.

Current existing-session limits:

- snapshot-driven actions use refs, not CSS selectors
- `click` is left-click only
- `type` does not support `slowly=true`
- `press` does not support `delayMs`
- `hover`, `scrollintoview`, `drag`, `select`, `fill`, and `evaluate` reject
  per-call timeout overrides
- `select` supports one value only
- `wait --load networkidle` is not supported
- file uploads require `--ref` / `--input-ref`, do not support CSS
  `--element`, and currently support one file at a time
- dialog hooks do not support `--timeout`
- screenshots support page captures and `--ref`, but not CSS `--element`
- `responsebody`, download interception, PDF export, and batch actions still
  require a managed browser or raw CDP profile

## Remote browser control (node host proxy)

If the Gateway runs on a different machine than the browser, run a **node host** on the machine that has Chrome/Brave/Edge/Chromium. The Gateway will proxy browser actions to that node (no separate browser control server required).

Use `gateway.nodes.browser.mode` to control auto-routing and `gateway.nodes.browser.node` to pin a specific node if multiple are connected.

Security + remote setup: [Browser tool](/tools/browser), [Remote access](/gateway/remote), [Tailscale](/gateway/tailscale), [Security](/gateway/security)
