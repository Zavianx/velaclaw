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
DEFAULT_PROVIDER="${VELACLAW_DOCKER_CLI_BACKEND_PROVIDER:-claude-cli}"
CLI_MODEL="${VELACLAW_LIVE_CLI_BACKEND_MODEL:-}"
CLI_PROVIDER="${CLI_MODEL%%/*}"
CLI_DISABLE_MCP_CONFIG="${VELACLAW_LIVE_CLI_BACKEND_DISABLE_MCP_CONFIG:-}"
CLI_AUTH_MODE="${VELACLAW_LIVE_CLI_BACKEND_AUTH:-auto}"

if [[ -z "$CLI_PROVIDER" || "$CLI_PROVIDER" == "$CLI_MODEL" ]]; then
  CLI_PROVIDER="$DEFAULT_PROVIDER"
fi

case "$CLI_AUTH_MODE" in
  auto | api-key | subscription)
    ;;
  *)
    echo "ERROR: VELACLAW_LIVE_CLI_BACKEND_AUTH must be one of: auto, api-key, subscription." >&2
    exit 1
    ;;
esac

if [[ "$CLI_AUTH_MODE" == "subscription" && "$CLI_PROVIDER" != "claude-cli" ]]; then
  echo "ERROR: VELACLAW_LIVE_CLI_BACKEND_AUTH=subscription is only supported for claude-cli." >&2
  exit 1
fi

CLI_METADATA_JSON="$(node --import tsx "$ROOT_DIR/scripts/print-cli-backend-live-metadata.ts" "$CLI_PROVIDER")"
read_metadata_field() {
  local field="$1"
  node -e 'const data = JSON.parse(process.argv[1]); const field = process.argv[2]; const value = data?.[field]; if (value == null) process.exit(1); process.stdout.write(typeof value === "string" ? value : JSON.stringify(value));' \
    "$CLI_METADATA_JSON" \
    "$field"
}

DEFAULT_MODEL="$(read_metadata_field defaultModelRef 2>/dev/null || printf '%s' 'claude-cli/claude-sonnet-4-6')"
CLI_MODEL="${CLI_MODEL:-$DEFAULT_MODEL}"
CLI_DEFAULT_COMMAND="$(read_metadata_field command 2>/dev/null || true)"
CLI_DOCKER_NPM_PACKAGE="$(read_metadata_field dockerNpmPackage 2>/dev/null || true)"
CLI_DOCKER_BINARY_NAME="$(read_metadata_field dockerBinaryName 2>/dev/null || true)"

if [[ "$CLI_PROVIDER" == "claude-cli" && -z "$CLI_DISABLE_MCP_CONFIG" ]]; then
  if [[ "$CLI_AUTH_MODE" == "subscription" ]]; then
    CLI_DISABLE_MCP_CONFIG="1"
  else
    CLI_DISABLE_MCP_CONFIG="0"
  fi
fi

mkdir -p "$CLI_TOOLS_DIR"

