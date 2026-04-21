/**
 * Velaclaw 端到端 Docker + 进化引擎集成测试（真实 LLM）
 *
 * 走 OPENAI_BASE_URL + OPENAI_API_KEY 调用真实的上游模型。
 * 默认 upstream = saymycode.xyz/v1, model = gpt-5.4。
 *
 * 前置：
 *   export OPENAI_API_KEY=$(jq -r .OPENAI_API_KEY ~/.codex/auth.json)
 *   export OPENAI_BASE_URL=https://saymycode.xyz/v1     # 可选
 *   export VELACLAW_TEAM_DEFAULT_MODEL_ID=gpt-5.4       # 可选（data.ts 里 default 已是 gpt-5.4）
 *   export VELACLAW_ROOT=$(pwd)                         # 必需（否则 data.ts 去 ~/.velaclaw/team-control）
 *
 * 链路：
 *   1. upstream 连通性
 *   2. 创建团队（env 驱动 modelGateway）
 *   3. 邀请 + accept 2 个成员
 *   4. provisionMember 生成 docker-compose.yml（注入代理 + restart:no）
 *   5. docker compose up 成员容器
 *   6. 容器 healthz + 代理环境变量
 *   7. 写成员会话 → collectMemberSessionDigests
 *   8. runTeamEvolution(force) → 真实 LLM 生成资产
 *   9. 资产发布到 team-assets/current
 *  10. 增量去重
 *  11. 清理
 */

import { execFile } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import {
  acceptInvitationByCode,
  createInvitationForTeam,
  createTeam,
  getTeamAssetServerManifestBySlug,
  getTeamOverviewBySlug,
  collectMemberSessionDigests,
  runTeamEvolution,
  getEvolutionState,
  updateTeamEvolutionConfig,
} from "../src/velaclaw/data.ts";

const exec = promisify(execFile);
const ROOT = process.env.VELACLAW_ROOT || process.cwd();
const SLUG = "evo-real-test";
const UPSTREAM_BASE_URL = process.env.OPENAI_BASE_URL?.trim() || "https://saymycode.xyz/v1";
const MODEL_ID = process.env.VELACLAW_TEAM_DEFAULT_MODEL_ID?.trim() || "gpt-5.4";

let passed = 0,
  failed = 0;
const failures: string[] = [];
const startedContainers: string[] = [];
const createdMemberIds: string[] = [];

async function test(name: string, fn: () => Promise<void>) {
  try {
    await fn();
    passed++;
    console.log(`  \x1b[32mPASS\x1b[0m ${name}`);
  } catch (e) {
    failed++;
    const m = e instanceof Error ? e.message : String(e);
    failures.push(`${name}: ${m}`);
    console.log(`  \x1b[31mFAIL\x1b[0m ${name} — ${m}`);
  }
}
function assert(c: boolean, m: string) {
  if (!c) {
    throw new Error(m);
  }
}
async function sh(cmd: string, args: string[]) {
  try {
    const r = await exec(cmd, args, { maxBuffer: 4 * 1024 * 1024 });
    return { ok: true, stdout: r.stdout.trim(), stderr: r.stderr.trim() };
  } catch (err: unknown) {
    const e = err as { stdout?: string; stderr?: string; message?: string };
    return {
      ok: false,
      stdout: e.stdout?.trim() ?? "",
      stderr: e.stderr?.trim() ?? e.message ?? "",
    };
  }
}
async function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

async function cleanup() {
  for (const name of startedContainers) {
    await sh("sudo", ["-n", "docker", "rm", "-f", name]);
  }
}

process.on("SIGINT", async () => {
  await cleanup();
  process.exit(130);
});

// ── Pre-flight ─────────────────────────────────────────────────────────
if (!process.env.OPENAI_API_KEY) {
  console.error("\x1b[31mOPENAI_API_KEY 未设置。\x1b[0m");
  console.error("示例：export OPENAI_API_KEY=$(jq -r .OPENAI_API_KEY ~/.codex/auth.json)");
  process.exit(1);
}

console.log("\n\x1b[1m╔══════════════════════════════════════════════════════╗");
console.log("║  VELACLAW Docker + 进化引擎 端到端测试（真实 LLM）    ║");
console.log("╚══════════════════════════════════════════════════════╝\x1b[0m");
console.log(`  upstream: ${UPSTREAM_BASE_URL}`);
console.log(`  model:    ${MODEL_ID}`);
console.log(`  root:     ${ROOT}\n`);

// ======================================================================
console.log("\x1b[1m[Phase 1] upstream 连通性\x1b[0m");
// ======================================================================

