#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
source "$ROOT_DIR/scripts/lib/live-docker-auth.sh"
IMAGE_NAME="${VELACLAW_IMAGE:-velaclaw:local}"
LIVE_IMAGE_NAME="${VELACLAW_LIVE_IMAGE:-${IMAGE_NAME}-live}"
CONFIG_DIR="${VELACLAW_CONFIG_DIR:-$HOME/.velaclaw}"
WORKSPACE_DIR="${VELACLAW_WORKSPACE_DIR:-$HOME/.velaclaw/workspace}"
PROFILE_FILE="${VELACLAW_PROFILE_FILE:-$HOME/.profile}"
CLI_TOOLS_DIR="${VELACLAW_DOCKER_CLI_TOOLS_DIR:-$HOME/.cache/velaclaw/docker-cli-tools}"
ACP_AGENT_LIST_RAW="${VELACLAW_LIVE_ACP_BIND_AGENTS:-${VELACLAW_LIVE_ACP_BIND_AGENT:-claude,codex,gemini}}"

velaclaw_live_acp_bind_resolve_auth_provider() {
  case "${1:-}" in
    claude) printf '%s\n' "claude-cli" ;;
    codex) printf '%s\n' "codex-cli" ;;
    gemini) printf '%s\n' "google-gemini-cli" ;;
    *)
      echo "Unsupported VELACLAW_LIVE_ACP_BIND agent: ${1:-} (expected claude, codex, or gemini)" >&2
      return 1
      ;;
  esac
}

velaclaw_live_acp_bind_resolve_agent_command() {
  case "${1:-}" in
    claude) printf '%s' "${VELACLAW_LIVE_ACP_BIND_AGENT_COMMAND_CLAUDE:-${VELACLAW_LIVE_ACP_BIND_AGENT_COMMAND:-}}" ;;
    codex) printf '%s' "${VELACLAW_LIVE_ACP_BIND_AGENT_COMMAND_CODEX:-${VELACLAW_LIVE_ACP_BIND_AGENT_COMMAND:-}}" ;;
    gemini) printf '%s' "${VELACLAW_LIVE_ACP_BIND_AGENT_COMMAND_GEMINI:-${VELACLAW_LIVE_ACP_BIND_AGENT_COMMAND:-}}" ;;
    *) return 1 ;;
  esac
}

mkdir -p "$CLI_TOOLS_DIR"

PROFILE_MOUNT=()
if [[ -f "$PROFILE_FILE" ]]; then
  PROFILE_MOUNT=(-v "$PROFILE_FILE":/home/node/.profile:ro)
fi

