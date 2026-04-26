import { completeSimple, type TextContent } from "@mariozechner/pi-ai";
import type { VelaclawConfig } from "../config/types.velaclaw.js";
import { prepareSimpleCompletionModelForAgent } from "./simple-completion-runtime.js";
import { getSubagentDepthFromSessionStore } from "./subagent-depth.js";

export const PERSONAL_TEAM_ROLE_PRESETS = ["researcher", "analyst", "verifier", "leader"] as const;

export type PersonalTeamRolePreset = (typeof PERSONAL_TEAM_ROLE_PRESETS)[number];
export type PersonalTeamMode = "solo" | "assist" | "team";
export type PersonalTeamRiskLevel = "low" | "medium" | "high";

export type PersonalTeamResolvedConfig = {
  enabled: boolean;
  autoAssist: boolean;
  explicitTriggers: string[];
  maxAgents: number;
  maxSpawnDepth: number;
  writerPolicy: "leader_only";
  confidenceThreshold: number;
};

export type PersonalTeamRoleAssignment = {
  role: Exclude<PersonalTeamRolePreset, "leader">;
  label: string;
  scope: string;
};

export type PersonalTeamRouteDecision = {
  mode: PersonalTeamMode;
  confidence: number;
  reason: string;
  roles: PersonalTeamRoleAssignment[];
  riskLevel: PersonalTeamRiskLevel;
  requiresUserConfirmation: boolean;
  explicit: boolean;
};

type PersonalTeamRouterBaseInput = {
  cfg?: VelaclawConfig;
  userMessage: string;
  sessionKey?: string;
  agentId?: string;
  recentContextSummary?: string;
  availableAgentIds?: string[];
};

export type PersonalTeamRouterInput = PersonalTeamRouterBaseInput & {
  classifier?: PersonalTeamClassifier;
};

export type PersonalTeamClassifierRole =
  | PersonalTeamRoleAssignment["role"]
  | {
      role?: PersonalTeamRoleAssignment["role"];
      label?: string;
      scope?: string;
    };

export type PersonalTeamClassifierOutput = {
  mode?: PersonalTeamMode;
  confidence?: number;
  reason?: string;
  roles?: PersonalTeamClassifierRole[];
  riskLevel?: PersonalTeamRiskLevel;
  requiresUserConfirmation?: boolean;
};

type PersonalTeamClassifierInput = PersonalTeamRouterBaseInput & {
  config: PersonalTeamResolvedConfig;
  heuristicConfidence: number;
  riskLevel: PersonalTeamRiskLevel;
};

export type PersonalTeamClassifier = (
  input: PersonalTeamClassifierInput,
) => Promise<PersonalTeamClassifierOutput | undefined>;

const DEFAULT_EXPLICIT_TRIGGERS = [
  "开团队",
  "多 agent",
  "多agent",
  "并行分析",
  "让几个 agent",
  "让几个agent",
  "开多 agent",
  "开多agent",
  "personal team",
  "multi-agent",
  "multi agent",
  "parallel agents",
  "spin up agents",
  "agent team",
];

const DEFAULT_PERSONAL_TEAM_CONFIG: PersonalTeamResolvedConfig = {
  enabled: true,
  autoAssist: true,
  explicitTriggers: DEFAULT_EXPLICIT_TRIGGERS,
  maxAgents: 3,
  maxSpawnDepth: 1,
  writerPolicy: "leader_only",
  confidenceThreshold: 0.72,
};

const CLASSIFIER_TIMEOUT_MS = 4_000;
const MIN_LLM_CLASSIFIER_CANDIDATE_SCORE = 0.16;
const MAX_CLASSIFIER_CONTEXT_CHARS = 4_000;

const HIGH_RISK_RE =
  /\b(delete|remove|rm\s+-rf|drop\s+table|truncate|commit|push|merge|deploy|release|publish|send|email|message|transfer|pay|purchase|buy|install|sudo|chmod|chown|write|overwrite|edit|modify)\b|删除|移除|提交|推送|合并|部署|发布|发送|发邮件|转账|付款|购买|安装|写入|修改/iu;