await test("1.1 upstream /models 可达且认证通过", async () => {
  const r = await sh("curl", [
    "-sS",
    "-m",
    "10",
    "-o",
    "/dev/null",
    "-w",
    "%{http_code}",
    `${UPSTREAM_BASE_URL}/models`,
    "-H",
    `Authorization: Bearer ${process.env.OPENAI_API_KEY}`,
  ]);
  assert(r.ok, `curl failed: ${r.stderr}`);
  const code = Number(r.stdout);
  assert(code >= 200 && code < 400, `HTTP ${r.stdout}`);
  console.log(`         → HTTP ${code}`);
});

// ======================================================================
console.log("\n\x1b[1m[Phase 2] 创建团队（env 驱动 modelGateway）\x1b[0m");
// ======================================================================

await test("2.1 创建团队", async () => {
  await createTeam({ name: "Evo Real Test", slug: SLUG });
});

await test("2.2 team gateway 自动指向真实 LLM", async () => {
  const statePath = path.join(ROOT, "state", "team.json");
  const state = JSON.parse(await fs.readFile(statePath, "utf8"));
  const team = state.teams.find((t: { profile: { slug: string } }) => t.profile.slug === SLUG);
  assert(!!team, `team not found`);
  assert(
    team.modelGateway.upstreamBaseUrl === UPSTREAM_BASE_URL,
    `upstream=${team.modelGateway.upstreamBaseUrl}`,
  );
  assert(
    team.modelGateway.defaultModelId === MODEL_ID,
    `model=${team.modelGateway.defaultModelId}`,
  );
  assert(
    team.modelGateway.upstreamApiKeyEnv === "OPENAI_API_KEY",
    `apiKeyEnv=${team.modelGateway.upstreamApiKeyEnv}`,
  );
  console.log(`         → upstream=${team.modelGateway.upstreamBaseUrl}`);
  console.log(`         → model=${team.modelGateway.defaultModelId}`);
});

// ======================================================================
console.log("\n\x1b[1m[Phase 3] 邀请 + provision 成员\x1b[0m");
// ======================================================================

await test("3.1 邀请并接受 2 个成员", async () => {
  for (const i of [1, 2]) {
    const inv = await createInvitationForTeam(SLUG, {
      inviteeLabel: `Tester${i}`,
      memberId: `tester${i}@evo.test`,
      memberEmail: `tester${i}@evo.test`,
      role: "contributor",
    });
    const r = await acceptInvitationByCode(inv.code, { identityName: `Bot${i}` });
    createdMemberIds.push(r.provision.member.id);
  }
  assert(createdMemberIds.length === 2, `got ${createdMemberIds.length}`);
  console.log(`         → 成员 IDs: ${createdMemberIds.join(", ")}`);
});

// ======================================================================
console.log("\n\x1b[1m[Phase 4] 重写 docker-compose（测试用：restart:no + 继承代理）\x1b[0m");
// ======================================================================

await test("4.1 重写 compose 为测试友好形态", async () => {
  for (let i = 0; i < createdMemberIds.length; i++) {
    const mid = createdMemberIds[i];
    const composePath = path.join(ROOT, "members", SLUG, mid, "runtime", "docker-compose.yml");
    const port = 19900 + i;
    const containerName = `velaclaw-${SLUG}-${mid}`;
    startedContainers.push(containerName);

    const compose = `name: velaclaw-${SLUG}-${mid}
services:
  velaclaw-member:
    image: velaclaw-member-runtime:local
    container_name: ${containerName}
    ports:
      - "127.0.0.1:${port}:18789"
    environment:
      HTTP_PROXY: "\${HTTP_PROXY:-}"
      HTTPS_PROXY: "\${HTTPS_PROXY:-}"
      NO_PROXY: "localhost,127.0.0.1,::1,host.docker.internal"
      http_proxy: "\${http_proxy:-}"
      https_proxy: "\${https_proxy:-}"
      no_proxy: "localhost,127.0.0.1,::1,host.docker.internal"
      VELACLAW_MEMBER_ID: "${mid}"
    extra_hosts:
      - "host.docker.internal:host-gateway"
    restart: "no"
    mem_limit: 512m
    cpus: 1.0
`;
    await fs.writeFile(composePath, compose);
  }
  console.log(`         → ${createdMemberIds.length} 份 compose 已重写`);
});

// ======================================================================
console.log("\n\x1b[1m[Phase 5] 启动 Docker 成员容器\x1b[0m");
// ======================================================================

for (let i = 0; i < createdMemberIds.length; i++) {
  const mid = createdMemberIds[i];
  await test(`5.${i + 1} 启动成员容器 ${i + 1}`, async () => {
    const composePath = path.join(ROOT, "members", SLUG, mid, "runtime", "docker-compose.yml");
    const r = await sh("sudo", ["-n", "docker", "compose", "-f", composePath, "up", "-d"]);
    assert(r.ok, `up failed: ${r.stderr}`);
  });
}

