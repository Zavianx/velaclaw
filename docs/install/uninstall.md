---
summary: "Uninstall Velaclaw completely (CLI, service, state, workspace)"
read_when:
  - You want to remove Velaclaw from a machine
  - The gateway service is still running after uninstall
title: "Uninstall"
---

# Uninstall

Two paths:

- **Easy path** if `velaclaw` is still installed.
- **Manual service removal** if the CLI is gone but the service is still running.

## Easy path (CLI still installed)

Recommended: use the built-in uninstaller:

```bash
velaclaw uninstall
```

Non-interactive (automation / npx):

```bash
velaclaw uninstall --all --yes --non-interactive
npx -y velaclaw uninstall --all --yes --non-interactive
```

Manual steps (same result):

1. Stop the gateway service:

```bash
velaclaw gateway stop
```

2. Uninstall the gateway service (launchd/systemd/schtasks):

```bash
velaclaw gateway uninstall
```

3. Delete state + config:

```bash
rm -rf "${VELACLAW_STATE_DIR:-$HOME/.velaclaw}"
```

If you set `VELACLAW_CONFIG_PATH` to a custom location outside the state dir, delete that file too.

4. Delete your workspace (optional, removes agent files):

```bash
rm -rf ~/.velaclaw/workspace
```

5. Remove the CLI install (pick the one you used):

```bash
npm rm -g velaclaw
pnpm remove -g velaclaw
bun remove -g velaclaw
```

6. If you installed the macOS app:

```bash
rm -rf /Applications/Velaclaw.app
```

Notes:

- If you used profiles (`--profile` / `VELACLAW_PROFILE`), repeat step 3 for each state dir (defaults are `~/.velaclaw-<profile>`).
- In remote mode, the state dir lives on the **gateway host**, so run steps 1-4 there too.

## Manual service removal (CLI not installed)

Use this if the gateway service keeps running but `velaclaw` is missing.

### macOS (launchd)

Default label is `ai.velaclaw.gateway` (or `ai.velaclaw.<profile>`; legacy `com.velaclaw.*` may still exist):

```bash
launchctl bootout gui/$UID/ai.velaclaw.gateway
rm -f ~/Library/LaunchAgents/ai.velaclaw.gateway.plist
```

If you used a profile, replace the label and plist name with `ai.velaclaw.<profile>`. Remove any legacy `com.velaclaw.*` plists if present.

### Linux (systemd user unit)

Default unit name is `velaclaw-gateway.service` (or `velaclaw-gateway-<profile>.service`):

```bash
systemctl --user disable --now velaclaw-gateway.service
rm -f ~/.config/systemd/user/velaclaw-gateway.service
systemctl --user daemon-reload
```

### Windows (Scheduled Task)

Default task name is `Velaclaw Gateway` (or `Velaclaw Gateway (<profile>)`).
The task script lives under your state dir.

```powershell
schtasks /Delete /F /TN "Velaclaw Gateway"
Remove-Item -Force "$env:USERPROFILE\.velaclaw\gateway.cmd"
```

If you used a profile, delete the matching task name and `~\.velaclaw-<profile>\gateway.cmd`.

## Normal install vs source checkout

### Normal install (install.sh / npm / pnpm / bun)

If you used `https://velaclaw.ai/install.sh` or `install.ps1`, the CLI was installed with `npm install -g velaclaw@latest`.
Remove it with `npm rm -g velaclaw` (or `pnpm remove -g` / `bun remove -g` if you installed that way).

### Source checkout (git clone)

If you run from a repo checkout (`git clone` + `velaclaw ...` / `bun run velaclaw ...`):

1. Uninstall the gateway service **before** deleting the repo (use the easy path above or manual service removal).
2. Delete the repo directory.
3. Remove state + workspace as shown above.