const SIMPLE_TASK_RE =
  /^(?:what|who|when|where|define|explain briefly|summari[sz]e briefly|翻译|解释|是什么|谁是|什么时候|哪里|几点|多少)\b/iu;

const COMPLEX_SIGNAL_PATTERNS: Array<[RegExp, number]> = [
  [
    /\b(compare|tradeoff|pros?\s+and\s+cons|evaluate|decision|architecture|design)\b|比较|权衡|取舍|方案|架构|设计/iu,
    0.22,
  ],
  [
    /\b(research|investigate|gather|sources?|evidence|market|literature)\b|调研|资料|来源|证据|检索/iu,
    0.2,
  ],
  [/\b(analy[sz]e|analysis|reason|diagnose|root cause|break down)\b|分析|推理|诊断|根因/iu, 0.16],
  [
    /\b(verify|validate|test|audit|review|risk|edge cases?|regression)\b|验证|校验|测试|审查|审核|风险|遗漏/iu,
    0.2,
  ],
  [
    /\b(plan|roadmap|migration|refactor|implementation strategy)\b|计划|路线图|迁移|重构|实施策略/iu,
    0.14,
  ],
  [/\b(multiple|several|parallel|independent|cross[- ]check)\b|多个|几种|并行|交叉验证/iu, 0.14],
];

function clampInt(value: unknown, fallback: number, min: number, max: number): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return fallback;
  }
  return Math.min(max, Math.max(min, Math.floor(value)));
}

function clampConfidence(value: unknown, fallback: number): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return fallback;
  }
  return Math.min(1, Math.max(0, value));
}

function normalizeTriggers(values: unknown): string[] {
  if (!Array.isArray(values)) {
    return DEFAULT_EXPLICIT_TRIGGERS;
  }
  const out: string[] = [];
  const seen = new Set<string>();
  for (const value of values) {
    const trimmed = typeof value === "string" ? value.trim() : "";
    const key = trimmed.toLowerCase();
    if (!trimmed || seen.has(key)) {
      continue;
    }
    seen.add(key);
    out.push(trimmed);
  }
  return out.length > 0 ? out : DEFAULT_EXPLICIT_TRIGGERS;
}

export function resolvePersonalTeamConfig(cfg?: VelaclawConfig): PersonalTeamResolvedConfig {
  const raw = cfg?.personalTeam;
  return {
    enabled: raw?.enabled ?? DEFAULT_PERSONAL_TEAM_CONFIG.enabled,
    autoAssist: raw?.autoAssist ?? DEFAULT_PERSONAL_TEAM_CONFIG.autoAssist,
    explicitTriggers: normalizeTriggers(raw?.explicitTriggers),
    maxAgents: clampInt(raw?.maxAgents, DEFAULT_PERSONAL_TEAM_CONFIG.maxAgents, 1, 8),
    maxSpawnDepth: clampInt(raw?.maxSpawnDepth, DEFAULT_PERSONAL_TEAM_CONFIG.maxSpawnDepth, 1, 5),
    writerPolicy: "leader_only",
    confidenceThreshold: clampConfidence(
      raw?.confidenceThreshold,
      DEFAULT_PERSONAL_TEAM_CONFIG.confidenceThreshold,
    ),
  };
}

function includesExplicitTrigger(message: string, triggers: string[]): boolean {
  const lower = message.toLowerCase();
  return triggers.some((trigger) => trigger && lower.includes(trigger.toLowerCase()));
}

function detectRiskLevel(message: string): PersonalTeamRiskLevel {
  if (HIGH_RISK_RE.test(message)) {
    return "high";
  }
  if (/\b(create|update|change|run|execute|call|configure)\b|创建|更新|执行|配置/iu.test(message)) {
    return "medium";
  }
  return "low";
}

