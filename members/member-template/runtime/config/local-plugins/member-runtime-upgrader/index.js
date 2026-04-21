import fs from "node:fs/promises";
import { definePluginEntry } from "velaclaw/plugin-sdk/plugin-entry";

const DEFAULT_CONTROL_PORT = "4318";
const DEFAULT_STATE_DIR =
  process.env.VELACLAW_STATE_DIR?.trim() ||
  process.env.VELACLAW_MEMBER_STATE_DIR?.trim() ||
  "/home/node/.velaclaw";
const DEFAULT_POLICY_PATH = `${DEFAULT_STATE_DIR}/team-policy.json`;

function resolveDefaultApiBaseUrl() {
  const explicit = process.env.VELACLAW_TEAM_CONTROL_BASE_URL?.trim();
  if (explicit) {
    return explicit.replace(/\/+$/, "");
  }
  const host = process.env.VELACLAW_TEAM_CONTROL_HOST?.trim() || "host.docker.internal";
  const port =
    process.env.VELACLAW_CONTROL_PORT?.trim() || process.env.PORT?.trim() || DEFAULT_CONTROL_PORT;
  return `http://${host}:${port}`;
}

async function fetchJson(url, init = {}) {
  const response = await fetch(url, {
    headers: {
      Accept: "application/json",
      ...(init.body ? { "Content-Type": "application/json" } : {}),
      ...init.headers,
    },
    ...init,
  });

  const text = await response.text();
  let payload;
  try {
    payload = text ? JSON.parse(text) : null;
  } catch {
    payload = text;
  }

  if (!response.ok) {
    const message =
      payload && typeof payload === "object" && typeof payload.error === "string"
        ? payload.error
        : typeof payload === "string"
          ? payload
          : `${response.status} ${response.statusText}`;
    throw new Error(message);
  }

  return payload;
}

async function resolveAccessToken(config) {
  const explicit = config?.accessToken?.trim();
  if (explicit) {
    return explicit;
  }
  const policyPath = config?.policyPath?.trim() || DEFAULT_POLICY_PATH;
  try {
    const raw = await fs.readFile(policyPath, "utf8");
    const parsed = JSON.parse(raw);
    return parsed?.runtimeAccessToken?.trim?.() || "";
  } catch {
    return "";
  }
}

async function requestRestart(config) {
  const apiBaseUrl = config?.apiBaseUrl || resolveDefaultApiBaseUrl();
  const teamSlug = String(config?.teamSlug || "").trim();
  const memberId = String(config?.memberId || "").trim();
  const accessToken = await resolveAccessToken(config);
  if (!teamSlug || !memberId) {
    throw new Error("upgrade plugin config is incomplete");
  }
  if (!accessToken) {
    throw new Error("missing member runtime access token");
  }

  return await fetchJson(
    `${apiBaseUrl}/api/teams/${encodeURIComponent(teamSlug)}/members/${encodeURIComponent(memberId)}/runtime/restart`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify({ reason: "member-upgrade" }),
    },
  );
}

export default definePluginEntry({
  id: "member-runtime-upgrader",
  name: "Member Runtime Upgrader",
  description: "Restart the current member runtime via /upgrade.",
  register(api) {
    api.registerCommand({
      name: "upgrade",
      description: "Restart this member runtime from the team control plane.",
      acceptsArgs: false,
      nativeNames: { default: "upgrade" },
      handler: async () => {
        try {
          await requestRestart(api.pluginConfig || {});
          return {
            text: "已请求重启当前成员 runtime。\n当前仓库还未接入自动镜像升级链，现阶段会执行控制面重启流程。",
          };
        } catch (error) {
          return {
            text: `升级请求失败: ${error instanceof Error ? error.message : String(error)}`,
          };
        }
      },
    });
  },
});
