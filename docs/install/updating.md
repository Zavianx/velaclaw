---
summary: "Updating Velaclaw safely (global install or source), plus rollback strategy"
read_when:
  - Updating Velaclaw
  - Something breaks after an update
title: "Updating"
---

# Updating

Keep Velaclaw up to date.

## Recommended: `velaclaw update`

The fastest way to update. It detects your install type (npm or git), fetches the latest version, runs `velaclaw doctor`, and restarts the gateway.

```bash
velaclaw update
```

To switch channels or target a specific version:

```bash
velaclaw update --channel beta
velaclaw update --tag main
velaclaw update --dry-run   # preview without applying
```

`--channel beta` prefers beta, but the runtime falls back to stable/latest when
the beta tag is missing or older than the latest stable release. Use `--tag beta`
if you want the raw npm beta dist-tag for a one-off package update.

See [Development channels](/install/development-channels) for channel semantics.

## How install type affects updates

Velaclaw can update in-place when the original install is still discoverable:

- **npm/pnpm/bun global install**: `velaclaw update` reinstalls the global `velaclaw` package from the configured channel.
- **Git/source install**: `velaclaw update` updates the checkout, rebuilds it, and keeps the global wrapper pointed at that checkout.
- **Container install**: `velaclaw update` does not update the running image. Rebuild or pull the image, then restart the container.

For source installs, use a real git clone with an upstream branch. A raw GitHub
zip/tarball or manually copied source directory cannot be updated safely because
there is no remote branch to fetch from.

If a checkout has no branch upstream but does have `origin/main`, the updater
uses `origin/main` as a safe fallback.

### Repair an older source install

If `velaclaw update` reports `no-upstream`, fix the checkout once:

```bash
cd ~/velaclaw
git remote set-url origin https://github.com/Zavianx/velaclaw.git
git fetch origin
git checkout main
git branch --set-upstream-to=origin/main main
velaclaw update
```

If your old install was not a git checkout at all, switch it to the managed git
install path:

```bash
curl -fsSL https://velaclaw.ai/install.sh | bash -s -- --install-method git --no-onboard
```

## Alternative: re-run the installer

```bash
curl -fsSL https://velaclaw.ai/install.sh | bash
```

Add `--no-onboard` to skip onboarding. For source installs, pass `--install-method git --no-onboard`.

## Alternative: manual npm, pnpm, or bun

```bash
npm i -g velaclaw@latest
```

```bash
pnpm add -g velaclaw@latest
```

```bash
bun add -g velaclaw@latest
```

## Auto-updater

The auto-updater is off by default. Enable it in `~/.Zavianx/velaclaw-dev.json`:

```json5
{
  update: {
    channel: "stable",
    auto: {
      enabled: true,
      stableDelayHours: 6,
      stableJitterHours: 12,
      betaCheckIntervalHours: 1,
    },
  },
}
```

| Channel  | Behavior                                                                                                      |
| -------- | ------------------------------------------------------------------------------------------------------------- |
| `stable` | Waits `stableDelayHours`, then applies with deterministic jitter across `stableJitterHours` (spread rollout). |
| `beta`   | Checks every `betaCheckIntervalHours` (default: hourly) and applies immediately.                              |
| `dev`    | No automatic apply. Use `velaclaw update` manually.                                                           |

The gateway also logs an update hint on startup (disable with `update.checkOnStart: false`).

## After updating

<Steps>

### Run doctor

```bash
velaclaw doctor
```

Migrates config, audits DM policies, and checks gateway health. Details: [Doctor](/gateway/doctor)

### Restart the gateway

```bash
velaclaw gateway restart
```

### Verify

```bash
velaclaw health
```

</Steps>

## Rollback

### Pin a version (npm)

```bash
npm i -g velaclaw@<version>
velaclaw doctor
velaclaw gateway restart
```

Tip: `npm view velaclaw version` shows the current published version.

### Pin a commit (source)

```bash
git fetch origin
git checkout "$(git rev-list -n 1 --before=\"2026-01-01\" origin/main)"
pnpm install && pnpm build
velaclaw gateway restart
```

To return to latest: `git checkout main && git pull`.

## If you are stuck

- Run `velaclaw doctor` again and read the output carefully.
- For `velaclaw update --channel dev` on source checkouts, the updater auto-bootstraps `pnpm` when needed. If you see a pnpm/corepack bootstrap error, install `pnpm` manually (or re-enable `corepack`) and rerun the update.
- Check: [Troubleshooting](/gateway/troubleshooting)
- Ask in Discord: [https://discord.gg/clawd](https://discord.gg/clawd)

## Related

- [Install Overview](/install) — all installation methods
- [Doctor](/gateway/doctor) — health checks after updates
- [Migrating](/install/migrating) — major version migration guides