function scoreComplexity(message: string): number {
  const trimmed = message.trim();
  if (!trimmed) {
    return 0;
  }
  let score = trimmed.length > 280 ? 0.16 : trimmed.length > 140 ? 0.08 : 0;
  let matchedSignals = 0;
  for (const [pattern, weight] of COMPLEX_SIGNAL_PATTERNS) {
    if (pattern.test(trimmed)) {
      score += weight;
      matchedSignals += 1;
    }
  }
  if (matchedSignals >= 3) {
    score += 0.16;
  }
  const asksForResearch =
    /\b(research|investigate|gather|collect|sources?|evidence|market|literature)\b|搜集|收集|整理|调研|资料|来源|证据|检索/iu.test(
      trimmed,
    );
  const asksForAnalysis =
    /\b(analy[sz]e|analysis|reason|evaluate|compare|tradeoff|diagnose)\b|分析|评估|比较|权衡|取舍|研判/iu.test(
      trimmed,
    );
  if (asksForResearch && asksForAnalysis) {
    score += 0.22;
  }
  const conjunctions = trimmed.match(
    /\b(and|then|also|plus|versus|vs\.?)\b|并且|同时|然后|以及|对比/giu,
  );
  if ((conjunctions?.length ?? 0) >= 2) {
    score += 0.12;
  }
  if (trimmed.includes("\n") || /[;；].*[;；]/u.test(trimmed)) {
    score += 0.08;
  }
  if (SIMPLE_TASK_RE.test(trimmed) && trimmed.length < 180) {
    score -= 0.18;
  }
  return Math.min(1, Math.max(0, score));
}

const DEFAULT_ROLE_SCOPES: Record<PersonalTeamRoleAssignment["role"], string> = {
  researcher: "Collect facts, source material, and relevant context for the user request.",
  analyst: "Reason over the gathered material, compare options, and structure conclusions.",
  verifier: "Check for gaps, conflicts, stale facts, and verification or test needs.",
};