if [[ "$CLI_PROVIDER" == "claude-cli" && "$CLI_AUTH_MODE" == "subscription" ]]; then
  CLAUDE_CREDS_FILE="$HOME/.claude/.credentials.json"
  CLAUDE_SUBSCRIPTION_AUTH_SOURCE=""
  CLAUDE_SUBSCRIPTION_TYPE=""
  if [[ -f "$CLAUDE_CREDS_FILE" ]]; then
    CLAUDE_SUBSCRIPTION_TYPE="$(
      node -e '
        const fs = require("node:fs");
        const file = process.argv[1];
        const data = JSON.parse(fs.readFileSync(file, "utf8"));
        const subscriptionType = String(data?.claudeAiOauth?.subscriptionType ?? "").trim();
        if (!subscriptionType || subscriptionType === "unknown") process.exit(2);
        process.stdout.write(subscriptionType);
      ' "$CLAUDE_CREDS_FILE" 2>/dev/null
    )" || {
      echo "ERROR: $CLAUDE_CREDS_FILE does not look like Claude subscription OAuth auth." >&2
      echo "Expected claudeAiOauth.subscriptionType to be present." >&2
      exit 1
    }
    CLAUDE_SUBSCRIPTION_AUTH_SOURCE="credentials-file"
  elif [[ -n "${CLAUDE_CODE_OAUTH_TOKEN:-}" ]]; then
    CLAUDE_SUBSCRIPTION_TYPE="oauth-token"
    CLAUDE_SUBSCRIPTION_AUTH_SOURCE="env-token"
  else
    echo "ERROR: Claude subscription auth requires either:" >&2
    echo "  - $CLAUDE_CREDS_FILE with claudeAiOauth.subscriptionType, or" >&2
    echo "  - CLAUDE_CODE_OAUTH_TOKEN from 'claude setup-token'." >&2
    exit 1
  fi
  if [[ -z "${VELACLAW_LIVE_CLI_BACKEND_PRESERVE_ENV:-}" ]]; then
    if [[ "$CLAUDE_SUBSCRIPTION_AUTH_SOURCE" == "env-token" ]]; then
      export VELACLAW_LIVE_CLI_BACKEND_PRESERVE_ENV='["CLAUDE_CODE_OAUTH_TOKEN"]'
    else
      export VELACLAW_LIVE_CLI_BACKEND_PRESERVE_ENV="[]"
    fi
  fi
  if [[ "$VELACLAW_LIVE_CLI_BACKEND_PRESERVE_ENV" == *ANTHROPIC_API_KEY* ]]; then
    echo "ERROR: subscription auth smoke must not preserve Anthropic API-key env vars." >&2
    exit 1
  fi
  if [[ "$CLAUDE_SUBSCRIPTION_AUTH_SOURCE" == "env-token" && "$VELACLAW_LIVE_CLI_BACKEND_PRESERVE_ENV" != *CLAUDE_CODE_OAUTH_TOKEN* ]]; then
    echo "ERROR: CLAUDE_CODE_OAUTH_TOKEN subscription smoke must preserve CLAUDE_CODE_OAUTH_TOKEN for the Gateway child process." >&2
    exit 1
  fi
  export VELACLAW_LIVE_CLI_BACKEND_MODEL_SWITCH_PROBE="${VELACLAW_LIVE_CLI_BACKEND_MODEL_SWITCH_PROBE:-0}"
  export VELACLAW_LIVE_CLI_BACKEND_RESUME_PROBE="${VELACLAW_LIVE_CLI_BACKEND_RESUME_PROBE:-1}"
  export VELACLAW_LIVE_CLI_BACKEND_IMAGE_PROBE="${VELACLAW_LIVE_CLI_BACKEND_IMAGE_PROBE:-0}"
  export VELACLAW_LIVE_CLI_BACKEND_MCP_PROBE="${VELACLAW_LIVE_CLI_BACKEND_MCP_PROBE:-0}"
fi

PROFILE_MOUNT=()
if [[ -f "$PROFILE_FILE" ]]; then
  PROFILE_MOUNT=(-v "$PROFILE_FILE":/home/node/.profile:ro)
fi

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
  done < <(velaclaw_live_collect_auth_dirs_from_csv "$CLI_PROVIDER")
  while IFS= read -r auth_file; do
    [[ -n "$auth_file" ]] || continue
    AUTH_FILES+=("$auth_file")
  done < <(velaclaw_live_collect_auth_files_from_csv "$CLI_PROVIDER")
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
provider="${VELACLAW_DOCKER_CLI_BACKEND_PROVIDER:-claude-cli}"
default_command="${VELACLAW_DOCKER_CLI_BACKEND_COMMAND_DEFAULT:-}"
docker_package="${VELACLAW_DOCKER_CLI_BACKEND_NPM_PACKAGE:-}"
binary_name="${VELACLAW_DOCKER_CLI_BACKEND_BINARY_NAME:-}"
if [ -z "$binary_name" ] && [ -n "$default_command" ]; then
  binary_name="$(basename "$default_command")"
fi
if [ -z "${VELACLAW_LIVE_CLI_BACKEND_COMMAND:-}" ] && [ -n "$binary_name" ]; then
  export VELACLAW_LIVE_CLI_BACKEND_COMMAND="$HOME/.npm-global/bin/$binary_name"
fi
if [ -n "${VELACLAW_LIVE_CLI_BACKEND_COMMAND:-}" ] && [ ! -x "${VELACLAW_LIVE_CLI_BACKEND_COMMAND}" ] && [ -n "$docker_package" ]; then
  npm_config_prefix="$HOME/.npm-global" npm install -g "$docker_package"
fi
if [ "$provider" = "claude-cli" ]; then
  auth_mode="${VELACLAW_LIVE_CLI_BACKEND_AUTH:-auto}"
  if [ "$auth_mode" = "subscription" ]; then
    unset ANTHROPIC_API_KEY
    unset ANTHROPIC_API_KEY_OLD
    unset ANTHROPIC_API_TOKEN
    unset ANTHROPIC_AUTH_TOKEN
    unset ANTHROPIC_OAUTH_TOKEN
    node - <<'NODE'
