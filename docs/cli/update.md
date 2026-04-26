---
summary: "CLI reference for `velaclaw update` (safe-ish source update + gateway auto-restart)"
read_when:
  - You want to update a source checkout safely
  - You need to understand `--update` shorthand behavior
title: "update"
---

# `velaclaw update`

Safely update Velaclaw and switch between stable/beta/dev channels.

If you installed via **npm/pnpm/bun** (global install, no git metadata),
updates happen via the package-manager flow in [Updating](/install/updating).

## Usage

```bash
velaclaw update
velaclaw update status
velaclaw update wizard
velaclaw update --channel beta
velaclaw update --channel dev
velaclaw update --tag beta
velaclaw update --tag main
velaclaw update --dry-run
velaclaw update --no-restart
velaclaw update --yes
velaclaw update --json
velaclaw --update
```

## Options

- `--no-restart`: skip restarting the Gateway service after a successful update.
- `--channel <stable|beta|dev>`: set the update channel (git + npm; persisted in config).
- `--tag <dist-tag|version|spec>`: override the package target for this update only. For package installs, `main` maps to `github:Zavianx/velaclaw#main`.
- `--dry-run`: preview planned update actions (channel/tag/target/restart flow) without writing config, installing, syncing plugins, or restarting.
- `--json`: print machine-readable `UpdateRunResult` JSON.
- `--timeout <seconds>`: per-step timeout (default is 1200s).
- `--yes`: skip confirmation prompts (for example downgrade confirmation)

Note: downgrades require confirmation because older versions can break configuration.

## `update status`

Show the active update channel + git tag/branch/SHA (for source checkouts), plus update availability.

```bash
velaclaw update status
velaclaw update status --json
velaclaw update status --timeout 10
```

Options:

- `--json`: print machine-readable status JSON.
- `--timeout <seconds>`: timeout for checks (default is 3s).

## `update wizard`

Interactive flow to pick an update channel and confirm whether to restart the Gateway
after updating (default is to restart). If you select `dev` without a git checkout, it
offers to create one.

Options:

- `--timeout <seconds>`: timeout for each update step (default `1200`)

## What it does

When you switch channels explicitly (`--channel ...`), Velaclaw also keeps the
install method aligned:

- `dev` → ensures a git checkout (default: `~/velaclaw`, override with `VELACLAW_GIT_DIR`),
  updates it, and installs the global CLI from that checkout.
- `stable` → installs from npm using `latest`.
- `beta` → prefers npm dist-tag `beta`, but falls back to `latest` when beta is
  missing or older than the current stable release.

The Gateway core auto-updater (when enabled via config) reuses this same update path.

## Git checkout flow

Channels:

- `stable`: checkout the latest non-beta tag, then build + doctor.
- `beta`: prefer the latest `-beta` tag, but fall back to the latest stable tag
  when beta is missing or older.
- `dev`: checkout `main`, then fetch + rebase.

High-level:

1. Requires a clean worktree (no uncommitted changes).
2. Switches to the selected channel (tag or branch).
3. Fetches upstream (dev only).
4. Dev only: preflight lint + TypeScript build in a temp worktree; if the tip fails, walks back up to 10 commits to find the newest clean build.
5. Rebases onto the selected commit (dev only).
6. Installs deps with the repo package manager. For pnpm checkouts, the updater bootstraps `pnpm` on demand (via `corepack` first, then a temporary `npm install pnpm@10` fallback) instead of running `npm run build` inside a pnpm workspace.
7. Builds + builds the Control UI.
8. Runs `velaclaw doctor` as the final “safe update” check.
9. Syncs plugins to the active channel (dev uses bundled extensions; stable/beta uses npm) and updates npm-installed plugins.

If pnpm bootstrap still fails, the updater now stops early with a package-manager-specific error instead of trying `npm run build` inside the checkout.

## Source checkout requirements

Git/source updates require a checkout with a configured upstream branch. If the
source tree came from a GitHub zip/tarball or was copied by hand, `velaclaw update`
cannot infer where to fetch new commits from.

When a checkout has `origin/main` but no branch upstream, the updater uses
`origin/main` as a fallback.

Repair an older checkout with:

```bash
cd ~/velaclaw
git remote set-url origin https://github.com/Zavianx/velaclaw.git
git fetch origin
git checkout main
git branch --set-upstream-to=origin/main main
```

## `--update` shorthand

`velaclaw --update` rewrites to `velaclaw update` (useful for shells and launcher scripts).

## See also

- `velaclaw doctor` (offers to run update first on git checkouts)
- [Development channels](/install/development-channels)
- [Updating](/install/updating)
- [CLI reference](/cli)
