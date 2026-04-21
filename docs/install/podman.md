---
summary: "Run Velaclaw in a rootless Podman container"
read_when:
  - You want a containerized gateway with Podman instead of Docker
title: "Podman"
---

# Podman

Run the Velaclaw Gateway in a rootless Podman container, managed by your current non-root user.

The intended model is:

- Podman runs the gateway container.
- Your host `velaclaw` CLI is the control plane.
- Persistent state lives on the host under `~/.velaclaw` by default.
- Day-to-day management uses `velaclaw --container <name> ...` instead of `sudo -u velaclaw`, `podman exec`, or a separate service user.

## Prerequisites

- **Podman** in rootless mode
- **Velaclaw CLI** installed on the host
- **Optional:** `systemd --user` if you want Quadlet-managed auto-start
- **Optional:** `sudo` only if you want `loginctl enable-linger "$(whoami)"` for boot persistence on a headless host

## Quick start

<Steps>
  <Step title="One-time setup">
    From the repo root, run `./scripts/podman/setup.sh`.
  </Step>

  <Step title="Start the Gateway container">
    Start the container with `./scripts/run-velaclaw-podman.sh launch`.
  </Step>

  <Step title="Run onboarding inside the container">
    Run `./scripts/run-velaclaw-podman.sh launch setup`, then open `http://127.0.0.1:18789/`.
  </Step>

  <Step title="Manage the running container from the host CLI">
    Set `VELACLAW_CONTAINER=velaclaw`, then use normal `velaclaw` commands from the host.
  </Step>
</Steps>

Setup details:

- `./scripts/podman/setup.sh` builds `velaclaw:local` in your rootless Podman store by default, or uses `VELACLAW_IMAGE` / `VELACLAW_PODMAN_IMAGE` if you set one.
- It creates `~/.Zavianx/velaclaw-dev.json` with `gateway.mode: "local"` if missing.
- It creates `~/.velaclaw/.env` with `VELACLAW_GATEWAY_TOKEN` if missing.
- For manual launches, the helper reads only a small allowlist of Podman-related keys from `~/.velaclaw/.env` and passes explicit runtime env vars to the container; it does not hand the full env file to Podman.

Quadlet-managed setup:

```bash
./scripts/podman/setup.sh --quadlet
```

Quadlet is a Linux-only option because it depends on systemd user services.

You can also set `VELACLAW_PODMAN_QUADLET=1`.

Optional build/setup env vars:

- `VELACLAW_IMAGE` or `VELACLAW_PODMAN_IMAGE` -- use an existing/pulled image instead of building `velaclaw:local`
- `VELACLAW_DOCKER_APT_PACKAGES` -- install extra apt packages during image build
- `VELACLAW_EXTENSIONS` -- pre-install extension dependencies at build time

Container start:

```bash
./scripts/run-velaclaw-podman.sh launch
```

The script starts the container as your current uid/gid with `--userns=keep-id` and bind-mounts your Velaclaw state into the container.

Onboarding:

```bash
./scripts/run-velaclaw-podman.sh launch setup
```

Then open `http://127.0.0.1:18789/` and use the token from `~/.velaclaw/.env`.

Host CLI default:

```bash
export VELACLAW_CONTAINER=velaclaw
```

Then commands such as these will run inside that container automatically:

```bash
velaclaw dashboard --no-open
velaclaw gateway status --deep   # includes extra service scan
velaclaw doctor
velaclaw channels login
```