const fs = require("node:fs");
const file = `${process.env.HOME}/.claude/.credentials.json`;
if (fs.existsSync(file)) {
  const data = JSON.parse(fs.readFileSync(file, "utf8"));
  const subscriptionType = String(data?.claudeAiOauth?.subscriptionType ?? "").trim();
  if (!subscriptionType || subscriptionType === "unknown") {
    throw new Error("Claude subscription OAuth credentials are missing subscriptionType.");
  }
  console.error(`[claude-subscription] subscriptionType=${subscriptionType}`);
} else if (process.env.CLAUDE_CODE_OAUTH_TOKEN?.trim()) {
  console.error("[claude-subscription] using CLAUDE_CODE_OAUTH_TOKEN from environment");
} else {
  throw new Error("Claude subscription OAuth token or credentials file is required.");
}
NODE
  fi
  real_claude="$HOME/.npm-global/bin/claude-real"
  if [ ! -x "$real_claude" ] && [ -x "$HOME/.npm-global/bin/claude" ]; then
    mv "$HOME/.npm-global/bin/claude" "$real_claude"
  fi
  if [ -x "$real_claude" ]; then
    cat > "$HOME/.npm-global/bin/claude" <<WRAP
#!/usr/bin/env bash
script_dir="\$(CDPATH= cd -- "\$(dirname -- "\$0")" && pwd)"
if [ -n "\${VELACLAW_LIVE_CLI_BACKEND_ANTHROPIC_API_KEY:-}" ]; then
  export ANTHROPIC_API_KEY="\${VELACLAW_LIVE_CLI_BACKEND_ANTHROPIC_API_KEY}"
fi
if [ -n "\${VELACLAW_LIVE_CLI_BACKEND_ANTHROPIC_API_KEY_OLD:-}" ]; then
  export ANTHROPIC_API_KEY_OLD="\${VELACLAW_LIVE_CLI_BACKEND_ANTHROPIC_API_KEY_OLD}"
fi
exec "\$script_dir/claude-real" "\$@"
WRAP
    chmod +x "$HOME/.npm-global/bin/claude"
  fi
  if [ -z "${VELACLAW_LIVE_CLI_BACKEND_PRESERVE_ENV:-}" ]; then
    export VELACLAW_LIVE_CLI_BACKEND_PRESERVE_ENV='["ANTHROPIC_API_KEY","ANTHROPIC_API_KEY_OLD"]'
  fi
  if [ "$auth_mode" = "subscription" ]; then
    claude --version
    direct_token="VELACLAW-CLAUDE-SUBSCRIPTION-DIRECT"
    direct_output="$(
      claude \
        -p "Reply exactly: $direct_token" \
        --output-format text \
        --model sonnet \
        --permission-mode bypassPermissions \
        --setting-sources user \
        --strict-mcp-config \
        --mcp-config '{"mcpServers":{}}' \
        --no-session-persistence
    )"
    if [[ "$direct_output" != *"$direct_token"* ]]; then
      echo "ERROR: direct Claude subscription probe did not return expected token." >&2
      echo "$direct_output" >&2
      exit 1
    fi
    echo "[claude-subscription] direct claude -p probe ok"
  else
    claude auth status || true
  fi
fi
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
pnpm test:live src/gateway/gateway-cli-backend.live.test.ts
EOF

if [[ "${VELACLAW_SKIP_DOCKER_BUILD:-}" == "1" ]]; then
  echo "==> Reuse live-test image: $LIVE_IMAGE_NAME (VELACLAW_SKIP_DOCKER_BUILD=1)"
else
  echo "==> Build live-test image: $LIVE_IMAGE_NAME (target=build)"
  docker build --target build -t "$LIVE_IMAGE_NAME" -f "$ROOT_DIR/Dockerfile" "$ROOT_DIR"
fi

echo "==> Run CLI backend live test in Docker"
echo "==> Model: $CLI_MODEL"
echo "==> Provider: $CLI_PROVIDER"
echo "==> Auth mode: $CLI_AUTH_MODE"
if [[ "$CLI_PROVIDER" == "claude-cli" && "$CLI_AUTH_MODE" == "subscription" ]]; then
  echo "==> Claude subscription: $CLAUDE_SUBSCRIPTION_TYPE"
  echo "==> Claude subscription source: $CLAUDE_SUBSCRIPTION_AUTH_SOURCE"
fi
echo "==> External auth dirs: ${AUTH_DIRS_CSV:-none}"
echo "==> External auth files: ${AUTH_FILES_CSV:-none}"
DOCKER_AUTH_ENV=(
  -e VELACLAW_LIVE_CLI_BACKEND_AUTH="$CLI_AUTH_MODE"
)
if [[ "$CLI_PROVIDER" == "claude-cli" && "$CLI_AUTH_MODE" == "subscription" ]]; then
  DOCKER_AUTH_ENV+=(
    -e CLAUDE_CODE_OAUTH_TOKEN="${CLAUDE_CODE_OAUTH_TOKEN:-}"
    -e VELACLAW_LIVE_CLI_BACKEND_PRESERVE_ENV="$VELACLAW_LIVE_CLI_BACKEND_PRESERVE_ENV"
  )