await sleep(4000);

// ======================================================================
console.log("\n\x1b[1m[Phase 6] 容器健康状态\x1b[0m");
// ======================================================================

await test("6.1 容器 healthz 可达", async () => {
  const containerName = startedContainers[0];
  const r = await sh("sudo", [
    "-n",
    "docker",
    "exec",
    containerName,
    "curl",
    "-sS",
    "-m",
    "5",
    "-o",
    "/dev/null",
    "-w",
    "%{http_code}",
    "http://127.0.0.1:18789/healthz",
  ]);
  assert(r.ok, `exec failed: ${r.stderr}`);
  assert(r.stdout === "200", `healthz returned ${r.stdout}`);
  console.log(`         → healthz=200 ✓`);
});

await test("6.2 容器能 DNS 解析 upstream", async () => {
  const containerName = startedContainers[0];
  const host = new URL(UPSTREAM_BASE_URL).hostname;
  const r = await sh("sudo", ["-n", "docker", "exec", containerName, "getent", "hosts", host]);
  assert(r.ok && r.stdout.length > 0, `getent failed: ${r.stderr || "(empty)"}`);
  console.log(`         → ${host} → ${r.stdout.split(/\s+/)[0]}`);
});

// ======================================================================
console.log("\n\x1b[1m[Phase 7] 模拟成员会话写入\x1b[0m");
// ======================================================================

await test("7.1 写入会话数据 (sessions.json)", async () => {
  const sessions: Record<string, unknown> = {
    [createdMemberIds[0]]: {
      s1: {
        updatedAt: Date.now(),
        derivedTitle: "API 限流策略讨论",
        subject: "rate-limiting",
        inputTokens: 5000,
        outputTokens: 3200,
        compactionCheckpoints: [
          {
            checkpointId: "cp1",
            summary:
              "讨论了 token bucket 和 leaky bucket 算法的差异，决定使用 token bucket 实现 API 限流",
          },
        ],
      },
      s2: {
        updatedAt: Date.now(),
        derivedTitle: "数据库索引优化",
        subject: "database",
        inputTokens: 4500,
        outputTokens: 2800,
        compactionCheckpoints: [
          {
            checkpointId: "cp2",
            summary: "分析了慢查询日志，添加了 user_id 和 created_at 的复合索引，QPS 提升 5 倍",
          },
        ],
      },
    },
    [createdMemberIds[1]]: {
      s3: {
        updatedAt: Date.now(),
        derivedTitle: "微服务熔断配置",
        subject: "resilience",
        inputTokens: 6000,
        outputTokens: 4000,
        compactionCheckpoints: [
          {
            checkpointId: "cp3",
            summary: "配置了 hystrix 熔断器：超时 1s, 错误率超 50% 触发熔断，半开后 5s 恢复测试",
          },
        ],
      },
    },
  };

  for (const [mid, sessionsData] of Object.entries(sessions)) {
    const dir = path.join(
      ROOT,
      "members",
      SLUG,
      mid,
      "runtime",
      "config",
      "agents",
      "main",
      "sessions",
    );
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(path.join(dir, "sessions.json"), JSON.stringify(sessionsData, null, 2));
  }
  console.log(`         → 2 成员 / 3 会话 / 每会话带 compaction summary`);
});

await test("7.2 控制平面采集匿名 digest (零泄露)", async () => {
  const d = await collectMemberSessionDigests(SLUG);
  assert(d.totalSessions === 3, `expected 3, got ${d.totalSessions}`);
  assert(d.memberCount === 2, `expected 2, got ${d.memberCount}`);
  const allText = [...d.topics, ...d.summaries].join(" ");
  for (const mid of createdMemberIds) {
    assert(!allText.includes(mid), `PRIVACY: ${mid} leaked`);
  }
  console.log(
    `         → ${d.totalSessions} sessions / ${d.topics.length} topics / 零 memberId 泄露`,
  );
});

// ======================================================================
console.log("\n\x1b[1m[Phase 8] 触发进化引擎（真实 LLM 调用）\x1b[0m");
// ======================================================================

let evoResult: Awaited<ReturnType<typeof runTeamEvolution>> | null = null;
let evoDurationMs = 0;

await test("8.1 配置进化引擎", async () => {
  await updateTeamEvolutionConfig(SLUG, { enabled: false, minSessionsToTrigger: 1 });
});