On macOS, Podman machine may make the browser appear non-local to the gateway.
If the Control UI reports device-auth errors after launch, use the Tailscale guidance in
[Podman + Tailscale](#podman--tailscale).

<a id="podman--tailscale"></a>

## Podman + Tailscale

For HTTPS or remote browser access, follow the main Tailscale docs.

Podman-specific note:

- Keep the Podman publish host at `127.0.0.1`.
- Prefer host-managed `tailscale serve` over `velaclaw gateway --tailscale serve`.
- On macOS, if local browser device-auth context is unreliable, use Tailscale access instead of ad hoc local tunnel workarounds.

See:

- [Tailscale](/gateway/tailscale)
- [Control UI](/web/control-ui)

## Systemd (Quadlet, optional)

If you ran `./scripts/podman/setup.sh --quadlet`, setup installs a Quadlet file at:

```bash
~/.config/containers/systemd/velaclaw.container
```

Useful commands:

- **Start:** `systemctl --user start velaclaw.service`
- **Stop:** `systemctl --user stop velaclaw.service`
- **Status:** `systemctl --user status velaclaw.service`
- **Logs:** `journalctl --user -u velaclaw.service -f`

After editing the Quadlet file:

```bash
systemctl --user daemon-reload
systemctl --user restart velaclaw.service
```

For boot persistence on SSH/headless hosts, enable lingering for your current user:

```bash
sudo loginctl enable-linger "$(whoami)"
```

## Config, env, and storage

- **Config dir:** `~/.velaclaw`
- **Workspace dir:** `~/.velaclaw/workspace`
- **Token file:** `~/.velaclaw/.env`
- **Launch helper:** `./scripts/run-velaclaw-podman.sh`

The launch script and Quadlet bind-mount host state into the container:

- `VELACLAW_CONFIG_DIR` -> `/home/node/.velaclaw`
- `VELACLAW_WORKSPACE_DIR` -> `/home/node/.velaclaw/workspace`

By default those are host directories, not anonymous container state, so
`velaclaw.json`, per-agent `auth-profiles.json`, channel/provider state,
sessions, and workspace survive container replacement.
The Podman setup also seeds `gateway.controlUi.allowedOrigins` for `127.0.0.1` and `localhost` on the published gateway port so the local dashboard works with the container's non-loopback bind.

Useful env vars for the manual launcher:

- `VELACLAW_PODMAN_CONTAINER` -- container name (`velaclaw` by default)
- `VELACLAW_PODMAN_IMAGE` / `VELACLAW_IMAGE` -- image to run
- `VELACLAW_PODMAN_GATEWAY_HOST_PORT` -- host port mapped to container `18789`
- `VELACLAW_PODMAN_BRIDGE_HOST_PORT` -- host port mapped to container `18790`
- `VELACLAW_PODMAN_PUBLISH_HOST` -- host interface for published ports; default is `127.0.0.1`
- `VELACLAW_GATEWAY_BIND` -- gateway bind mode inside the container; default is `lan`
- `VELACLAW_PODMAN_USERNS` -- `keep-id` (default), `auto`, or `host`

The manual launcher reads `~/.velaclaw/.env` before finalizing container/image defaults, so you can persist these there.

If you use a non-default `VELACLAW_CONFIG_DIR` or `VELACLAW_WORKSPACE_DIR`, set the same variables for both `./scripts/podman/setup.sh` and later `./scripts/run-velaclaw-podman.sh launch` commands. The repo-local launcher does not persist custom path overrides across shells.

Quadlet note:

- The generated Quadlet service intentionally keeps a fixed, hardened default shape: `127.0.0.1` published ports, `--bind lan` inside the container, and `keep-id` user namespace.
- It pins `VELACLAW_NO_RESPAWN=1`, `Restart=on-failure`, and `TimeoutStartSec=300`.
- It publishes both `127.0.0.1:18789:18789` (gateway) and `127.0.0.1:18790:18790` (bridge).
- It reads `~/.velaclaw/.env` as a runtime `EnvironmentFile` for values such as `VELACLAW_GATEWAY_TOKEN`, but it does not consume the manual launcher's Podman-specific override allowlist.
- If you need custom publish ports, publish host, or other container-run flags, use the manual launcher or edit `~/.config/containers/systemd/velaclaw.container` directly, then reload and restart the service.

## Useful commands

- **Container logs:** `podman logs -f velaclaw`
- **Stop container:** `podman stop velaclaw`
- **Remove container:** `podman rm -f velaclaw`
- **Open dashboard URL from host CLI:** `velaclaw dashboard --no-open`
- **Health/status via host CLI:** `velaclaw gateway status --deep` (RPC probe + extra
  service scan)

## Troubleshooting

- **Permission denied (EACCES) on config or workspace:** The container runs with `--userns=keep-id` and `--user <your uid>:<your gid>` by default. Ensure the host config/workspace paths are owned by your current user.
- **Gateway start blocked (missing `gateway.mode=local`):** Ensure `~/.Zavianx/velaclaw-dev.json` exists and sets `gateway.mode="local"`. `scripts/podman/setup.sh` creates this if missing.
- **Container CLI commands hit the wrong target:** Use `velaclaw --container <name> ...` explicitly, or export `VELACLAW_CONTAINER=<name>` in your shell.
- **`velaclaw update` fails with `--container`:** Expected. Rebuild/pull the image, then restart the container or the Quadlet service.
- **Quadlet service does not start:** Run `systemctl --user daemon-reload`, then `systemctl --user start velaclaw.service`. On headless systems you may also need `sudo loginctl enable-linger "$(whoami)"`.
- **SELinux blocks bind mounts:** Leave the default mount behavior alone; the launcher auto-adds `:Z` on Linux when SELinux is enforcing or permissive.

## Related

- [Docker](/install/docker)
- [Gateway background process](/gateway/background-process)
- [Gateway troubleshooting](/gateway/troubleshooting)