else
  DOCKER_AUTH_ENV+=(
    -e ANTHROPIC_API_KEY
    -e ANTHROPIC_API_KEY_OLD
    -e VELACLAW_LIVE_CLI_BACKEND_ANTHROPIC_API_KEY="${ANTHROPIC_API_KEY:-}"
    -e VELACLAW_LIVE_CLI_BACKEND_ANTHROPIC_API_KEY_OLD="${ANTHROPIC_API_KEY_OLD:-}"
    -e VELACLAW_LIVE_CLI_BACKEND_PRESERVE_ENV="${VELACLAW_LIVE_CLI_BACKEND_PRESERVE_ENV:-}"
  )
fi

docker run --rm -t \
  -u node \
  --entrypoint bash \
  -e COREPACK_ENABLE_DOWNLOAD_PROMPT=0 \
  -e HOME=/home/node \
  -e NODE_OPTIONS=--disable-warning=ExperimentalWarning \
  -e VELACLAW_SKIP_CHANNELS=1 \
  -e VELACLAW_VITEST_FS_MODULE_CACHE=0 \
  -e VELACLAW_DOCKER_AUTH_DIRS_RESOLVED="$AUTH_DIRS_CSV" \
  -e VELACLAW_DOCKER_AUTH_FILES_RESOLVED="$AUTH_FILES_CSV" \
  -e VELACLAW_DOCKER_CLI_BACKEND_PROVIDER="$CLI_PROVIDER" \
  -e VELACLAW_DOCKER_CLI_BACKEND_COMMAND_DEFAULT="$CLI_DEFAULT_COMMAND" \
  -e VELACLAW_DOCKER_CLI_BACKEND_NPM_PACKAGE="$CLI_DOCKER_NPM_PACKAGE" \
  -e VELACLAW_DOCKER_CLI_BACKEND_BINARY_NAME="$CLI_DOCKER_BINARY_NAME" \
  -e VELACLAW_LIVE_TEST=1 \
  -e VELACLAW_LIVE_CLI_BACKEND=1 \
  -e VELACLAW_LIVE_CLI_BACKEND_DEBUG="${VELACLAW_LIVE_CLI_BACKEND_DEBUG:-}" \
  -e VELACLAW_CLI_BACKEND_LOG_OUTPUT="${VELACLAW_CLI_BACKEND_LOG_OUTPUT:-}" \
  -e VELACLAW_LIVE_CLI_BACKEND_MODEL="$CLI_MODEL" \
  -e VELACLAW_LIVE_CLI_BACKEND_COMMAND="${VELACLAW_LIVE_CLI_BACKEND_COMMAND:-}" \
  -e VELACLAW_LIVE_CLI_BACKEND_ARGS="${VELACLAW_LIVE_CLI_BACKEND_ARGS:-}" \
  -e VELACLAW_LIVE_CLI_BACKEND_CLEAR_ENV="${VELACLAW_LIVE_CLI_BACKEND_CLEAR_ENV:-}" \
  -e VELACLAW_LIVE_CLI_BACKEND_DISABLE_MCP_CONFIG="$CLI_DISABLE_MCP_CONFIG" \
  -e VELACLAW_LIVE_CLI_BACKEND_RESUME_PROBE="${VELACLAW_LIVE_CLI_BACKEND_RESUME_PROBE:-}" \
  -e VELACLAW_LIVE_CLI_BACKEND_MODEL_SWITCH_PROBE="${VELACLAW_LIVE_CLI_BACKEND_MODEL_SWITCH_PROBE:-}" \
  -e VELACLAW_LIVE_CLI_BACKEND_IMAGE_PROBE="${VELACLAW_LIVE_CLI_BACKEND_IMAGE_PROBE:-}" \
  -e VELACLAW_LIVE_CLI_BACKEND_MCP_PROBE="${VELACLAW_LIVE_CLI_BACKEND_MCP_PROBE:-}" \
  -e VELACLAW_LIVE_CLI_BACKEND_IMAGE_ARG="${VELACLAW_LIVE_CLI_BACKEND_IMAGE_ARG:-}" \
  -e VELACLAW_LIVE_CLI_BACKEND_IMAGE_MODE="${VELACLAW_LIVE_CLI_BACKEND_IMAGE_MODE:-}" \
  -v "$ROOT_DIR":/src:ro \
  -v "$CONFIG_DIR":/home/node/.velaclaw \
  -v "$WORKSPACE_DIR":/home/node/.velaclaw/workspace \
  -v "$CLI_TOOLS_DIR":/home/node/.npm-global \
  "${EXTERNAL_AUTH_MOUNTS[@]}" \
  "${DOCKER_AUTH_ENV[@]}" \
  "${PROFILE_MOUNT[@]}" \
  "$LIVE_IMAGE_NAME" \
  -lc "$LIVE_TEST_CMD"