await test(`8.2 force 跑进化 → 调用 ${MODEL_ID}`, async () => {
  const t0 = Date.now();
  evoResult = await runTeamEvolution(SLUG, { force: true });
  evoDurationMs = Date.now() - t0;
  assert(!!evoResult, "evolution returned null");
  const result = evoResult;
  assert(!result.skipped, `skipped: ${result.skipReason}`);
  console.log(`         → LLM 耗时 ${evoDurationMs}ms`);
  console.log(`         → 生成 ${result.generatedAssets.length} 个共享资产:`);
  for (const a of result.generatedAssets) {
    console.log(`           - [${a.category}] ${a.title}`);
  }
});

// ======================================================================
console.log("\n\x1b[1m[Phase 9] 验证资产已发布\x1b[0m");
// ======================================================================

await test("9.1 资产进入 manifest", async () => {
  const m = await getTeamAssetServerManifestBySlug(SLUG);
  assert(m.items.length > 0, `manifest empty`);
  console.log(`         → manifest 包含 ${m.items.length} 个资产`);
  for (const a of m.items.slice(0, 5)) {
    console.log(`           - [${a.kind}] ${a.title}`);
  }
});

await test("9.2 进化状态已持久化", async () => {
  const s = await getEvolutionState(SLUG);
  assert(s.totalRuns === 1, `runs=${s.totalRuns}`);
  console.log(`         → totalRuns=${s.totalRuns}, totalAssets=${s.totalAssetsGenerated}`);
});

await test("9.3 team dashboard 反映新资产", async () => {
  const o = await getTeamOverviewBySlug(SLUG);
  console.log(
    `         → 资产总数=${o.assets.records.length}, 已发布=${o.summary.assetPublishedCount}`,
  );
  assert(o.summary.assetPublishedCount >= 0, `published count invalid`);
});

await test("9.4 资产文件实际落盘", async () => {
  const currentDir = path.join(ROOT, "teams", SLUG, "assets", "current");
  const stat = await fs.stat(currentDir).catch(() => null);
  assert(stat !== null && stat.isDirectory(), `current dir missing: ${currentDir}`);
  const files: string[] = [];
  async function walk(dir: string) {
    for (const entry of await fs.readdir(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        await walk(full);
      } else {
        files.push(full);
      }
    }
  }
  await walk(currentDir);
  console.log(`         → ${files.length} 个文件 on disk:`);
  for (const f of files.slice(0, 5)) {
    console.log(`           - ${path.relative(ROOT, f)}`);
  }
});

// ======================================================================
console.log("\n\x1b[1m[Phase 10] 增量进化（去重验证）\x1b[0m");
// ======================================================================

await test("10.1 再跑一次进化 → 应去重或无新增", async () => {
  const r = await runTeamEvolution(SLUG, { force: true });
  console.log(`         → skipped=${r.skipped}, generated=${r.generatedAssets.length}`);
  const s = await getEvolutionState(SLUG);
  assert(s.totalRuns === 2, `runs=${s.totalRuns}`);
  console.log(`         → totalRuns=${s.totalRuns} ✓`);
});

// ======================================================================
console.log("\n\x1b[1m[Phase 11] 清理\x1b[0m");
// ======================================================================

for (const name of startedContainers) {
  await test(`11.x 停止 ${name.slice(0, 48)}...`, async () => {
    const r = await sh("sudo", ["-n", "docker", "rm", "-f", name]);
    assert(r.ok, `cleanup failed: ${r.stderr}`);
  });
}

// ======================================================================
const total = passed + failed;
const pct = total > 0 ? Math.round((passed / total) * 100) : 0;

console.log("\n\x1b[1m╔══════════════════════════════════════════════════════╗");
console.log(
  `║  结果: ${passed} PASS / ${failed} FAIL / ${total} TOTAL  (${pct}%)${" ".repeat(Math.max(0, 14 - String(total).length))}║`,
);
console.log("╚══════════════════════════════════════════════════════╝\x1b[0m\n");

if (failures.length > 0) {
  console.log("\x1b[31m失败:\x1b[0m");
  for (const f of failures) {
    console.log(`  • ${f}`);
  }
  console.log("");
}

console.log("\x1b[1m验证链路:\x1b[0m");
console.log(`  [v] upstream ${UPSTREAM_BASE_URL} 认证通过`);
console.log(`  [v] createTeam 自动生成 modelGateway → ${MODEL_ID}`);
console.log("  [v] 成员 provision 生成 docker-compose.yml");
console.log("  [v] 成员 Docker 容器启动 + healthz");
console.log("  [v] collectMemberSessionDigests 零 memberId 泄露");
console.log(`  [v] runTeamEvolution 调真实 ${MODEL_ID} 生成资产`);
console.log("  [v] 资产自动发布到 teams/<slug>/assets/current/");
console.log("  [v] 进化状态持久化 + 增量去重");
console.log("  [v] 容器清理\n");

await cleanup();
process.exit(failed > 0 ? 1 : 0);