read -r -d '' LIVE_TEST_CMD <<'EOF' || true
set -euo pipefail
[ -f "$HOME/.profile" ] && source "$HOME/.profile" || true
export PATH="$HOME/.npm-global/bin:$PATH"
IFS=',' read -r -a auth_dirs <<<"${VELACLAW_DOCKER_AUTH_DIRS_RESOLVED:-}"
IFS=',' read -r -a auth_files <<<"${VELACLAW_DOCKER_AUTH_FILES_RESOLVED:-}"
if ((${#auth_dirs[@]} > 0)); then
  for auth_dir in "${auth_dirs[@]}"; do
    [ -n "$auth_dir" ] || continue
    if [ -d "/host-auth/$auth_dir" ]; then
      mkdir -p "$HOME/$auth_dir"
      cp -R "/host-auth/$auth_dir/." "$HOME/$auth_dir"
      chmod -R u+rwX "$HOME/$auth_dir" || true
    fi
  done
fi
if ((${#auth_files[@]} > 0)); then
  for auth_file in "${auth_files[@]}"; do
    [ -n "$auth_file" ] || continue
    if [ -f "/host-auth-files/$auth_file" ]; then
      mkdir -p "$(dirname "$HOME/$auth_file")"
      cp "/host-auth-files/$auth_file" "$HOME/$auth_file"
      chmod u+rw "$HOME/$auth_file" || true
    fi
  done
fi
agent="${VELACLAW_LIVE_ACP_BIND_AGENT:-claude}"
case "$agent" in
  claude)
    if [ ! -x "$HOME/.npm-global/bin/claude" ]; then
      npm_config_prefix="$HOME/.npm-global" npm install -g @anthropic-ai/claude-code
    fi
    real_claude="$HOME/.npm-global/bin/claude-real"
    if [ ! -x "$real_claude" ] && [ -x "$HOME/.npm-global/bin/claude" ]; then
      mv "$HOME/.npm-global/bin/claude" "$real_claude"
    fi
    if [ -x "$real_claude" ]; then
      cat > "$HOME/.npm-global/bin/claude" <<WRAP
#!/usr/bin/env bash
script_dir="\$(CDPATH= cd -- "\$(dirname -- "\$0")" && pwd)"
if [ -n "\${VELACLAW_LIVE_ACP_BIND_ANTHROPIC_API_KEY:-}" ]; then
  export ANTHROPIC_API_KEY="\${VELACLAW_LIVE_ACP_BIND_ANTHROPIC_API_KEY}"
fi
if [ -n "\${VELACLAW_LIVE_ACP_BIND_ANTHROPIC_API_KEY_OLD:-}" ]; then
  export ANTHROPIC_API_KEY_OLD="\${VELACLAW_LIVE_ACP_BIND_ANTHROPIC_API_KEY_OLD}"
fi
exec "\$script_dir/claude-real" "\$@"
WRAP
      chmod +x "$HOME/.npm-global/bin/claude"
    fi
    claude auth status || true
    ;;
  codex)
    if [ ! -x "$HOME/.npm-global/bin/codex" ]; then
      npm_config_prefix="$HOME/.npm-global" npm install -g @openai/codex
    fi
    ;;
  gemini)
    mkdir -p "$HOME/.gemini"
    if [ ! -x "$HOME/.npm-global/bin/gemini" ]; then
      npm_config_prefix="$HOME/.npm-global" npm install -g @google/gemini-cli
    fi
    ;;
  *)
    echo "Unsupported VELACLAW_LIVE_ACP_BIND_AGENT: $agent" >&2
    exit 1
    ;;
esac
tmp_dir="$(mktemp -d)"
cleanup() {
  rm -rf "$tmp_dir"
}
trap cleanup EXIT
source /src/scripts/lib/live-docker-stage.sh
velaclaw_live_stage_source_tree "$tmp_dir"
# Use a writable node_modules overlay in the temp repo. Vite writes bundled
# config artifacts under the nearest node_modules/.vite-temp path, and the
# build-stage /app/node_modules tree is root-owned in this Docker lane.
mkdir -p "$tmp_dir/node_modules"
cp -aRs /app/node_modules/. "$tmp_dir/node_modules"
rm -rf "$tmp_dir/node_modules/.vite-temp"
mkdir -p "$tmp_dir/node_modules/.vite-temp"
velaclaw_live_link_runtime_tree "$tmp_dir"
velaclaw_live_stage_state_dir "$tmp_dir/.velaclaw-state"
velaclaw_live_prepare_staged_config
cd "$tmp_dir"
export VELACLAW_LIVE_ACP_BIND_AGENT_COMMAND="${VELACLAW_LIVE_ACP_BIND_AGENT_COMMAND:-}"
pnpm test:live src/gateway/gateway-acp-bind.live.test.ts
EOF

echo "==> Build live-test image: $LIVE_IMAGE_NAME (target=build)"
docker build --target build -t "$LIVE_IMAGE_NAME" -f "$ROOT_DIR/Dockerfile" "$ROOT_DIR"

IFS=',' read -r -a ACP_AGENT_TOKENS <<<"$ACP_AGENT_LIST_RAW"
ACP_AGENTS=()
for token in "${ACP_AGENT_TOKENS[@]}"; do
  agent="$(velaclaw_live_trim "$token")"
  [[ -n "$agent" ]] || continue
  velaclaw_live_acp_bind_resolve_auth_provider "$agent" >/dev/null
  ACP_AGENTS+=("$agent")
done

if ((${#ACP_AGENTS[@]} == 0)); then
  echo "No ACP bind agents selected. Use VELACLAW_LIVE_ACP_BIND_AGENTS=claude,codex,gemini." >&2
  exit 1
fi

for ACP_AGENT in "${ACP_AGENTS[@]}"; do
  AUTH_PROVIDER="$(velaclaw_live_acp_bind_resolve_auth_provider "$ACP_AGENT")"
  AGENT_COMMAND="$(velaclaw_live_acp_bind_resolve_agent_command "$ACP_AGENT")"

  AUTH_DIRS=()
  AUTH_FILES=()
  if [[ -n "${VELACLAW_DOCKER_AUTH_DIRS:-}" ]]; then
    while IFS= read -r auth_dir; do
      [[ -n "$auth_dir" ]] || continue
      AUTH_DIRS+=("$auth_dir")
    done < <(velaclaw_live_collect_auth_dirs)
    while IFS= read -r auth_file; do
      [[ -n "$auth_file" ]] || continue
      AUTH_FILES+=("$auth_file")
    done < <(velaclaw_live_collect_auth_files)
  else
    while IFS= read -r auth_dir; do
      [[ -n "$auth_dir" ]] || continue
      AUTH_DIRS+=("$auth_dir")
    done < <(velaclaw_live_collect_auth_dirs_from_csv "$AUTH_PROVIDER")
    while IFS= read -r auth_file; do
      [[ -n "$auth_file" ]] || continue
      AUTH_FILES+=("$auth_file")
    done < <(velaclaw_live_collect_auth_files_from_csv "$AUTH_PROVIDER")
  fi

  AUTH_DIRS_CSV=""
  if ((${#AUTH_DIRS[@]} > 0)); then
    AUTH_DIRS_CSV="$(velaclaw_live_join_csv "${AUTH_DIRS[@]}")"
  fi
  AUTH_FILES_CSV=""
  if ((${#AUTH_FILES[@]} > 0)); then
    AUTH_FILES_CSV="$(velaclaw_live_join_csv "${AUTH_FILES[@]}")"
  fi

  EXTERNAL_AUTH_MOUNTS=()
  if ((${#AUTH_DIRS[@]} > 0)); then
    for auth_dir in "${AUTH_DIRS[@]}"; do
      host_path="$HOME/$auth_dir"
      if [[ -d "$host_path" ]]; then
        EXTERNAL_AUTH_MOUNTS+=(-v "$host_path":/host-auth/"$auth_dir":ro)
      fi
    done
  fi
  if ((${#AUTH_FILES[@]} > 0)); then
    for auth_file in "${AUTH_FILES[@]}"; do
      host_path="$HOME/$auth_file"
      if [[ -f "$host_path" ]]; then
        EXTERNAL_AUTH_MOUNTS+=(-v "$host_path":/host-auth-files/"$auth_file":ro)
      fi
    done
  fi

  echo "==> Run ACP bind live test in Docker"
  echo "==> Agent: $ACP_AGENT"
  echo "==> Auth dirs: ${AUTH_DIRS_CSV:-none}"
  echo "==> Auth files: ${AUTH_FILES_CSV:-none}"
  docker run --rm -t \
    -u node \
    --entrypoint bash \
    -e ANTHROPIC_API_KEY \
    -e ANTHROPIC_API_KEY_OLD \
    -e VELACLAW_LIVE_ACP_BIND_ANTHROPIC_API_KEY="${ANTHROPIC_API_KEY:-}" \
    -e VELACLAW_LIVE_ACP_BIND_ANTHROPIC_API_KEY_OLD="${ANTHROPIC_API_KEY_OLD:-}" \
    -e OPENAI_API_KEY \
    -e COREPACK_ENABLE_DOWNLOAD_PROMPT=0 \
    -e HOME=/home/node \
    -e NODE_OPTIONS=--disable-warning=ExperimentalWarning \
    -e VELACLAW_SKIP_CHANNELS=1 \
    -e VELACLAW_VITEST_FS_MODULE_CACHE=0 \
    -e VELACLAW_DOCKER_AUTH_DIRS_RESOLVED="$AUTH_DIRS_CSV" \
    -e VELACLAW_DOCKER_AUTH_FILES_RESOLVED="$AUTH_FILES_CSV" \
    -e VELACLAW_LIVE_TEST=1 \
    -e VELACLAW_LIVE_ACP_BIND=1 \
    -e VELACLAW_LIVE_ACP_BIND_AGENT="$ACP_AGENT" \
    -e VELACLAW_LIVE_ACP_BIND_AGENT_COMMAND="$AGENT_COMMAND" \
    -v "$ROOT_DIR":/src:ro \
    -v "$CONFIG_DIR":/home/node/.velaclaw \
    -v "$WORKSPACE_DIR":/home/node/.velaclaw/workspace \
    -v "$CLI_TOOLS_DIR":/home/node/.npm-global \
    "${EXTERNAL_AUTH_MOUNTS[@]}" \
    "${PROFILE_MOUNT[@]}" \
    "$LIVE_IMAGE_NAME" \
    -lc "$LIVE_TEST_CMD"
done