function isTextContentBlock(block: { type: string }): block is TextContent {
  return block.type === "text";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isPersonalTeamMode(value: unknown): value is PersonalTeamMode {
  return value === "solo" || value === "assist" || value === "team";
}

function isPersonalTeamRiskLevel(value: unknown): value is PersonalTeamRiskLevel {
  return value === "low" || value === "medium" || value === "high";
}

function isAssignableRole(value: unknown): value is PersonalTeamRoleAssignment["role"] {
  return value === "researcher" || value === "analyst" || value === "verifier";
}

function riskRank(value: PersonalTeamRiskLevel): number {
  if (value === "high") {
    return 2;
  }
  if (value === "medium") {
    return 1;
  }
  return 0;
}

function maxRiskLevel(a: PersonalTeamRiskLevel, b: PersonalTeamRiskLevel): PersonalTeamRiskLevel {
  return riskRank(a) >= riskRank(b) ? a : b;
}

function roleAssignmentsForMessage(
  message: string,
  mode: Exclude<PersonalTeamMode, "solo">,
  maxAgents: number,
): PersonalTeamRoleAssignment[] {
  const desired: PersonalTeamRoleAssignment[] = [];
  const add = (role: PersonalTeamRoleAssignment["role"], scope: string) => {
    if (desired.some((entry) => entry.role === role) || desired.length >= maxAgents) {
      return;
    }
    desired.push({ role, label: role, scope });
  };

  add("researcher", DEFAULT_ROLE_SCOPES.researcher);
  if (
    /\b(compare|tradeoff|evaluate|analy[sz]e|decision|architecture|design)\b|比较|分析|权衡|方案|架构|设计/iu.test(
      message,
    ) ||
    mode === "team"
  ) {
    add("analyst", DEFAULT_ROLE_SCOPES.analyst);
  }
  if (
    /\b(verify|validate|test|audit|review|risk|edge cases?|regression)\b|验证|测试|审查|风险|遗漏/iu.test(
      message,
    ) ||
    mode === "team"
  ) {
    add("verifier", DEFAULT_ROLE_SCOPES.verifier);
  }
  if (mode === "assist" && desired.length > 2) {
    return desired.slice(0, 2);
  }
  return desired.slice(0, maxAgents);
}

function normalizeClassifierRoles(
  roles: PersonalTeamClassifierRole[] | undefined,
  mode: Exclude<PersonalTeamMode, "solo">,
  maxAgents: number,
  fallbackMessage: string,
): PersonalTeamRoleAssignment[] {
  const desired: PersonalTeamRoleAssignment[] = [];
  const add = (role: PersonalTeamRoleAssignment["role"], label?: string, scope?: string) => {
    if (desired.some((entry) => entry.role === role) || desired.length >= maxAgents) {
      return;
    }
    desired.push({
      role,
      label: label?.trim() || role,
      scope: scope?.trim() || DEFAULT_ROLE_SCOPES[role],
    });
  };

  for (const value of roles ?? []) {
    if (typeof value === "string") {
      if (isAssignableRole(value)) {
        add(value);
      }
      continue;
    }
    if (!isRecord(value) || !isAssignableRole(value.role)) {
      continue;
    }
    add(
      value.role,
      typeof value.label === "string" ? value.label : undefined,
      typeof value.scope === "string" ? value.scope : undefined,
    );
  }

  if (desired.length === 0) {
    return roleAssignmentsForMessage(fallbackMessage, mode, maxAgents);
  }
  if (mode === "assist" && desired.length > 2) {
    return desired.slice(0, 2);
  }
  return desired.slice(0, maxAgents);
}

function soloDecision(reason: string, riskLevel: PersonalTeamRiskLevel): PersonalTeamRouteDecision {
  return {
    mode: "solo",
    confidence: 1,
    reason,
    roles: [],
    riskLevel,
    requiresUserConfirmation: riskLevel === "high",
    explicit: false,
  };
}

function buildClassifierPrompt(input: PersonalTeamClassifierInput): string {
  const recentContext = input.recentContextSummary?.trim();
  const boundedRecentContext =
    recentContext && recentContext.length > MAX_CLASSIFIER_CONTEXT_CHARS
      ? `${recentContext.slice(0, MAX_CLASSIFIER_CONTEXT_CHARS)}\n[truncated classifier context: ${
          recentContext.length - MAX_CLASSIFIER_CONTEXT_CHARS
        } characters omitted]`
      : recentContext;
  return [
    "You are a routing classifier for a single-user temporary personal agent team.",
    "Decide whether this user turn should run solo, use 1-2 read-only helper agents, or use a 3-agent read-only team.",
    "",
    "Return ONLY valid JSON with this shape:",
    '{"mode":"solo|assist|team","confidence":0.0,"reason":"short reason","roles":[{"role":"researcher|analyst|verifier","scope":"short scope"}],"riskLevel":"low|medium|high","requiresUserConfirmation":false}',
    "",
    "Routing policy:",
    "- solo: simple Q&A, one-step lookup, narrow edits, low-confidence cases, or tasks where helpers would not materially help.",
    "- assist: complex requests that benefit from one or two independent read-only helpers, such as research plus analysis, comparison, review, or verification.",
    "- team: broad multi-part requests that clearly benefit from separate research, analysis, and verification work.",
    "- high risk means writing, deleting, sending, deploying, purchasing, committing, pushing, or otherwise changing external state.",
    "- Helpers are read-only. The leader owns the final answer and all write/high-risk actions.",
    "- Use roles only from researcher, analyst, verifier. Omit roles for solo.",
    "",
    `Deterministic risk precheck: ${input.riskLevel}`,
    `Generic heuristic confidence: ${input.heuristicConfidence.toFixed(2)}`,
    boundedRecentContext ? `Recent context summary:\n${boundedRecentContext}` : undefined,
    input.availableAgentIds?.length
      ? `Available agent ids: ${input.availableAgentIds.join(", ")}`
      : undefined,
    "",
    "User turn:",
    input.userMessage,
  ]
    .filter((part): part is string => Boolean(part))
    .join("\n");
}

function findBalancedJsonObjectText(text: string, start: number): string | null {
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let index = start; index < text.length; index += 1) {
    const char = text[index];
    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (char === "\\") {
        escaped = true;
      } else if (char === '"') {
        inString = false;
      }
      continue;
    }
    if (char === '"') {
      inString = true;
      continue;
    }
    if (char === "{") {
      depth += 1;
      continue;
    }
    if (char !== "}") {
      continue;
    }
    depth -= 1;
    if (depth === 0) {
      return text.slice(start, index + 1);
    }
  }
  return null;
}

