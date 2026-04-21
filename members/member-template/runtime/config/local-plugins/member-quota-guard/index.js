import fs from "node:fs/promises";
import path from "node:path";
import { definePluginEntry } from "velaclaw/plugin-sdk/plugin-entry";

function resolveStateDir() {
  return (
    process.env.VELACLAW_STATE_DIR?.trim() ||
    process.env.VELACLAW_MEMBER_STATE_DIR?.trim() ||
    "/home/node/.velaclaw"
  );
}

const DEFAULT_POLICY_PATH = `${resolveStateDir()}/team-policy.json`;
const DEFAULT_USAGE_PATH = `${resolveStateDir()}/team-usage.json`;

async function safeReadJson(filePath) {
  try {
    return JSON.parse(await fs.readFile(filePath, "utf8"));
  } catch {
    return null;
  }
}

async function safeWriteJson(filePath, value) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function currentPeriods() {
  const now = new Date();
  const day = now.toISOString().slice(0, 10);
  const month = day.slice(0, 7);
  return { day, month };
}

function defaultUsage(periods) {
  return {
    day: periods.day,
    month: periods.month,
    dailyCount: 0,
    monthlyCount: 0,
    lastSeenAt: null,
  };
}

async function loadPolicyAndUsage(config) {
  const policyPath = config?.policyPath || DEFAULT_POLICY_PATH;
  const usagePath = config?.usagePath || DEFAULT_USAGE_PATH;
  const policy = await safeReadJson(policyPath);
  const periods = currentPeriods();
  const existingUsage = (await safeReadJson(usagePath)) || defaultUsage(periods);
  const usage = {
    ...defaultUsage(periods),
    ...existingUsage,
  };

  if (usage.day !== periods.day) {
    usage.day = periods.day;
    usage.dailyCount = 0;
  }
  if (usage.month !== periods.month) {
    usage.month = periods.month;
    usage.monthlyCount = 0;
  }

  return { usagePath, policy, usage };
}

function isCommandOnly(text) {
  return String(text || "")
    .trim()
    .startsWith("/");
}

export default definePluginEntry({
  id: "member-quota-guard",
  name: "Member Quota Guard",
  description: "Enforce manager-owned runtime quota and pause policy for member claws",
  register(api) {
    api.on("before_dispatch", async (event) => {
      const body = String(event.body || event.content || "").trim();
      if (!body || isCommandOnly(body)) {
        return {};
      }

      const { usagePath, policy, usage } = await loadPolicyAndUsage(api.pluginConfig || {});
      const quota = policy?.quota;
      if (!quota) {
        return {};
      }

      if (quota.status === "paused") {
        return {
          handled: true,
          text: "当前这个成员已被 team manager 暂停使用。请联系团队管理员恢复配额。",
        };
      }

      if (usage.dailyCount >= quota.dailyMessages) {
        return {
          handled: true,
          text: `今天的消息配额已用完（${quota.dailyMessages}/day）。请联系 team manager 提额或明天再试。`,
        };
      }

      if (usage.monthlyCount >= quota.monthlyMessages) {
        return {
          handled: true,
          text: `本月的消息配额已用完（${quota.monthlyMessages}/month）。请联系 team manager 提额。`,
        };
      }

      usage.dailyCount += 1;
      usage.monthlyCount += 1;
      usage.lastSeenAt = new Date().toISOString();
      await safeWriteJson(usagePath, usage);
      return {};
    });

    api.on("before_tool_call", async (event) => {
      if (event.toolName !== "subagents") {
        return {};
      }
      const { policy } = await loadPolicyAndUsage(api.pluginConfig || {});
      const quota = policy?.quota;
      if (!quota || quota.maxSubagents > 0) {
        return {};
      }
      return {
        block: true,
        blockReason: "Subagents are disabled for this member by team manager quota.",
      };
    });
  },
});