function parseFirstClassifierJsonObject(text: string): Record<string, unknown> | undefined {
  const trimmed = text.trim();
  const fenced = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/iu);
  const candidate = fenced?.[1]?.trim() || trimmed;
  for (let index = candidate.indexOf("{"); index >= 0; index = candidate.indexOf("{", index + 1)) {
    const jsonText = findBalancedJsonObjectText(candidate, index);
    if (!jsonText) {
      continue;
    }
    try {
      const parsed = JSON.parse(jsonText) as unknown;
      if (isRecord(parsed)) {
        return parsed;
      }
    } catch {
      continue;
    }
  }
  return undefined;
}

function parseClassifierOutput(text: string): PersonalTeamClassifierOutput | undefined {
  const parsed = parseFirstClassifierJsonObject(text);
  if (!parsed) {
    return undefined;
  }
  return {
    mode: isPersonalTeamMode(parsed.mode) ? parsed.mode : undefined,
    confidence:
      typeof parsed.confidence === "number" && Number.isFinite(parsed.confidence)
        ? parsed.confidence
        : undefined,
    reason: typeof parsed.reason === "string" ? parsed.reason : undefined,
    roles: Array.isArray(parsed.roles) ? (parsed.roles as PersonalTeamClassifierRole[]) : undefined,
    riskLevel: isPersonalTeamRiskLevel(parsed.riskLevel) ? parsed.riskLevel : undefined,
    requiresUserConfirmation:
      typeof parsed.requiresUserConfirmation === "boolean"
        ? parsed.requiresUserConfirmation
        : undefined,
  };
}

async function classifyWithDefaultLlm(
  input: PersonalTeamClassifierInput,
): Promise<PersonalTeamClassifierOutput | undefined> {
  if (!input.cfg || !input.agentId) {
    return undefined;
  }
  const prepared = await prepareSimpleCompletionModelForAgent({
    cfg: input.cfg,
    agentId: input.agentId,
  });
  if ("error" in prepared) {
    return undefined;
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), CLASSIFIER_TIMEOUT_MS);
  try {
    const result = await completeSimple(
      prepared.model,
      {
        messages: [
          {
            role: "user",
            content: buildClassifierPrompt(input),
            timestamp: Date.now(),
          },
        ],
      },
      {
        apiKey: prepared.auth.apiKey,
        maxTokens: 500,
        temperature: 0,
        signal: controller.signal,
      },
    );
    const text = result.content
      .filter(isTextContentBlock)
      .map((block) => block.text)
      .join("")
      .trim();
    return parseClassifierOutput(text);
  } catch {
    return undefined;
  } finally {
    clearTimeout(timeout);
  }
}

async function runClassifier(
  input: PersonalTeamClassifierInput,
  override?: PersonalTeamClassifier,
): Promise<PersonalTeamClassifierOutput | undefined> {
  const classifier = override ?? classifyWithDefaultLlm;
  try {
    return await classifier(input);
  } catch {
    return undefined;
  }
}

function shouldRunLlmClassifier(message: string, heuristicConfidence: number): boolean {
  if (heuristicConfidence >= MIN_LLM_CLASSIFIER_CANDIDATE_SCORE) {
    return true;
  }
  const trimmed = message.trim();
  return trimmed.length > 140 && !SIMPLE_TASK_RE.test(trimmed);
}

function routeFromClassifierOutput(params: {
  output: PersonalTeamClassifierOutput | undefined;
  message: string;
  config: PersonalTeamResolvedConfig;
  fallbackConfidence: number;
  fallbackRiskLevel: PersonalTeamRiskLevel;
}): PersonalTeamRouteDecision | undefined {
  const output = params.output;
  if (!output?.mode) {
    return undefined;
  }
  const riskLevel = output.riskLevel
    ? maxRiskLevel(params.fallbackRiskLevel, output.riskLevel)
    : params.fallbackRiskLevel;
  const confidence = clampConfidence(output.confidence, params.fallbackConfidence);
  const requiresUserConfirmation = riskLevel === "high" || output.requiresUserConfirmation === true;
  if (output.mode === "solo" || confidence < params.config.confidenceThreshold) {
    return {
      ...soloDecision(output.reason || "classifier_below_threshold", riskLevel),
      confidence,
      requiresUserConfirmation,
    };
  }
  if (riskLevel === "high") {
    return {
      ...soloDecision("high_risk_auto_team_blocked", riskLevel),
      confidence,
      requiresUserConfirmation: true,
    };
  }
  const mode: Exclude<PersonalTeamMode, "solo"> = output.mode === "team" ? "team" : "assist";
  const roles = normalizeClassifierRoles(
    output.roles,
    mode,
    params.config.maxAgents,
    params.message,
  );
  return {
    mode,
    confidence,
    reason: output.reason || "llm_task_classifier",
    roles,
    riskLevel,
    requiresUserConfirmation,
    explicit: false,
  };
}

export async function routePersonalTeam(
  input: PersonalTeamRouterInput,
): Promise<PersonalTeamRouteDecision> {
  const config = resolvePersonalTeamConfig(input.cfg);
  const message = input.userMessage.trim();
  const riskLevel = detectRiskLevel(message);
  if (!config.enabled) {
    return soloDecision("personal_team_disabled", riskLevel);
  }
  const currentDepth = getSubagentDepthFromSessionStore(input.sessionKey, { cfg: input.cfg });
  if (currentDepth >= config.maxSpawnDepth) {
    return soloDecision("max_spawn_depth_reached", riskLevel);
  }

  const explicit = includesExplicitTrigger(message, config.explicitTriggers);
  if (explicit) {
    const roles = roleAssignmentsForMessage(message, "team", config.maxAgents);
    return {
      mode: "team",
      confidence: 1,
      reason: "explicit_personal_team_trigger",
      roles,
      riskLevel,
      requiresUserConfirmation: riskLevel === "high",
      explicit: true,
    };
  }

  if (!config.autoAssist) {
    return soloDecision("auto_assist_disabled", riskLevel);
  }
  if (riskLevel === "high") {
    return {
      ...soloDecision("high_risk_auto_team_blocked", riskLevel),
      confidence: 0.65,
    };
  }

  const confidence = scoreComplexity(message);
  if (shouldRunLlmClassifier(message, confidence)) {
    const classifierDecision = routeFromClassifierOutput({
      output: await runClassifier(
        {
          cfg: input.cfg,
          userMessage: input.userMessage,
          sessionKey: input.sessionKey,
          agentId: input.agentId,
          recentContextSummary: input.recentContextSummary,
          availableAgentIds: input.availableAgentIds,
          config,
          heuristicConfidence: confidence,
          riskLevel,
        },
        input.classifier,
      ),
      message,
      config,
      fallbackConfidence: confidence,
      fallbackRiskLevel: riskLevel,
    });
    if (classifierDecision) {
      return classifierDecision;
    }
  }

  if (confidence < config.confidenceThreshold) {
    return {
      ...soloDecision("classifier_below_threshold", riskLevel),
      confidence,
    };
  }

  const mode: Exclude<PersonalTeamMode, "solo"> =
    confidence >= Math.max(0.86, config.confidenceThreshold + 0.12) && config.maxAgents >= 3
      ? "team"
      : "assist";
  const roles = roleAssignmentsForMessage(message, mode, config.maxAgents);
  return {
    mode,
    confidence,
    reason: "complex_task_classifier",
    roles,
    riskLevel,
    requiresUserConfirmation: false,
    explicit: false,
  };
}

export const __testing = {
  DEFAULT_EXPLICIT_TRIGGERS,
  scoreComplexity,
  detectRiskLevel,
  parseClassifierOutput,
  shouldRunLlmClassifier,
};
