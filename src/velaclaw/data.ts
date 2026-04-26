import { execFile } from "node:child_process";
import crypto from "node:crypto";
import { EventEmitter } from "node:events";
import fs from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { mergeIdentityMarkdownContent } from "../agents/identity-file.js";
import {
  isKnownEnvApiKeyMarker,
  NON_ENV_SECRETREF_MARKER,
  SECRETREF_ENV_HEADER_MARKER_PREFIX,
} from "../agents/model-auth-markers.js";
import { resolveCommandConfigWithSecrets } from "../cli/command-config-resolution.js";
import { getModelsCommandSecretTargetIds } from "../cli/command-secret-targets.js";
import { loadConfig } from "../config/config.js";
import type { ModelProviderConfig } from "../config/types.models.js";
import {
  coerceSecretRef,
  isValidEnvSecretRefId,
  normalizeSecretInputString,
} from "../config/types.secrets.js";
import {
  downloadClawHubSkillArchive,
  fetchClawHubSkillDetail,
  resolveClawHubAuthToken,
  searchClawHubSkills,
  type ClawHubSkillDetail,
  type ClawHubSkillSearchResult,
} from "../infra/clawhub.js";
import { withExtractedArchiveRoot } from "../infra/install-flow.js";
import { safeEqualSecret } from "../security/secret-equal.js";
import { buildAssetServerKindList, resolveTeamAssetTypeRuntime } from "./asset-types.js";
import {
  ensureVelaclawControlPlaneStateInitialized,
  readVelaclawControlPlaneStateSync,
  resolveActiveVelaclawRoot,
  resolveManagerDefaultModelId,
  resolveManagerLocalProviderId,
} from "./workspace.js";

export * from "./types.js";
import type {
  AcceptInvitationInput,
  AcceptInvitationResult,
  AssetChangeEvent,
  AssetServerBundle,
  AssetServerFile,
  AssetServerItem,
  AssetServerKind,
  AssetServerManifest,
  AssetServerManifestItem,
  AssetServerResolveMatch,
  AssetServerResolveResult,
  AuditEntry,
  AuditEventType,
  AuditLogPage,
  CreateAssetProposalInput,
  CreateInvitationInput,
  CreateTeamInput,
  EvolutionConfig,
  EvolutionDigest,
  EvolutionResult,
  EvolutionState,
  MemberHeartbeat,
  MemberQuota,
  MemberRecord,
  ProvisionMemberInput,
  ProvisionMemberResult,
  RemoveMemberResult,
  TeamAssetActionResult,
  TeamAssetCategory,
  TeamAssetPermissions,
  TeamAssetRecord,
  TeamAssetRolePolicy,
  TeamBackupManifest,
  TeamBackupResult,
  TeamInvitation,
  TeamMemberPolicy,
  TeamModelGateway,
  TeamProfile,
  TeamRestoreResult,
  TeamState,
  TeamsState,
  UpdateMemberQuotaInput,
} from "./types.js";

// ============ Constants ============

export class HttpError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.name = "HttpError";
    this.status = status;
  }
}

const execFileAsync = promisify(execFile);
const ROOT = resolveActiveVelaclawRoot(undefined, process.env);
const MEMBERS_ROOT = path.join(ROOT, "members");
const STATE_ROOT = path.join(ROOT, "state");
const TEAM_STATE_PATH = path.join(STATE_ROOT, "team.json");
const AUDIT_DIR = path.join(STATE_ROOT, "audit");
const EVOLUTION_STATE_DIR = path.join(STATE_ROOT, "evolution");
const MEMBER_TEMPLATE_ID = "member-template";
const MEMBER_ID_RE = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/;
const DEFAULT_MEMBER_PORT = 18800;
const EVOLUTION_SYSTEM_ACTOR = "system-evolution";
const HEARTBEAT_STALE_MS = 120_000;
const DEFAULT_TEAM_CONTROL_PORT = "4318";
const DEFAULT_MEMBER_STATE_DIR = "/home/node/.velaclaw";
const DEFAULT_TEAM_SHARED_ASSET_MOUNT_DIR = "/srv/team-shared";
const MEMBER_TELEGRAM_BOT_TOKEN_FILENAME = "telegram-bot-token";
const PRIVATE_MEMBER_DIR_PREFIX = "private-";
const RESOLVED_MODEL_PROVIDER_CACHE_TTL_MS = 10_000;

const DEFAULT_TEAM_MODEL_PROVIDER_ID =
  process.env.VELACLAW_TEAM_MODEL_PROVIDER_ID?.trim() || "team-gateway";
const DEFAULT_MANAGER_LOCAL_PROVIDER_ID = resolveManagerLocalProviderId(process.env);
const DEFAULT_MANAGER_LOCAL_MODEL_ID = resolveManagerDefaultModelId(process.env);
const DEFAULT_UPSTREAM_BASE_URL =
  process.env.VELACLAW_MODEL_UPSTREAM_BASE_URL?.trim() ||
  process.env.OPENAI_BASE_URL?.trim() ||
  "https://api.openai.com/v1";
const DEFAULT_CANONICAL_OPENAI_BASE_URL = "https://api.openai.com/v1";
const DEFAULT_UPSTREAM_API_KEY_ENV =
  process.env.VELACLAW_MODEL_UPSTREAM_API_KEY_ENV?.trim() || "OPENAI_API_KEY";
const DEFAULT_ALLOWED_MODEL_IDS = process.env.VELACLAW_TEAM_ALLOWED_MODEL_IDS?.split(",")
  .map((e) => e.trim())
  .filter(Boolean) || [DEFAULT_MANAGER_LOCAL_MODEL_ID];
const DEFAULT_DEFAULT_MODEL_ID =
  process.env.VELACLAW_TEAM_DEFAULT_MODEL_ID?.trim() || DEFAULT_ALLOWED_MODEL_IDS[0];
const CLAWHUB_SKILL_ASSET_ID_PREFIX = "clawhub-skill:";
const CLAWHUB_SKILL_HUB_ASSET_ID = "clawhub-skill-hub";
const CLAWHUB_SKILL_SEARCH_LIMIT = Math.max(
  1,
  Math.min(
    10,
    Number.parseInt(process.env.VELACLAW_TEAM_CLAWHUB_SKILLS_SEARCH_LIMIT ?? "8", 10) || 8,
  ),
);
const CLAWHUB_SKILL_LOCAL_RELEVANCE_MIN_SCORE = 7;
const CLAWHUB_SKILL_FILE_LIMIT = Math.max(
  1,
  Math.min(
    300,
    Number.parseInt(process.env.VELACLAW_TEAM_CLAWHUB_SKILLS_FILE_LIMIT ?? "160", 10) || 160,
  ),
);
const CLAWHUB_SKILL_FILE_MAX_BYTES = Math.max(
  4096,
  Math.min(
    512_000,
    Number.parseInt(process.env.VELACLAW_TEAM_CLAWHUB_SKILLS_FILE_MAX_BYTES ?? "262144", 10) ||
      262_144,
  ),
);
const CLAWHUB_SKILL_TOTAL_MAX_BYTES = Math.max(
  32_768,
  Math.min(
    2_000_000,
    Number.parseInt(process.env.VELACLAW_TEAM_CLAWHUB_SKILLS_TOTAL_MAX_BYTES ?? "1048576", 10) ||
      1_048_576,
  ),
);
const ASSET_ROUTER_MODE_DYNAMIC_LLM = "dynamic-llm";
const ASSET_ROUTER_MODE_LEXICAL = "lexical";
const ASSET_ROUTER_TOP_K = Math.max(
  1,
  Math.min(40, Number.parseInt(process.env.VELACLAW_TEAM_ASSET_ROUTER_TOP_K ?? "12", 10) || 12),
);
const ASSET_ROUTER_TIMEOUT_MS = Math.max(
  250,
  Math.min(
    30_000,
    Number.parseInt(process.env.VELACLAW_TEAM_ASSET_ROUTER_TIMEOUT_MS ?? "2000", 10) || 2000,
  ),
);
const ASSET_ROUTER_DISCOVERY_QUERY_LIMIT = Math.max(
  1,
  Math.min(5, Number.parseInt(process.env.VELACLAW_TEAM_ASSET_ROUTER_QUERY_LIMIT ?? "3", 10) || 3),
);
const ASSET_ROUTER_MIN_CONFIDENCE = Math.max(
  0,
  Math.min(
    1,
    Number.isFinite(Number.parseFloat(process.env.VELACLAW_TEAM_ASSET_ROUTER_MIN_CONFIDENCE ?? ""))
      ? Number.parseFloat(process.env.VELACLAW_TEAM_ASSET_ROUTER_MIN_CONFIDENCE ?? "0.45")
      : 0.45,
  ),
);
const ASSET_ROUTER_THINK_LEVEL =
  process.env.VELACLAW_TEAM_ASSET_ROUTER_THINK_LEVEL?.trim().toLowerCase() || "low";
const ASSET_ROUTER_MODEL = process.env.VELACLAW_TEAM_ASSET_ROUTER_MODEL?.trim();

type ResolvedUpstreamRequestConfig = {
  baseUrl: string;
  headers: Record<string, string>;
  providerId: string;
  mapRequestedModel?: (modelId: string) => string;
};

let resolvedModelProviderCache: {
  loadedAt: number;
  providers: Record<string, ModelProviderConfig> | null;
} | null = null;
let resolvedModelProviderInflight: Promise<Record<string, ModelProviderConfig> | null> | null =
  null;

export const assetChangeEmitter = new EventEmitter();

type AssetRouterMode = typeof ASSET_ROUTER_MODE_DYNAMIC_LLM | typeof ASSET_ROUTER_MODE_LEXICAL;

type AssetRouterPlan = {
  needsAssets: boolean;
  confidence?: number;
  searchQueries: string[];
  reason?: string;
};

type AssetRouterSelection = {
  id: string;
  confidence?: number;
  reason?: string;
};

type AssetRouterCandidate = {
  match: AssetServerResolveMatch;
  source: "local" | "clawhub";
};

// ============ Utilities ============

function nowIso() {
  return new Date().toISOString();
}

async function fileExists(p: string) {
  try {
    await fs.access(p);
    return true;
  } catch {
    return false;
  }
}
async function safeStat(p: string) {
  try {
    return await fs.stat(p);
  } catch {
    return null;
  }
}
async function readText(p: string) {
  return fs.readFile(p, "utf8");
}
async function writeText(p: string, content: string) {
  await fs.mkdir(path.dirname(p), { recursive: true });
  await fs.writeFile(p, content, "utf8");
}

function normalizeOptionalString(value: string | undefined | null): string {
  return typeof value === "string" ? value.trim() : "";
}

function shouldAutoStartAcceptedMemberRuntime(env: NodeJS.ProcessEnv = process.env): boolean {
  const explicit = normalizeOptionalString(env.VELACLAW_MEMBER_AUTOSTART).toLowerCase();
  if (explicit) {
    return explicit !== "0" && explicit !== "false" && explicit !== "off";
  }
  return env.VELACLAW_TEST_FAST !== "1";
}

function resolveAcceptedMemberHealthTimeoutMs(env: NodeJS.ProcessEnv = process.env): number {
  const raw = Number(env.VELACLAW_MEMBER_HEALTH_TIMEOUT_MS ?? 60_000);
  return Number.isFinite(raw) && raw > 0 ? raw : 60_000;
}

async function sleep(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForAcceptedMemberRuntimeHealth(
  port: number,
  env: NodeJS.ProcessEnv = process.env,
): Promise<void> {
  const timeoutMs = resolveAcceptedMemberHealthTimeoutMs(env);
  const startedAt = Date.now();
  let lastError = "runtime not ready";
  while (Date.now() - startedAt < timeoutMs) {
    try {
      const response = await fetch(`http://127.0.0.1:${port}/healthz`);
      if (response.ok) {
        return;
      }
      lastError = `healthz returned ${response.status}`;
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
    }
    await sleep(1000);
  }
  throw new Error(`timed out waiting for member runtime on port ${port}: ${lastError}`);
}

function normalizePosixDir(value: string | undefined, fallback: string): string {
  const raw = normalizeOptionalString(value) || fallback;
  const normalized = raw.replace(/\\/g, "/").replace(/\/+$/, "");
  return normalized || fallback;
}

function resolveMemberRuntimeStateDir(env: NodeJS.ProcessEnv = process.env): string {
  return normalizePosixDir(env.VELACLAW_MEMBER_STATE_DIR, DEFAULT_MEMBER_STATE_DIR);
}

function resolveMemberRuntimeWorkspaceDir(env: NodeJS.ProcessEnv = process.env): string {
  return normalizePosixDir(
    env.VELACLAW_WORKSPACE_DIR,
    `${resolveMemberRuntimeStateDir(env)}/workspace`,
  );
}

function resolveMemberRuntimeLocalPluginsDir(env: NodeJS.ProcessEnv = process.env): string {
  return normalizePosixDir(
    env.VELACLAW_MEMBER_LOCAL_PLUGINS_DIR,
    `${resolveMemberRuntimeStateDir(env)}/local-plugins`,
  );
}

function resolveMemberSharedAssetsStatePath(env: NodeJS.ProcessEnv = process.env): string {
  const explicit = normalizeOptionalString(env.VELACLAW_SHARED_ASSETS_STATE_PATH);
  return explicit || `${resolveMemberRuntimeStateDir(env)}/shared-assets-state.json`;
}

function resolveMemberRuntimePaths(env: NodeJS.ProcessEnv = process.env) {
  const stateDir = resolveMemberRuntimeStateDir(env);
  const workspaceDir = resolveMemberRuntimeWorkspaceDir(env);
  const localPluginsDir = resolveMemberRuntimeLocalPluginsDir(env);
  return {
    stateDir,
    workspaceDir,
    localPluginsDir,
    policyPath: `${stateDir}/team-policy.json`,
    usagePath: `${stateDir}/team-usage.json`,
    sharedAssetsStatePath: resolveMemberSharedAssetsStatePath(env),
    sharedAssetMountDir: normalizePosixDir(
      env.VELACLAW_TEAM_SHARED_ASSET_MOUNT_DIR,
      DEFAULT_TEAM_SHARED_ASSET_MOUNT_DIR,
    ),
  };
}

function resolveTeamControlHost(env: NodeJS.ProcessEnv = process.env): string {
  return normalizeOptionalString(env.VELACLAW_TEAM_CONTROL_HOST) || "host.docker.internal";
}

function resolveTeamControlPort(env: NodeJS.ProcessEnv = process.env): string {
  return (
    normalizeOptionalString(env.VELACLAW_CONTROL_PORT) ||
    normalizeOptionalString(env.PORT) ||
    DEFAULT_TEAM_CONTROL_PORT
  );
}

function resolveManagerGatewayBaseUrl(env: NodeJS.ProcessEnv = process.env): string {
  const explicit = normalizeOptionalString(env.VELACLAW_MANAGER_GATEWAY_BASE_URL);
  if (explicit) {
    return explicit.replace(/\/+$/, "");
  }
  const port = normalizeOptionalString(env.VELACLAW_MANAGER_GATEWAY_PORT) || "18789";
  return `http://127.0.0.1:${port}/v1`;
}

function resolveUrlHostname(urlLike: string): string | null {
  try {
    return new URL(urlLike).hostname.trim().toLowerCase() || null;
  } catch {
    return null;
  }
}

function isPrivateIpv4(hostname: string): boolean {
  const match = /^(\d+)\.(\d+)\.(\d+)\.(\d+)$/.exec(hostname);
  if (!match) {
    return false;
  }
  const octets = match.slice(1).map((entry) => Number(entry));
  if (octets.some((value) => !Number.isInteger(value) || value < 0 || value > 255)) {
    return false;
  }
  const [a, b] = octets;
  return a === 10 || a === 127 || (a === 192 && b === 168) || (a === 172 && b >= 16 && b <= 31);
}

function shouldBypassProxyForHost(hostname: string | null): boolean {
  if (!hostname) {
    return false;
  }
  const normalized = hostname.trim().toLowerCase();
  return (
    normalized === "localhost" ||
    normalized === "::1" ||
    normalized === "host.docker.internal" ||
    isPrivateIpv4(normalized)
  );
}

function mergeNoProxyEntries(
  existing: string | undefined,
  opts?: { additionalHosts?: Array<string | null | undefined>; includeLocalDefaults?: boolean },
): string {
  const entries = new Set(
    (existing || "")
      .split(",")
      .map((entry) => entry.trim())
      .filter(Boolean),
  );
  if (opts?.includeLocalDefaults !== false) {
    for (const entry of ["127.0.0.1", "localhost", "::1"]) {
      entries.add(entry);
    }
  }
  for (const host of opts?.additionalHosts || []) {
    if (host && shouldBypassProxyForHost(host)) {
      entries.add(host);
    }
  }
  return Array.from(entries).join(",");
}

function yamlQuoted(value: string): string {
  return JSON.stringify(value);
}

function rewriteContainerLoopbackUrl(value: string, replacementHost: string): string {
  const trimmed = normalizeOptionalString(value);
  if (!trimmed || !replacementHost) {
    return trimmed;
  }
  try {
    const url = new URL(trimmed);
    const hostname = url.hostname.trim().toLowerCase();
    if (hostname === "127.0.0.1" || hostname === "localhost" || hostname === "::1") {
      url.hostname = replacementHost;
      return url.toString();
    }
  } catch {
    // preserve non-URL proxy values as-is
  }
  return trimmed;
}

function resolveBakedProxyEnv(
  env: NodeJS.ProcessEnv = process.env,
  teamControlBaseUrl = resolveTeamControlBaseUrl(env),
) {
  const controlHost = resolveUrlHostname(teamControlBaseUrl);
  const containerProxyHost =
    controlHost && controlHost !== "localhost" && controlHost !== "::1"
      ? controlHost
      : "host.docker.internal";
  return {
    HTTP_PROXY: rewriteContainerLoopbackUrl(env.HTTP_PROXY ?? "", containerProxyHost),
    HTTPS_PROXY: rewriteContainerLoopbackUrl(env.HTTPS_PROXY ?? "", containerProxyHost),
    ALL_PROXY: rewriteContainerLoopbackUrl(env.ALL_PROXY ?? "", containerProxyHost),
    http_proxy: rewriteContainerLoopbackUrl(env.http_proxy ?? "", containerProxyHost),
    https_proxy: rewriteContainerLoopbackUrl(env.https_proxy ?? "", containerProxyHost),
    all_proxy: rewriteContainerLoopbackUrl(env.all_proxy ?? "", containerProxyHost),
    NO_PROXY: mergeNoProxyEntries(normalizeOptionalString(env.NO_PROXY), {
      additionalHosts: [controlHost],
    }),
    no_proxy: mergeNoProxyEntries(normalizeOptionalString(env.no_proxy), {
      additionalHosts: [controlHost],
    }),
  };
}

function shouldBakeMemberProxyEnv(env: NodeJS.ProcessEnv = process.env): boolean {
  const explicit = normalizeOptionalString(env.VELACLAW_MEMBER_INHERIT_PROXY).toLowerCase();
  if (!explicit) {
    return false;
  }
  return explicit !== "0" && explicit !== "false" && explicit !== "off";
}

function resolveMemberRuntimeProxyEnv(
  env: NodeJS.ProcessEnv = process.env,
  teamControlBaseUrl = resolveTeamControlBaseUrl(env),
) {
  if (shouldBakeMemberProxyEnv(env)) {
    return resolveBakedProxyEnv(env, teamControlBaseUrl);
  }
  const controlHost = resolveUrlHostname(teamControlBaseUrl);
  return {
    HTTP_PROXY: "",
    HTTPS_PROXY: "",
    ALL_PROXY: "",
    http_proxy: "",
    https_proxy: "",
    all_proxy: "",
    NO_PROXY: mergeNoProxyEntries("", {
      additionalHosts: [controlHost],
    }),
    no_proxy: mergeNoProxyEntries("", {
      additionalHosts: [controlHost],
    }),
  };
}

async function readResolvedModelProviders(): Promise<Record<string, ModelProviderConfig> | null> {
  const now = Date.now();
  if (
    resolvedModelProviderCache &&
    now - resolvedModelProviderCache.loadedAt < RESOLVED_MODEL_PROVIDER_CACHE_TTL_MS
  ) {
    return resolvedModelProviderCache.providers;
  }
  if (resolvedModelProviderInflight) {
    return resolvedModelProviderInflight;
  }

  resolvedModelProviderInflight = (async () => {
    let providers: Record<string, ModelProviderConfig> | null = null;
    try {
      const config = loadConfig();
      const { resolvedConfig } = await resolveCommandConfigWithSecrets({
        config,
        commandName: "velaclaw-team-control",
        targetIds: getModelsCommandSecretTargetIds(),
        mode: "read_only_operational",
      });
      providers = resolvedConfig.models?.providers ?? null;
    } catch {
      try {
        providers = loadConfig().models?.providers ?? null;
      } catch {
        providers = null;
      }
    }
    resolvedModelProviderCache = { loadedAt: Date.now(), providers };
    resolvedModelProviderInflight = null;
    return providers;
  })();

  return resolvedModelProviderInflight;
}

function readConfiguredPrimaryModelRef(config: ReturnType<typeof loadConfig>): string {
  const modelConfig = config.agents?.defaults?.model;
  if (typeof modelConfig === "string") {
    return modelConfig.trim();
  }
  if (modelConfig && typeof modelConfig === "object" && typeof modelConfig.primary === "string") {
    return modelConfig.primary.trim();
  }
  return "";
}

function readConfiguredGatewayToken(
  config: ReturnType<typeof loadConfig>,
  env: NodeJS.ProcessEnv = process.env,
): string {
  const gatewayAuth = config.gateway?.auth;
  if (!gatewayAuth || typeof gatewayAuth !== "object") {
    return "";
  }
  const mode = typeof gatewayAuth.mode === "string" ? gatewayAuth.mode.trim() : "";
  if (mode && mode !== "token") {
    return "";
  }
  return resolveConfiguredSecretValue((gatewayAuth as Record<string, unknown>).token, env) ?? "";
}

function resolveConfiguredSecretValue(
  value: unknown,
  env: NodeJS.ProcessEnv = process.env,
): string | undefined {
  const normalized = normalizeSecretInputString(value);
  if (normalized) {
    if (normalized === NON_ENV_SECRETREF_MARKER) {
      return undefined;
    }
    if (normalized.startsWith(SECRETREF_ENV_HEADER_MARKER_PREFIX)) {
      return normalizeSecretInputString(
        env[normalized.slice(SECRETREF_ENV_HEADER_MARKER_PREFIX.length)],
      );
    }
    if (
      (isKnownEnvApiKeyMarker(normalized) || isValidEnvSecretRefId(normalized)) &&
      normalizeSecretInputString(env[normalized])
    ) {
      return normalizeSecretInputString(env[normalized]);
    }
    return normalized;
  }
  const ref = coerceSecretRef(value);
  if (ref?.source === "env") {
    return normalizeSecretInputString(env[ref.id]);
  }
  return undefined;
}

function resolveConfiguredHeaderMap(
  headers: Record<string, unknown> | undefined,
  env: NodeJS.ProcessEnv = process.env,
): Record<string, string> {
  const resolved: Record<string, string> = {};
  if (!headers || typeof headers !== "object") {
    return resolved;
  }
  for (const [name, value] of Object.entries(headers)) {
    const resolvedValue = resolveConfiguredSecretValue(value, env);
    if (resolvedValue) {
      resolved[name] = resolvedValue;
    }
  }
  return resolved;
}

export async function resolveTeamModelGatewayUpstream(
  gateway: TeamModelGateway,
  env: NodeJS.ProcessEnv = process.env,
): Promise<ResolvedUpstreamRequestConfig> {
  if (gateway.mode === "proxy") {
    const config = loadConfig();
    const managerGatewayToken = readConfiguredGatewayToken(config, env);
    const primaryModelRef = readConfiguredPrimaryModelRef(config);
    const slashIndex = primaryModelRef.indexOf("/");
    const managerProviderId =
      slashIndex === -1
        ? DEFAULT_MANAGER_LOCAL_PROVIDER_ID
        : primaryModelRef.slice(0, slashIndex).trim();
    const effectiveProviderId =
      !managerProviderId || managerProviderId === DEFAULT_TEAM_MODEL_PROVIDER_ID
        ? DEFAULT_MANAGER_LOCAL_PROVIDER_ID
        : managerProviderId;

    return {
      baseUrl: resolveManagerGatewayBaseUrl(env),
      headers: managerGatewayToken ? { Authorization: `Bearer ${managerGatewayToken}` } : {},
      providerId: effectiveProviderId,
      mapRequestedModel: (modelId: string) => {
        const trimmed = modelId.trim();
        if (!trimmed) {
          return `${effectiveProviderId}/${gateway.defaultModelId}`;
        }
        return trimmed.includes("/") ? trimmed : `${effectiveProviderId}/${trimmed}`;
      },
    };
  }

  const configuredProviders = await readResolvedModelProviders();
  const configuredProvider =
    gateway.nativeProviderId && configuredProviders
      ? configuredProviders[gateway.nativeProviderId]
      : undefined;

  const headers = {
    ...resolveConfiguredHeaderMap(
      configuredProvider?.headers as Record<string, unknown> | undefined,
      env,
    ),
    ...resolveConfiguredHeaderMap(
      configuredProvider?.request?.headers as Record<string, unknown> | undefined,
      env,
    ),
  };

  const explicitAuth = configuredProvider?.request?.auth;
  if (explicitAuth?.mode === "authorization-bearer") {
    const token = resolveConfiguredSecretValue(explicitAuth.token, env);
    if (token) {
      headers.Authorization = `Bearer ${token}`;
    }
  } else if (explicitAuth?.mode === "header") {
    const value = resolveConfiguredSecretValue(explicitAuth.value, env);
    if (value) {
      headers[explicitAuth.headerName] = `${explicitAuth.prefix ?? ""}${value}`;
    }
  } else {
    const providerApiKey = resolveConfiguredSecretValue(configuredProvider?.apiKey, env);
    if (providerApiKey && configuredProvider?.authHeader !== false) {
      headers.Authorization = `Bearer ${providerApiKey}`;
    }
  }

  if (!headers.Authorization) {
    const upstreamApiKey = normalizeSecretInputString(env[gateway.upstreamApiKeyEnv]);
    if (upstreamApiKey) {
      headers.Authorization = `Bearer ${upstreamApiKey}`;
    }
  }

  const configuredGatewayBaseUrl = normalizeOptionalString(gateway.upstreamBaseUrl);
  const preferredBaseUrl =
    configuredGatewayBaseUrl && configuredGatewayBaseUrl !== DEFAULT_CANONICAL_OPENAI_BASE_URL
      ? configuredGatewayBaseUrl
      : "";

  return {
    baseUrl:
      preferredBaseUrl ||
      normalizeOptionalString(configuredProvider?.baseUrl) ||
      configuredGatewayBaseUrl ||
      DEFAULT_UPSTREAM_BASE_URL,
    headers,
    providerId: normalizeOptionalString(gateway.nativeProviderId) || "custom",
  };
}

export function slugifyTeamLabel(input: string): string {
  return (input || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 63);
}

function validateMemberId(id: string): string {
  const v = (id || "").trim().toLowerCase();
  if (!MEMBER_ID_RE.test(v)) {
    throw new HttpError(400, `invalid memberId: ${id}`);
  }
  return v;
}

function deriveRuntimeMemberIdFromEmail(email: string): string {
  const base = email
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 50);
  const hash = crypto.createHash("sha256").update(email).digest("hex").slice(0, 8);
  return `${base}-${hash}`;
}

function validateMemberEmail(email: string): string {
  const v = (email || "").trim().toLowerCase();
  if (!v.includes("@")) {
    throw new HttpError(400, `invalid email: ${email}`);
  }
  return v;
}

function teamMembersRoot(slug: string) {
  return path.join(MEMBERS_ROOT, slug);
}
function memberRoot(slug: string, memberId: string) {
  return path.join(teamMembersRoot(slug), memberId);
}
function teamAssetsRoot(slug: string) {
  return path.join(ROOT, "teams", slug, "assets");
}
function teamAssetCategoryDir(slug: string, zone: string, category: string) {
  return path.join(teamAssetsRoot(slug), zone, category);
}
function teamAssetItemsDir(slug: string) {
  return path.join(teamAssetsRoot(slug), "items");
}
function teamAssetItemDir(slug: string, assetId: string) {
  return path.join(teamAssetItemsDir(slug), assetId);
}
function teamAssetItemMetaPath(slug: string, assetId: string) {
  return path.join(teamAssetItemDir(slug, assetId), "meta.json");
}
function teamAssetItemContentPath(slug: string, asset: Pick<TeamAssetRecord, "id" | "category">) {
  return path.join(
    teamAssetItemDir(slug, asset.id),
    `content${resolveAssetFileExtension(asset.category)}`,
  );
}
function teamAssetItemVersionsDir(slug: string, assetId: string) {
  return path.join(teamAssetItemDir(slug, assetId), "versions");
}
function teamAssetItemVersionContentPath(
  slug: string,
  asset: Pick<TeamAssetRecord, "id" | "category">,
  releaseId: string,
) {
  return path.join(
    teamAssetItemVersionsDir(slug, asset.id),
    releaseId,
    `content${resolveAssetFileExtension(asset.category)}`,
  );
}
function teamAssetReleasesDir(slug: string) {
  return path.join(teamAssetsRoot(slug), "published", "releases");
}

async function ensureTeamAssetLayout(slug: string) {
  const base = teamAssetsRoot(slug);
  for (const dir of ["drafts", "collab", "approvals", "published/releases", "current", "items"]) {
    await fs.mkdir(path.join(base, dir), { recursive: true });
  }
}

// ============ State Read/Write ============

function defaultTeamModelGateway(): TeamModelGateway {
  return {
    enabled: true,
    mode: "proxy",
    providerId: DEFAULT_TEAM_MODEL_PROVIDER_ID,
    nativeProviderId: DEFAULT_MANAGER_LOCAL_PROVIDER_ID,
    nativeApiKeyEnv: DEFAULT_UPSTREAM_API_KEY_ENV,
    upstreamBaseUrl: resolveManagerGatewayBaseUrl(),
    upstreamApiKeyEnv: DEFAULT_UPSTREAM_API_KEY_ENV,
    defaultModelId: DEFAULT_DEFAULT_MODEL_ID,
    allowedModelIds: DEFAULT_ALLOWED_MODEL_IDS,
    token: crypto.randomBytes(24).toString("hex"),
    panelToken: crypto.randomBytes(24).toString("hex"),
    assetServerToken: crypto.randomBytes(24).toString("hex"),
  };
}

function resolveTeamPanelToken(gateway: Pick<TeamModelGateway, "token" | "panelToken">): string {
  return normalizeOptionalString(gateway.panelToken) || gateway.token;
}

function resolveTeamAssetServerToken(
  gateway: Pick<TeamModelGateway, "token" | "assetServerToken">,
): string {
  return normalizeOptionalString(gateway.assetServerToken) || gateway.token;
}

function defaultAssetRolePolicies(): TeamAssetRolePolicy[] {
  return [
    {
      role: "owner",
      canPropose: true,
      publishWithoutApproval: true,
      canApprove: true,
      canPromote: true,
    },
    {
      role: "manager",
      canPropose: true,
      publishWithoutApproval: true,
      canApprove: true,
      canPromote: true,
    },
    {
      role: "operator",
      canPropose: true,
      publishWithoutApproval: true,
      canApprove: true,
      canPromote: true,
    },
    {
      role: "publisher",
      canPropose: true,
      publishWithoutApproval: true,
      canApprove: false,
      canPromote: false,
    },
    {
      role: "contributor",
      canPropose: true,
      publishWithoutApproval: false,
      canApprove: false,
      canPromote: false,
    },
    {
      role: "member",
      canPropose: true,
      publishWithoutApproval: false,
      canApprove: false,
      canPromote: false,
    },
    {
      role: "viewer",
      canPropose: false,
      publishWithoutApproval: false,
      canApprove: false,
      canPromote: false,
    },
    {
      role: "system-evolution",
      canPropose: true,
      publishWithoutApproval: true,
      canApprove: false,
      canPromote: false,
    },
  ];
}

function defaultEvolutionConfig(): EvolutionConfig {
  return {
    enabled: false,
    intervalMs: 24 * 60 * 60 * 1000,
    minSessionsToTrigger: 5,
    maxDigestSummaries: 50,
    autoPublish: true,
  };
}

let teamStateMutationQueue: Promise<unknown> = Promise.resolve();

async function readTeamsState(): Promise<TeamsState> {
  try {
    const raw = await readText(TEAM_STATE_PATH);
    const parsed = JSON.parse(raw) as TeamsState;
    if (parsed && parsed.version === 2 && Array.isArray(parsed.teams)) {
      await ensureTeamServiceTokens(parsed);
      await ensureMemberRuntimeAccessTokens(parsed);
      return parsed;
    }
  } catch {}
  return { version: 2, teams: [] };
}

export async function primeTeamsStateForRuntime(): Promise<void> {
  await readTeamsState();
}

async function writeTeamsState(state: TeamsState) {
  await writeText(TEAM_STATE_PATH, JSON.stringify(state, null, 2) + "\n");
}

async function mutateTeamsState<T>(mutator: (state: TeamsState) => Promise<T>): Promise<T> {
  const task = teamStateMutationQueue.then(async () => {
    const state = await readTeamsState();
    const result = await mutator(state);
    await writeTeamsState(state);
    return result;
  });
  teamStateMutationQueue = task.catch(() => {});
  return task;
}

async function mutateNamedTeamState<T>(
  teamSlug: string,
  mutator: (team: TeamState) => Promise<T>,
): Promise<T> {
  return mutateTeamsState(async (root) => {
    const team = root.teams.find((t) => t.profile.slug === teamSlug);
    if (!team) {
      throw new HttpError(404, `team not found: ${teamSlug}`);
    }
    return mutator(team);
  });
}

function findTeamBySlugOrThrow(root: TeamsState, slug: string): TeamState {
  const t = root.teams.find((team) => team.profile.slug === slug);
  if (!t) {
    throw new HttpError(404, `team not found: ${slug}`);
  }
  return t;
}

function generateMemberRuntimeAccessToken(): string {
  return crypto.randomBytes(24).toString("hex");
}

function findInvitationForPolicy(
  team: TeamState,
  policy: Pick<TeamMemberPolicy, "invitationId">,
): TeamInvitation | undefined {
  return team.invitations.find((invitation) => invitation.id === policy.invitationId);
}

async function ensureMemberRuntimeAccessTokens(state: TeamsState): Promise<void> {
  const changed: Array<{ team: TeamState; policy: TeamMemberPolicy }> = [];
  for (const team of state.teams) {
    for (const policy of team.memberPolicies) {
      if (normalizeOptionalString(policy.runtimeAccessToken)) {
        continue;
      }
      policy.runtimeAccessToken = generateMemberRuntimeAccessToken();
      changed.push({ team, policy });
    }
  }
  if (changed.length === 0) {
    return;
  }
  await writeTeamsState(state);
  for (const entry of changed) {
    await syncMemberRuntimeConfigFromPolicy(entry.team, entry.policy.memberId, entry.policy);
  }
}

async function ensureTeamServiceTokens(state: TeamsState): Promise<void> {
  const changedTeams: TeamState[] = [];
  for (const team of state.teams) {
    let changed = false;
    if (!normalizeOptionalString(team.modelGateway.token)) {
      team.modelGateway.token = crypto.randomBytes(24).toString("hex");
      changed = true;
    }
    if (!normalizeOptionalString(team.modelGateway.panelToken)) {
      team.modelGateway.panelToken = crypto.randomBytes(24).toString("hex");
      changed = true;
    }
    if (!normalizeOptionalString(team.modelGateway.assetServerToken)) {
      team.modelGateway.assetServerToken = crypto.randomBytes(24).toString("hex");
      changed = true;
    }
    if (changed) {
      changedTeams.push(team);
    }
  }
  if (changedTeams.length === 0) {
    return;
  }
  await writeTeamsState(state);
  for (const team of changedTeams) {
    for (const policy of team.memberPolicies) {
      await syncMemberRuntimeConfigFromPolicy(team, policy.memberId, policy);
    }
  }
}

// ============ Audit Log ============

async function appendAuditEntry(entry: AuditEntry): Promise<void> {
  try {
    await fs.mkdir(AUDIT_DIR, { recursive: true });
    await fs.appendFile(
      path.join(AUDIT_DIR, `${entry.teamSlug}.jsonl`),
      JSON.stringify(entry) + "\n",
      "utf8",
    );
  } catch {}
}

export async function readAuditLog(
  teamSlugRaw: string,
  options?: { offset?: number; limit?: number; event?: AuditEventType },
): Promise<AuditLogPage> {
  const teamSlug = slugifyTeamLabel(teamSlugRaw);
  const logPath = path.join(AUDIT_DIR, `${teamSlug}.jsonl`);
  const offset = options?.offset ?? 0;
  const limit = options?.limit ?? 50;

  let raw: string;
  try {
    raw = await fs.readFile(logPath, "utf8");
  } catch {
    return { entries: [], offset, limit, total: 0 };
  }

  const lines = raw.trim().split("\n").filter(Boolean);
  let entries: AuditEntry[] = [];
  for (const line of lines) {
    try {
      entries.push(JSON.parse(line) as AuditEntry);
    } catch {}
  }
  entries.reverse();
  if (options?.event) {
    entries = entries.filter((e) => e.event === options.event);
  }
  return { entries: entries.slice(offset, offset + limit), offset, limit, total: entries.length };
}

// ============ Quota + Permissions ============

function normalizeQuota(
  role: string,
  partial?: Partial<MemberQuota>,
  existing?: MemberQuota,
): MemberQuota {
  const defaults: MemberQuota = existing ?? {
    dailyMessages: role === "manager" || role === "owner" ? 500 : 150,
    monthlyMessages: role === "manager" || role === "owner" ? 12000 : 3000,
    maxSubagents: role === "manager" || role === "owner" ? 3 : 1,
    maxThinking: "medium",
    allowedModels: DEFAULT_ALLOWED_MODEL_IDS.map((m) => `${DEFAULT_TEAM_MODEL_PROVIDER_ID}/${m}`),
    status: "active",
  };
  return {
    dailyMessages: partial?.dailyMessages ?? defaults.dailyMessages,
    monthlyMessages: partial?.monthlyMessages ?? defaults.monthlyMessages,
    maxSubagents: partial?.maxSubagents ?? defaults.maxSubagents,
    maxThinking: partial?.maxThinking ?? defaults.maxThinking,
    allowedModels: partial?.allowedModels ?? defaults.allowedModels,
    status: partial?.status ?? defaults.status,
  };
}

function permissionsForRole(role: string, policies: TeamAssetRolePolicy[]): TeamAssetPermissions {
  const match = policies.find((p) => p.role === role);
  return {
    canPropose: match?.canPropose ?? true,
    canPublishWithoutApproval: match?.publishWithoutApproval ?? false,
    canApprove: match?.canApprove ?? false,
    canPromote: match?.canPromote ?? false,
  };
}

function canRoleManageMembers(role: string): boolean {
  return role === "owner" || role === "manager" || role === "operator";
}

function resolveMemberPermissions(
  team: TeamState,
  memberId: string | undefined,
): { role: string; permissions: TeamAssetPermissions } {
  if (!memberId) {
    return { role: "manager", permissions: permissionsForRole("manager", team.assetRolePolicies) };
  }
  const policy = team.memberPolicies.find((p) => p.memberId === memberId);
  if (policy) {
    return { role: policy.role, permissions: policy.assetPermissions };
  }
  // Fallback: check if memberId is a known role name (for system actors)
  const knownRoles = new Set([
    "owner",
    "manager",
    "operator",
    "publisher",
    "contributor",
    "member",
    "viewer",
    "system-evolution",
  ]);
  const normalized = memberId.toLowerCase();
  if (knownRoles.has(normalized)) {
    return {
      role: normalized,
      permissions: permissionsForRole(normalized, team.assetRolePolicies),
    };
  }
  return { role: "member", permissions: permissionsForRole("member", team.assetRolePolicies) };
}

// ============ Team CRUD ============

export async function getTeamsCatalog() {
  const root = await readTeamsState();
  return Promise.all(
    root.teams.map(async (team) => {
      const members = await getMembersForTeam(team.profile.slug).catch(() => []);
      return {
        profile: team.profile,
        modelGateway: team.modelGateway,
        summary: {
          memberCount: members.length,
          activeMemberCount: members.length,
          pendingInvitationCount: team.invitations.filter((i) => i.status === "pending").length,
        },
      };
    }),
  );
}

export async function createTeam(input: CreateTeamInput): Promise<TeamProfile> {
  const name = input.name.trim();
  if (!name) {
    throw new HttpError(400, "team name required");
  }
  const slug = slugifyTeamLabel(input.slug?.trim() || name);
  if (!slug) {
    throw new HttpError(400, "invalid slug");
  }

  return mutateTeamsState(async (root) => {
    if (root.teams.some((t) => t.profile.slug === slug)) {
      throw new HttpError(409, `team exists: ${slug}`);
    }
    const ts = nowIso();
    const team: TeamState = {
      version: 1,
      profile: {
        name,
        slug,
        description: input.description?.trim() || `Team ${name}`,
        managerLabel: input.managerLabel?.trim() || "Manager",
        inviteBasePath: "/invite",
        createdAt: ts,
        updatedAt: ts,
      },
      modelGateway: defaultTeamModelGateway(),
      invitations: [],
      memberPolicies: [],
      assetRolePolicies: defaultAssetRolePolicies(),
      assets: [],
      evolution: defaultEvolutionConfig(),
    };
    root.teams.push(team);
    await fs.mkdir(teamMembersRoot(slug), { recursive: true });
    await ensureTeamAssetLayout(slug);
    void appendAuditEntry({
      ts,
      event: "team.created",
      actor: "operator",
      teamSlug: slug,
      resourceType: "team",
      resourceId: slug,
      detail: `Team created: ${name}`,
    });
    return team.profile;
  });
}

export async function getTeamOverviewBySlug(slug: string) {
  const root = await readTeamsState();
  const team = findTeamBySlugOrThrow(root, slug);
  const members = await getMembersForTeam(slug);
  return {
    profile: team.profile,
    modelGateway: team.modelGateway,
    members,
    invitations: team.invitations,
    assets: {
      records: team.assets,
      summary: {
        draftCount: team.assets.filter((a) => a.status === "draft").length,
        pendingApprovalCount: team.assets.filter((a) => a.status === "pending_approval").length,
        publishedCount: team.assets.filter((a) => a.status === "published").length,
      },
    },
    summary: {
      memberCount: members.length,
      activeMemberCount: members.length,
      pendingInvitationCount: team.invitations.filter((i) => i.status === "pending").length,
      assetDraftCount: team.assets.filter((a) => a.status === "draft").length,
      assetPendingApprovalCount: team.assets.filter((a) => a.status === "pending_approval").length,
      assetPublishedCount: team.assets.filter((a) => a.status === "published").length,
    },
  };
}

// ============ Invitations ============

export async function createInvitationForTeam(
  teamSlugRaw: string,
  input: CreateInvitationInput,
): Promise<TeamInvitation> {
  const teamSlug = slugifyTeamLabel(teamSlugRaw);
  const inviteeLabel = input.inviteeLabel.trim();
  if (!inviteeLabel) {
    throw new HttpError(400, "inviteeLabel required");
  }

  const rawMemberId = input.memberId?.trim() || "";
  const rawMemberEmail = input.memberEmail?.trim() || "";
  const memberEmail = rawMemberEmail
    ? validateMemberEmail(rawMemberEmail)
    : rawMemberId.includes("@")
      ? validateMemberEmail(rawMemberId)
      : undefined;
  const memberId = memberEmail
    ? deriveRuntimeMemberIdFromEmail(memberEmail)
    : validateMemberId(rawMemberId);
  const role = input.role?.trim() || "member";
  const createdBy = input.createdBy?.trim() || "operator";
  const quota = normalizeQuota(role, input.quota);

  return mutateNamedTeamState(teamSlug, async (state) => {
    const conflict = state.invitations.find(
      (i) => i.memberId === memberId && i.status === "pending",
    );
    if (conflict) {
      throw new HttpError(409, `pending invitation exists: ${memberId}`);
    }

    const inv: TeamInvitation = {
      id: crypto.randomUUID(),
      code: crypto.randomBytes(8).toString("hex"),
      teamSlug,
      status: "pending",
      inviteeLabel,
      memberId,
      memberEmail,
      role,
      note: input.note?.trim() || "",
      quota,
      createdAt: nowIso(),
      createdBy,
    };
    state.invitations.unshift(inv);
    void appendAuditEntry({
      ts: inv.createdAt,
      event: "invitation.created",
      actor: createdBy,
      teamSlug,
      resourceType: "invitation",
      resourceId: inv.id,
      detail: `Invitation created for ${inviteeLabel}`,
    });
    return inv;
  });
}

export async function getInvitationByCode(code: string): Promise<TeamInvitation | null> {
  const state = await readTeamsState();
  for (const team of state.teams) {
    const inv = team.invitations.find((i) => i.code === code);
    if (inv) {
      return inv;
    }
  }
  return null;
}

export async function revokeInvitationForTeam(
  teamSlugRaw: string,
  invitationId: string,
): Promise<TeamInvitation> {
  const teamSlug = slugifyTeamLabel(teamSlugRaw);
  return mutateNamedTeamState(teamSlug, async (state) => {
    const inv = state.invitations.find((i) => i.id === invitationId);
    if (!inv) {
      throw new HttpError(404, `invitation not found: ${invitationId}`);
    }
    if (inv.status !== "pending") {
      throw new HttpError(409, `not pending: ${invitationId}`);
    }
    inv.status = "revoked";
    inv.revokedAt = nowIso();
    void appendAuditEntry({
      ts: inv.revokedAt,
      event: "invitation.revoked",
      actor: "operator",
      teamSlug,
      resourceType: "invitation",
      resourceId: invitationId,
      detail: `Invitation revoked`,
    });
    return inv;
  });
}

export async function acceptInvitationByCode(
  code: string,
  input: AcceptInvitationInput,
): Promise<AcceptInvitationResult> {
  return mutateTeamsState(async (root) => {
    const state = root.teams.find((t) => t.invitations.some((i) => i.code === code));
    if (!state) {
      throw new HttpError(404, `invitation not found: ${code}`);
    }
    const inv = state.invitations.find((i) => i.code === code)!;
    if (inv.status !== "pending") {
      throw new HttpError(409, `not pending`);
    }

    const provision = await provisionMemberForTeam(state.profile.slug, {
      memberId: inv.memberId,
      identityName: input.identityName?.trim() || inv.inviteeLabel,
    });

    await materializeMemberTelegramBotToken({
      teamSlug: state.profile.slug,
      memberId: inv.memberId,
      telegramBotToken: input.telegramBotToken,
      telegramBotTokenFile: input.telegramBotTokenFile,
    });

    const ts = nowIso();
    const policy: TeamMemberPolicy = {
      memberId: inv.memberId,
      memberEmail: inv.memberEmail,
      role: inv.role,
      quota: inv.quota,
      assetPermissions: permissionsForRole(inv.role, state.assetRolePolicies),
      runtimeAccessToken: generateMemberRuntimeAccessToken(),
      telegramUserId: normalizeOptionalString(input.telegramUserId) || undefined,
      createdAt: ts,
      updatedAt: ts,
      invitationId: inv.id,
    };
    state.memberPolicies = state.memberPolicies.filter((p) => p.memberId !== inv.memberId);
    state.memberPolicies.unshift(policy);
    inv.status = "accepted";
    inv.acceptedAt = ts;
    inv.acceptedMemberId = provision.member.id;
    await syncMemberRuntimeConfigFromPolicy(state, inv.memberId, policy);
    await writeMemberTeamPolicy({
      team: state,
      memberId: inv.memberId,
      policy,
      invitationCode: inv.code,
    });

    if (shouldAutoStartAcceptedMemberRuntime()) {
      const runtimeStart = await runMemberRuntimeActionForTeam(
        state.profile.slug,
        inv.memberId,
        "start",
      );
      if (!runtimeStart.ok) {
        provision.pending.push(`runtime start failed: ${runtimeStart.stderr || "unknown error"}`);
      } else {
        try {
          await waitForAcceptedMemberRuntimeHealth(provision.port);
        } catch (error) {
          provision.pending.push(
            `runtime health check failed: ${error instanceof Error ? error.message : String(error)}`,
          );
        }
      }
    }

    void appendAuditEntry({
      ts,
      event: "invitation.accepted",
      actor: inv.memberId,
      teamSlug: state.profile.slug,
      resourceType: "invitation",
      resourceId: inv.id,
      detail: `Invitation accepted`,
    });
    return { invitation: inv, provision, policy };
  });
}

// ============ Member Provisioning ============

export async function getMembersForTeam(teamSlugRaw: string): Promise<MemberRecord[]> {
  const teamSlug = slugifyTeamLabel(teamSlugRaw);
  const membersDir = teamMembersRoot(teamSlug);
  if (!(await safeStat(membersDir))) {
    return [];
  }

  const entries = await fs.readdir(membersDir, { withFileTypes: true });
  const memberDirs = entries.filter(
    (e) =>
      e.isDirectory() &&
      !e.name.startsWith(".") &&
      e.name !== MEMBER_TEMPLATE_ID &&
      !e.name.startsWith(PRIVATE_MEMBER_DIR_PREFIX),
  );

  return Promise.all(
    memberDirs.map(async (entry) => {
      const memberPath = path.join(membersDir, entry.name);
      const runtimePath = path.join(memberPath, "runtime");
      return {
        id: entry.name,
        path: path.relative(ROOT, memberPath),
        hasRuntime: Boolean(await safeStat(runtimePath)),
        hasComposeFile: Boolean(await safeStat(path.join(runtimePath, "docker-compose.yml"))),
        hasConfigFile: Boolean(await safeStat(path.join(runtimePath, "config", "velaclaw.json"))),
        buckets: [],
      };
    }),
  );
}

export async function getMemberByIdForTeam(
  teamSlugRaw: string,
  memberId: string,
): Promise<MemberRecord | null> {
  const members = await getMembersForTeam(teamSlugRaw);
  return members.find((m) => m.id === memberId) ?? null;
}

async function teardownMemberRuntimeForTeam(
  teamSlugRaw: string,
  memberIdRaw: string,
): Promise<{ ok: boolean; stdout: string; stderr: string }> {
  const teamSlug = slugifyTeamLabel(teamSlugRaw);
  const memberId = validateMemberId(memberIdRaw);
  const runtimeDir = path.join(memberRoot(teamSlug, memberId), "runtime");
  const composePath = path.join(runtimeDir, "docker-compose.yml");
  if (!(await fileExists(composePath))) {
    return { ok: true, stdout: "", stderr: "" };
  }

  const composeArgs = ["compose", "-f", composePath, "down", "--remove-orphans"];
  const failures: string[] = [];

  try {
    const { stdout, stderr } = await execFileAsync("docker", composeArgs, { cwd: runtimeDir });
    return { ok: true, stdout: stdout.trim(), stderr: stderr.trim() };
  } catch (error) {
    failures.push(formatRuntimeActionError("docker compose down", error));
  }

  try {
    const { stdout, stderr } = await execFileAsync("sudo", ["-n", "docker", ...composeArgs], {
      cwd: runtimeDir,
    });
    return { ok: true, stdout: stdout.trim(), stderr: stderr.trim() };
  } catch (error) {
    failures.push(formatRuntimeActionError("sudo -n docker compose down", error));
  }

  return {
    ok: false,
    stdout: "",
    stderr: `${failures.join(" | ")} | member removal requires either direct docker access or passwordless sudo for docker compose`,
  };
}

export async function removeMemberForTeam(
  teamSlugRaw: string,
  memberIdRaw: string,
  actorMemberId?: string,
): Promise<RemoveMemberResult> {
  const teamSlug = slugifyTeamLabel(teamSlugRaw);
  const memberId = validateMemberId(memberIdRaw);
  const actorId = normalizeOptionalString(actorMemberId);

  return mutateNamedTeamState(teamSlug, async (team) => {
    if (actorId) {
      if (actorId === memberId) {
        throw new HttpError(403, "members cannot remove themselves");
      }
      const actorPolicy = team.memberPolicies.find((policy) => policy.memberId === actorId);
      if (!actorPolicy || !canRoleManageMembers(actorPolicy.role)) {
        throw new HttpError(403, `member cannot remove other members: ${actorId}`);
      }
    }

    const existingMember = await getMemberByIdForTeam(teamSlug, memberId);
    const hadPolicy = team.memberPolicies.some((policy) => policy.memberId === memberId);
    if (!existingMember && !hadPolicy) {
      throw new HttpError(404, `member not found: ${memberId}`);
    }

    const runtimeTeardown = await teardownMemberRuntimeForTeam(teamSlug, memberId);
    if (!runtimeTeardown.ok) {
      throw new HttpError(
        500,
        runtimeTeardown.stderr || `failed to stop member runtime: ${memberId}`,
      );
    }

    const memberPath = memberRoot(teamSlug, memberId);
    await fs.rm(memberPath, { recursive: true, force: true });
    team.memberPolicies = team.memberPolicies.filter((policy) => policy.memberId !== memberId);
    heartbeatStore.delete(`${teamSlug}:${memberId}`);

    const removedAt = nowIso();
    void appendAuditEntry({
      ts: removedAt,
      event: "member.removed",
      actor: actorId || "operator",
      teamSlug,
      resourceType: "member",
      resourceId: memberId,
      detail: `Member removed: ${memberId}`,
    });

    return {
      removed: true,
      teamSlug,
      memberId,
      removedPath: path.relative(ROOT, memberPath),
      hadMemberRecord: Boolean(existingMember),
      hadPolicy,
      runtimeTeardown,
    };
  });
}

async function resolveMemberPort(preferred?: number): Promise<number> {
  if (preferred) {
    return preferred;
  }
  const state = await readTeamsState();
  const usedPorts = new Set<number>();
  for (const team of state.teams) {
    const members = await getMembersForTeam(team.profile.slug);
    for (const m of members) {
      const composePath = path.join(ROOT, m.path, "runtime", "docker-compose.yml");
      if (await fileExists(composePath)) {
        const compose = await readText(composePath);
        const match = compose.match(/127\.0\.0\.1:(\d+):18789/);
        if (match) {
          usedPorts.add(Number(match[1]));
        }
      }
    }
  }
  let port = DEFAULT_MEMBER_PORT;
  while (usedPorts.has(port)) {
    port++;
  }
  return port;
}

function resolveTeamControlBaseUrl(env: NodeJS.ProcessEnv = process.env): string {
  const explicit = env.VELACLAW_TEAM_CONTROL_BASE_URL?.trim();
  if (explicit) {
    return explicit.replace(/\/+$/, "");
  }
  const persisted = readVelaclawControlPlaneStateSync(ROOT);
  if (persisted?.memberBaseUrl) {
    return persisted.memberBaseUrl;
  }
  return `http://${resolveTeamControlHost(env)}:${resolveTeamControlPort(env)}`;
}

type MemberIdentityShape = {
  name?: string;
  emoji?: string;
  theme?: string;
};

function mergeUniqueStringEntries(existing: unknown, extra: string): string[] {
  const values = Array.isArray(existing)
    ? existing
        .filter((value): value is string => typeof value === "string")
        .map((value) => value.trim())
        .filter(Boolean)
    : [];
  return Array.from(new Set([...values, extra]));
}

function applyMemberTelegramDirectAccess(
  config: {
    channels?: Record<string, unknown>;
  },
  params: {
    telegramUserId?: string;
    tokenFile?: string;
  },
): void {
  const normalizedTelegramUserId = normalizeOptionalString(params.telegramUserId);
  const normalizedTokenFile = normalizeOptionalString(params.tokenFile);
  if (!normalizedTelegramUserId && !normalizedTokenFile) {
    return;
  }

  config.channels ??= {};
  const existingTelegram =
    typeof config.channels.telegram === "object" && config.channels.telegram
      ? (config.channels.telegram as Record<string, unknown>)
      : {};

  config.channels.telegram = {
    ...existingTelegram,
    enabled: existingTelegram.enabled !== false,
    ...(normalizedTokenFile ? { tokenFile: normalizedTokenFile } : {}),
    dmPolicy: normalizedTelegramUserId
      ? "allowlist"
      : normalizeOptionalString(
          typeof existingTelegram.dmPolicy === "string" ? existingTelegram.dmPolicy : undefined,
        ) || "pairing",
    ...(normalizedTelegramUserId
      ? {
          allowFrom: mergeUniqueStringEntries(existingTelegram.allowFrom, normalizedTelegramUserId),
        }
      : {}),
    groupPolicy:
      normalizeOptionalString(
        typeof existingTelegram.groupPolicy === "string" ? existingTelegram.groupPolicy : undefined,
      ) || "disabled",
  };
}

function resolveMemberTelegramBotTokenHostPath(teamSlug: string, memberId: string): string {
  return path.join(
    memberRoot(teamSlug, memberId),
    "runtime",
    "secrets",
    MEMBER_TELEGRAM_BOT_TOKEN_FILENAME,
  );
}

function resolveMemberTelegramBotTokenContainerPath(
  runtimePaths: ReturnType<typeof resolveMemberRuntimePaths>,
): string {
  return `${runtimePaths.stateDir}/secrets/${MEMBER_TELEGRAM_BOT_TOKEN_FILENAME}`;
}

async function materializeMemberTelegramBotToken(params: {
  teamSlug: string;
  memberId: string;
  telegramBotToken?: string;
  telegramBotTokenFile?: string;
}): Promise<boolean> {
  const inlineToken = normalizeOptionalString(params.telegramBotToken);
  const filePath = normalizeOptionalString(params.telegramBotTokenFile);
  let token = inlineToken;
  if (!token && filePath) {
    token = normalizeOptionalString(await readText(path.resolve(filePath)));
  }
  if (!token) {
    return false;
  }
  const hostTokenPath = resolveMemberTelegramBotTokenHostPath(params.teamSlug, params.memberId);
  await fs.mkdir(path.dirname(hostTokenPath), { recursive: true });
  await fs.writeFile(hostTokenPath, `${token}\n`, { mode: 0o600 });
  return true;
}

function resolveMemberRuntimeIdentity(params: {
  memberId: string;
  identityName?: string;
}): Required<MemberIdentityShape> {
  return {
    name: params.identityName?.trim() || `小虾-${params.memberId}`,
    emoji: "🦐",
    theme: "member runtime",
  };
}

function buildMemberRuntimeConfig(params: {
  teamSlug: string;
  memberId: string;
  identityName?: string;
  gatewayToken: string;
  modelGateway: TeamModelGateway;
}) {
  const runtimePaths = resolveMemberRuntimePaths();
  const controlBaseUrl = resolveTeamControlBaseUrl();
  const modelProviderId = params.modelGateway.providerId || DEFAULT_TEAM_MODEL_PROVIDER_ID;
  const defaultModelRef = `${modelProviderId}/${params.modelGateway.defaultModelId}`;
  const identity = resolveMemberRuntimeIdentity({
    memberId: params.memberId,
    identityName: params.identityName,
  });
  const providerModels = params.modelGateway.allowedModelIds.map((id) => ({
    id,
    name: id,
    reasoning: true,
    input: ["text", "image"],
  }));
  const modelAliases = Object.fromEntries(
    params.modelGateway.allowedModelIds.map((id) => [`${modelProviderId}/${id}`, { alias: id }]),
  );

  return {
    agents: {
      defaults: {
        workspace: runtimePaths.workspaceDir,
        model: {
          primary: defaultModelRef,
        },
        timeoutSeconds: 600,
        llm: {
          idleTimeoutSeconds: 0,
        },
        compaction: {
          mode: "safeguard",
        },
        sandbox: {
          mode: "off",
          scope: "agent",
        },
        models: modelAliases,
      },
      list: [
        {
          id: "main",
          default: true,
          workspace: runtimePaths.workspaceDir,
          model: defaultModelRef,
          thinkingDefault: "medium",
          identity,
        },
      ],
    },
    gateway: {
      mode: "local",
      auth: {
        mode: "token",
        token: params.gatewayToken,
      },
      port: 18789,
      bind: "lan",
      http: {
        endpoints: {
          responses: {
            enabled: true,
          },
        },
      },
    },
    tools: {
      profile: "minimal",
      alsoAllow: ["read"],
      deny: ["cron", "sessions_spawn", "subagents", "lobster"],
      fs: {
        workspaceOnly: true,
      },
      exec: {
        host: "gateway",
        security: "allowlist",
        ask: "always",
      },
      elevated: {
        enabled: false,
      },
    },
    messages: {
      queue: {
        mode: "collect",
        debounceMs: 1000,
        cap: 20,
        drop: "summarize",
      },
      inbound: {
        debounceMs: 0,
      },
    },
    session: {
      dmScope: "per-channel-peer",
    },
    plugins: {
      entries: {
        "member-quota-guard": {
          enabled: true,
          config: {
            policyPath: runtimePaths.policyPath,
            usagePath: runtimePaths.usagePath,
          },
        },
        "shared-asset-injector": {
          enabled: true,
          hooks: {
            allowPromptInjection: true,
          },
          config: {
            assetServerBaseUrl: `${controlBaseUrl}/api/teams/${params.teamSlug}/asset-server`,
            assetServerToken: resolveTeamAssetServerToken(params.modelGateway),
            workspaceRoot: runtimePaths.workspaceDir,
            statePath: runtimePaths.sharedAssetsStatePath,
            syncTtlMs: 30000,
            resolveLimitPerKind: 2,
          },
        },
        "team-panel": {
          enabled: true,
          config: {
            controlBaseUrl,
            teamSlug: params.teamSlug,
            accessToken: resolveTeamPanelToken(params.modelGateway),
            allowTeamListing: false,
            allowEvolutionTrigger: true,
            allowMemberRemoval: canRoleManageMembers("member"),
            memberId: params.memberId,
          },
        },
        "member-runtime-upgrader": {
          enabled: true,
          config: {
            apiBaseUrl: controlBaseUrl,
            teamSlug: params.teamSlug,
            memberId: params.memberId,
          },
        },
      },
      load: {
        paths: [
          `${runtimePaths.localPluginsDir}/member-quota-guard`,
          `${runtimePaths.localPluginsDir}/shared-asset-injector`,
          `${runtimePaths.localPluginsDir}/member-runtime-upgrader`,
        ],
      },
    },
    models: {
      providers: {
        [modelProviderId]: {
          baseUrl: `${controlBaseUrl}/api/teams/${params.teamSlug}/model-gateway/v1`,
          apiKey: params.modelGateway.token,
          api: "openai-responses",
          request: {
            allowPrivateNetwork: true,
          },
          models: providerModels,
        },
      },
    },
  };
}

function resolveMainAgentIdentity(config: {
  agents?: {
    list?: Array<{ id?: unknown; identity?: Record<string, unknown> }>;
  };
}): MemberIdentityShape {
  const main = config.agents?.list?.find((agent) => agent?.id === "main");
  const identity = main?.identity;
  return {
    name: typeof identity?.name === "string" ? identity.name.trim() : undefined,
    emoji: typeof identity?.emoji === "string" ? identity.emoji.trim() : undefined,
    theme: typeof identity?.theme === "string" ? identity.theme.trim() : undefined,
  };
}

async function writeMemberIdentityFile(params: {
  teamSlug: string;
  memberId: string;
  identity: MemberIdentityShape;
}) {
  if (!params.identity.name && !params.identity.emoji && !params.identity.theme) {
    return;
  }
  const identityPath = path.join(
    memberRoot(params.teamSlug, params.memberId),
    "runtime",
    "workspace",
    "IDENTITY.md",
  );
  let existing: string | undefined;
  try {
    existing = await readText(identityPath);
  } catch {
    existing = undefined;
  }
  const next = mergeIdentityMarkdownContent(existing, {
    ...(params.identity.name ? { name: params.identity.name } : {}),
    ...(params.identity.theme ? { theme: params.identity.theme } : {}),
    ...(params.identity.emoji ? { emoji: params.identity.emoji } : {}),
  });
  await writeText(identityPath, next);
}

function buildMemberComposeFile(params: {
  teamSlug: string;
  memberId: string;
  port: number;
  gatewayToken: string;
}) {
  const runtimePaths = resolveMemberRuntimePaths();
  const controlBaseUrl = resolveTeamControlBaseUrl();
  const controlHost = resolveUrlHostname(controlBaseUrl);
  const proxyEnv = resolveMemberRuntimeProxyEnv(process.env, controlBaseUrl);
  const needsHostGatewayAlias =
    controlHost === "host.docker.internal" ||
    Object.values(proxyEnv).some(
      (value) => typeof value === "string" && value.includes("host.docker.internal"),
    );
  const extraHosts = needsHostGatewayAlias
    ? '    extra_hosts:\n      - "host.docker.internal:host-gateway"\n'
    : "";
  return `name: velaclaw-${params.teamSlug}-${params.memberId}
services:
  velaclaw-member:
    image: velaclaw-member-runtime:local
    container_name: velaclaw-${params.teamSlug}-${params.memberId}
    restart: unless-stopped
    ports:
      - "127.0.0.1:${params.port}:18789"
    environment:
      VELACLAW_STATE_DIR: ${yamlQuoted(runtimePaths.stateDir)}
      VELACLAW_WORKSPACE_DIR: ${yamlQuoted(runtimePaths.workspaceDir)}
      VELACLAW_MEMBER_LOCAL_PLUGINS_DIR: ${yamlQuoted(runtimePaths.localPluginsDir)}
      VELACLAW_SHARED_ASSETS_STATE_PATH: ${yamlQuoted(runtimePaths.sharedAssetsStatePath)}
      VELACLAW_TEAM_CONTROL_BASE_URL: ${yamlQuoted(controlBaseUrl)}
      VELACLAW_TEAM_SHARED_ASSET_MOUNT_DIR: ${yamlQuoted(runtimePaths.sharedAssetMountDir)}
      VELACLAW_GATEWAY_TOKEN: ${params.gatewayToken}
      HTTP_PROXY: ${yamlQuoted(proxyEnv.HTTP_PROXY)}
      HTTPS_PROXY: ${yamlQuoted(proxyEnv.HTTPS_PROXY)}
      ALL_PROXY: ${yamlQuoted(proxyEnv.ALL_PROXY)}
      http_proxy: ${yamlQuoted(proxyEnv.http_proxy)}
      https_proxy: ${yamlQuoted(proxyEnv.https_proxy)}
      all_proxy: ${yamlQuoted(proxyEnv.all_proxy)}
      NO_PROXY: ${yamlQuoted(proxyEnv.NO_PROXY)}
      no_proxy: ${yamlQuoted(proxyEnv.no_proxy)}
${extraHosts}
    volumes:
      - ./config:${runtimePaths.stateDir}:rw
      - ./workspace:${runtimePaths.workspaceDir}:rw
      - ./secrets:${runtimePaths.stateDir}/secrets:rw
      - ../../private-memory:${runtimePaths.workspaceDir}/private-memory:rw
      - ../../private-skills:${runtimePaths.workspaceDir}/private-skills:rw
      - ../../private-tools:${runtimePaths.workspaceDir}/private-tools:rw
      - ../../private-docs:${runtimePaths.workspaceDir}/private-docs:rw
      - ../../../../teams/${params.teamSlug}/assets/current:${runtimePaths.sharedAssetMountDir}:ro
      - ../../../../teams/${params.teamSlug}/assets/current:${runtimePaths.workspaceDir}/team-shared:ro
    user: "1000:1000"
    security_opt:
      - no-new-privileges:true
    cap_drop:
      - ALL
    read_only: true
    tmpfs:
      - /tmp:size=256m,mode=1777
    pids_limit: 256
    mem_limit: 2g
    cpus: 1.5
    healthcheck:
      test: ["CMD", "curl", "-fsS", "http://127.0.0.1:18789/healthz"]
      interval: 30s
      timeout: 5s
      retries: 5
      start_period: 30s
    networks:
      - member_isolated

networks:
  member_isolated:
    driver: bridge
`;
}

async function syncManagedMemberLocalPlugin(teamSlug: string, memberId: string, pluginId: string) {
  const templatePluginPath = path.join(
    MEMBERS_ROOT,
    MEMBER_TEMPLATE_ID,
    "runtime",
    "config",
    "local-plugins",
    pluginId,
  );
  const targetPluginPath = path.join(
    memberRoot(teamSlug, memberId),
    "runtime",
    "config",
    "local-plugins",
    pluginId,
  );
  if (!(await safeStat(templatePluginPath))) {
    return;
  }
  await fs.mkdir(path.dirname(targetPluginPath), { recursive: true });
  await fs.rm(targetPluginPath, { recursive: true, force: true });
  await fs.cp(templatePluginPath, targetPluginPath, { recursive: true, force: true });
}

async function syncManagedMemberLocalPlugins(teamSlug: string, memberId: string) {
  await syncManagedMemberLocalPlugin(teamSlug, memberId, "member-quota-guard");
  await syncManagedMemberLocalPlugin(teamSlug, memberId, "shared-asset-injector");
  await syncManagedMemberLocalPlugin(teamSlug, memberId, "member-runtime-upgrader");
}

async function writeMemberTeamPolicy(params: {
  team: TeamState;
  memberId: string;
  policy: TeamMemberPolicy;
  invitationCode?: string | null;
}) {
  const policyPath = path.join(
    memberRoot(params.team.profile.slug, params.memberId),
    "runtime",
    "config",
    "team-policy.json",
  );
  await writeText(
    policyPath,
    `${JSON.stringify(
      {
        team: {
          slug: params.team.profile.slug,
          name: params.team.profile.name,
          managerLabel: params.team.profile.managerLabel,
          invitationCode:
            params.invitationCode ??
            findInvitationForPolicy(params.team, params.policy)?.code ??
            null,
        },
        quota: params.policy.quota,
        runtimeAccessToken: params.policy.runtimeAccessToken ?? null,
        telegramUserId: params.policy.telegramUserId ?? null,
        policyUpdatedAt: params.policy.updatedAt,
      },
      null,
      2,
    )}\n`,
  );
}

async function ensureMemberUsageState(teamSlug: string, memberId: string) {
  const usagePath = path.join(
    memberRoot(teamSlug, memberId),
    "runtime",
    "config",
    "team-usage.json",
  );
  if (await fileExists(usagePath)) {
    return;
  }
  const now = new Date();
  const day = now.toISOString().slice(0, 10);
  const month = day.slice(0, 7);
  await writeText(
    usagePath,
    `${JSON.stringify(
      {
        day,
        month,
        dailyCount: 0,
        monthlyCount: 0,
        lastSeenAt: null,
      },
      null,
      2,
    )}\n`,
  );
}

async function syncMemberRuntimeConfigFromPolicy(
  team: TeamState,
  memberId: string,
  policy: TeamMemberPolicy,
) {
  const runtimePaths = resolveMemberRuntimePaths();
  const controlBaseUrl = resolveTeamControlBaseUrl();
  const invitationCode = findInvitationForPolicy(team, policy)?.code;
  const telegramBotTokenHostPath = resolveMemberTelegramBotTokenHostPath(
    team.profile.slug,
    memberId,
  );
  const telegramBotTokenConfigured = await fileExists(telegramBotTokenHostPath);
  await syncManagedMemberLocalPlugins(team.profile.slug, memberId);
  await ensureMemberUsageState(team.profile.slug, memberId);
  await writeMemberTeamPolicy({
    team,
    memberId,
    policy,
    invitationCode,
  });

  const configPath = path.join(
    memberRoot(team.profile.slug, memberId),
    "runtime",
    "config",
    "velaclaw.json",
  );
  if (!(await fileExists(configPath))) {
    return;
  }

  const raw = await readText(configPath);
  type MemberRuntimeConfig = {
    agents?: {
      defaults?: Record<string, unknown>;
      list?: Array<Record<string, unknown>>;
    } & Record<string, unknown>;
    channels?: Record<string, unknown>;
    plugins?: {
      entries?: Record<string, unknown>;
      load?: { paths?: unknown } & Record<string, unknown>;
    } & Record<string, unknown>;
    tools?: { alsoAllow?: unknown; fs?: unknown } & Record<string, unknown>;
    gateway?: {
      bind?: unknown;
      http?: { endpoints?: Record<string, unknown> } & Record<string, unknown>;
    } & Record<string, unknown>;
    models?: unknown;
  } & Record<string, unknown>;
  const parsed = JSON.parse(raw) as MemberRuntimeConfig;
  const modelProviderId = team.modelGateway.providerId || DEFAULT_TEAM_MODEL_PROVIDER_ID;
  const primaryModel = `${modelProviderId}/${team.modelGateway.defaultModelId}`;
  const allowedModels = team.modelGateway.allowedModelIds.map((id) => `${modelProviderId}/${id}`);

  parsed.agents ??= {};
  parsed.agents.defaults ??= {};
  parsed.agents.defaults.model = { primary: primaryModel };
  parsed.agents.defaults.workspace = runtimePaths.workspaceDir;
  parsed.agents.defaults.timeoutSeconds = 600;
  parsed.agents.defaults.llm = {
    ...(typeof parsed.agents.defaults.llm === "object" && parsed.agents.defaults.llm
      ? parsed.agents.defaults.llm
      : {}),
    idleTimeoutSeconds: 0,
  };
  parsed.agents.defaults.models = Object.fromEntries(
    allowedModels.map((modelRef) => [modelRef, { alias: modelRef.split("/")[1] ?? modelRef }]),
  );
  if (Array.isArray(parsed.agents.list)) {
    for (const agent of parsed.agents.list) {
      if (agent?.id === "main") {
        agent.workspace = runtimePaths.workspaceDir;
        agent.model = primaryModel;
        agent.thinkingDefault = policy.quota.maxThinking;
      }
    }
  }

  parsed.plugins ??= {};
  parsed.plugins.entries ??= {};
  parsed.plugins.entries["member-quota-guard"] = {
    enabled: true,
    config: {
      policyPath: runtimePaths.policyPath,
      usagePath: runtimePaths.usagePath,
    },
  };
  parsed.plugins.entries["shared-asset-injector"] = {
    enabled: true,
    hooks: {
      allowPromptInjection: true,
    },
    config: {
      assetServerBaseUrl: `${controlBaseUrl}/api/teams/${team.profile.slug}/asset-server`,
      assetServerToken: resolveTeamAssetServerToken(team.modelGateway),
      workspaceRoot: runtimePaths.workspaceDir,
      statePath: runtimePaths.sharedAssetsStatePath,
      syncTtlMs: 30000,
      resolveLimitPerKind: 2,
    },
  };
  parsed.plugins.entries["team-panel"] = {
    enabled: true,
    config: {
      controlBaseUrl,
      teamSlug: team.profile.slug,
      accessToken: resolveTeamPanelToken(team.modelGateway),
      allowTeamListing: false,
      allowEvolutionTrigger: true,
      allowMemberRemoval: canRoleManageMembers(policy.role),
      memberId,
      runtimeAccessToken: policy.runtimeAccessToken ?? null,
    },
  };
  parsed.plugins.entries["member-runtime-upgrader"] = {
    enabled: true,
    config: {
      apiBaseUrl: controlBaseUrl,
      teamSlug: team.profile.slug,
      memberId,
      policyPath: runtimePaths.policyPath,
      accessToken: policy.runtimeAccessToken ?? null,
    },
  };
  parsed.plugins.load ??= {};
  parsed.plugins.load.paths = Array.from(
    new Set([
      ...(Array.isArray(parsed.plugins.load.paths) ? parsed.plugins.load.paths : []),
      `${runtimePaths.localPluginsDir}/member-quota-guard`,
      `${runtimePaths.localPluginsDir}/shared-asset-injector`,
      `${runtimePaths.localPluginsDir}/member-runtime-upgrader`,
    ]),
  );

  parsed.tools ??= {};
  parsed.tools.alsoAllow = Array.from(
    new Set([...(Array.isArray(parsed.tools.alsoAllow) ? parsed.tools.alsoAllow : []), "read"]),
  );
  parsed.tools.fs = {
    ...(typeof parsed.tools.fs === "object" && parsed.tools.fs ? parsed.tools.fs : {}),
    workspaceOnly: true,
  };
  applyMemberTelegramDirectAccess(parsed, {
    telegramUserId: policy.telegramUserId,
    ...(telegramBotTokenConfigured
      ? { tokenFile: resolveMemberTelegramBotTokenContainerPath(runtimePaths) }
      : {}),
  });
  parsed.gateway ??= {};
  parsed.gateway.bind = "lan";
  parsed.gateway.http ??= {};
  parsed.gateway.http.endpoints ??= {};
  parsed.gateway.http.endpoints.responses = {
    ...(typeof parsed.gateway.http.endpoints.responses === "object" &&
    parsed.gateway.http.endpoints.responses
      ? parsed.gateway.http.endpoints.responses
      : {}),
    enabled: true,
  };
  parsed.models = {
    providers: {
      [modelProviderId]: {
        baseUrl: `${controlBaseUrl}/api/teams/${team.profile.slug}/model-gateway/v1`,
        apiKey: team.modelGateway.token,
        api: "openai-responses",
        request: {
          allowPrivateNetwork: true,
        },
        models: team.modelGateway.allowedModelIds.map((id) => ({
          id,
          name: id,
          reasoning: true,
          input: ["text", "image"],
        })),
      },
    },
  };

  await writeText(configPath, `${JSON.stringify(parsed, null, 2)}\n`);
  await writeMemberIdentityFile({
    teamSlug: team.profile.slug,
    memberId,
    identity: resolveMainAgentIdentity(parsed),
  });
}

export async function provisionMemberForTeam(
  teamSlugRaw: string,
  input: ProvisionMemberInput,
): Promise<ProvisionMemberResult> {
  await ensureVelaclawControlPlaneStateInitialized(ROOT, process.env);
  const teamSlug = slugifyTeamLabel(teamSlugRaw);
  const memberId = validateMemberId(input.memberId);
  const templatePath = path.join(MEMBERS_ROOT, MEMBER_TEMPLATE_ID);
  const memberPath = memberRoot(teamSlug, memberId);
  const root = await readTeamsState();
  const team = findTeamBySlugOrThrow(root, teamSlug);

  if (await safeStat(memberPath)) {
    throw new HttpError(409, `member exists: ${memberId}`);
  }
  if (!(await safeStat(templatePath))) {
    // Auto-create minimal template if missing
    await fs.mkdir(path.join(templatePath, "runtime", "config"), { recursive: true });
    await fs.mkdir(path.join(templatePath, "runtime", "secrets"), { recursive: true });
    await fs.mkdir(path.join(templatePath, "runtime", "workspace"), { recursive: true });
    await fs.mkdir(path.join(templatePath, "private-memory"), { recursive: true });
    await fs.mkdir(path.join(templatePath, "private-skills"), { recursive: true });
    await fs.mkdir(path.join(templatePath, "private-tools"), { recursive: true });
    await fs.mkdir(path.join(templatePath, "private-docs"), { recursive: true });
    await writeText(
      path.join(templatePath, "runtime", "config", "velaclaw.json"),
      JSON.stringify(
        { name: "velaclaw-member", version: "1", gateway: { bind: "loopback" } },
        null,
        2,
      ),
    );
  }

  const port = await resolveMemberPort(input.port);
  const gatewayToken = input.gatewayToken?.trim() || crypto.randomBytes(24).toString("hex");

  await fs.mkdir(teamMembersRoot(teamSlug), { recursive: true });
  await ensureTeamAssetLayout(teamSlug);
  await fs.cp(templatePath, memberPath, { recursive: true, errorOnExist: true });
  await syncManagedMemberLocalPlugins(teamSlug, memberId);

  const composePath = path.join(memberPath, "runtime", "docker-compose.yml");
  const configPath = path.join(memberPath, "runtime", "config", "velaclaw.json");
  const secretsPath = path.join(memberPath, "runtime", "secrets");
  const workspacePath = path.join(memberPath, "runtime", "workspace");

  await writeText(
    configPath,
    JSON.stringify(
      buildMemberRuntimeConfig({
        teamSlug,
        memberId,
        identityName: input.identityName,
        gatewayToken,
        modelGateway: team.modelGateway,
      }),
      null,
      2,
    ) + "\n",
  );
  await writeMemberIdentityFile({
    teamSlug,
    memberId,
    identity: resolveMemberRuntimeIdentity({
      memberId,
      identityName: input.identityName,
    }),
  });

  await writeText(
    composePath,
    buildMemberComposeFile({
      teamSlug,
      memberId,
      port,
      gatewayToken,
    }),
  );

  void appendAuditEntry({
    ts: nowIso(),
    event: "member.provisioned",
    actor: "operator",
    teamSlug,
    resourceType: "member",
    resourceId: memberId,
    detail: `Provisioned: ${memberId}, port=${port}`,
  });

  const member = await getMemberByIdForTeam(teamSlug, memberId);
  if (!member) {
    throw new HttpError(500, `provision failed: ${memberId}`);
  }

  return {
    created: true,
    member,
    port,
    gatewayToken,
    pending: [],
    paths: {
      memberPath: path.relative(ROOT, memberPath),
      composePath: path.relative(ROOT, composePath),
      configPath: path.relative(ROOT, configPath),
      secretsPath: path.relative(ROOT, secretsPath),
      workspacePath: path.relative(ROOT, workspacePath),
    },
  };
}

export async function updateMemberQuotaForTeam(
  teamSlugRaw: string,
  memberIdRaw: string,
  input: UpdateMemberQuotaInput,
): Promise<TeamMemberPolicy> {
  const teamSlug = slugifyTeamLabel(teamSlugRaw);
  const memberId = validateMemberId(memberIdRaw);

  return mutateNamedTeamState(teamSlug, async (state) => {
    const existing = state.memberPolicies.find((p) => p.memberId === memberId);
    if (!existing) {
      throw new HttpError(404, `no policy for member: ${memberId}`);
    }

    const role = input.role?.trim() || existing.role;
    const updated: TeamMemberPolicy = {
      ...existing,
      role,
      quota: normalizeQuota(role, input, existing.quota),
      assetPermissions: permissionsForRole(role, state.assetRolePolicies),
      runtimeAccessToken: existing.runtimeAccessToken ?? generateMemberRuntimeAccessToken(),
      updatedAt: nowIso(),
    };
    state.memberPolicies = state.memberPolicies.filter((p) => p.memberId !== memberId);
    state.memberPolicies.unshift(updated);
    await syncMemberRuntimeConfigFromPolicy(state, memberId, updated);
    void appendAuditEntry({
      ts: updated.updatedAt,
      event: "member.quota.updated",
      actor: "operator",
      teamSlug,
      resourceType: "member",
      resourceId: memberId,
      detail: `Quota updated: role=${role} daily=${updated.quota.dailyMessages} status=${updated.quota.status}`,
    });
    return updated;
  });
}

export async function validateMemberRuntimeAccessTokenForTeam(
  teamSlugRaw: string,
  memberIdRaw: string,
  token: string | undefined | null,
): Promise<boolean> {
  const teamSlug = slugifyTeamLabel(teamSlugRaw);
  const memberId = validateMemberId(memberIdRaw);
  const root = await readTeamsState();
  const team = findTeamBySlugOrThrow(root, teamSlug);
  const policy = team.memberPolicies.find((entry) => entry.memberId === memberId);
  if (!policy) {
    return false;
  }
  return safeEqualSecret(token, policy.runtimeAccessToken);
}

// ============ Asset Governance ============

function slugifyAssetName(title: string): string {
  const stripped = title
    .trim()
    .replace(/^\[(?:auto|自动)\]\s*/i, "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "");
  return stripped
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 50);
}

function resolveAssetFileExtension(cat: TeamAssetCategory) {
  return resolveTeamAssetTypeRuntime(cat).fileExtension;
}

function assetFilePrefix(cat: TeamAssetCategory): string {
  return resolveTeamAssetTypeRuntime(cat).filenamePrefix;
}

function normalizeStringList(values?: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const value of values ?? []) {
    if (typeof value !== "string") {
      continue;
    }
    const trimmed = value.trim();
    if (!trimmed) {
      continue;
    }
    const key = trimmed.toLowerCase();
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    out.push(trimmed);
  }
  return out;
}

function resolveDefaultCapabilityProfileForCategory(cat: TeamAssetCategory): {
  role: string;
  consumptionMode: string;
} {
  const spec = resolveTeamAssetTypeRuntime(cat);
  return {
    role: spec.defaultCapabilityRole,
    consumptionMode: spec.defaultConsumptionMode,
  };
}

function buildStableAssetStem(params: { category: TeamAssetCategory; title: string }): string {
  const prefix = assetFilePrefix(params.category);
  const slug = slugifyAssetName(params.title);
  const hash = crypto
    .createHash("sha256")
    .update(`${params.category}\u0000${params.title}`)
    .digest("hex")
    .slice(0, 8);
  const generic = new Set([
    "auto",
    "asset",
    "memory",
    "skill",
    "workflow",
    "doc",
    "tool",
    "shared",
  ]);
  if (!slug || generic.has(slug)) {
    return `${prefix}-${hash}`;
  }
  const normalized = slug.startsWith(`${prefix}-`) ? slug : `${prefix}-${slug}`;
  return normalized.length <= 58 ? normalized : `${normalized.slice(0, 49)}-${hash}`;
}

function resolveUniqueAssetFileName(params: {
  team: TeamState;
  category: TeamAssetCategory;
  title: string;
}): string {
  const extension = resolveAssetFileExtension(params.category);
  const stem = buildStableAssetStem({
    category: params.category,
    title: params.title,
  });
  const used = new Set(
    params.team.assets
      .filter((asset) => asset.category === params.category)
      .map((asset) => asset.filename.toLowerCase()),
  );
  const base = `${stem}${extension}`;
  if (!used.has(base.toLowerCase())) {
    return base;
  }
  const hash = crypto
    .createHash("sha256")
    .update(`${params.category}\u0000${params.title}\u0000${params.team.profile.slug}`)
    .digest("hex")
    .slice(0, 6);
  const withHash = `${stem}--${hash}${extension}`;
  if (!used.has(withHash.toLowerCase())) {
    return withHash;
  }
  let counter = 2;
  while (used.has(`${stem}--${counter}${extension}`.toLowerCase())) {
    counter += 1;
  }
  return `${stem}--${counter}${extension}`;
}

function prependCapabilityFrontmatter(params: {
  content: string;
  capabilityRole?: string;
  consumptionMode?: string;
  capabilityList?: string[];
  tagList?: string[];
  activationHintList?: string[];
  triggerTermList?: string[];
}): string {
  const meta: Record<string, unknown> = {};
  if (params.capabilityRole) {
    meta.role = params.capabilityRole;
  }
  if (params.consumptionMode) {
    meta.consumptionMode = params.consumptionMode;
  }
  if (params.capabilityList?.length) {
    meta.capabilities = params.capabilityList;
  }
  if (params.tagList?.length) {
    meta.tags = params.tagList;
  }
  if (params.activationHintList?.length) {
    meta.activationHints = params.activationHintList;
  }
  if (params.triggerTermList?.length) {
    meta.triggerTerms = params.triggerTermList;
  }
  if (Object.keys(meta).length === 0) {
    return params.content;
  }
  const yaml = Object.entries(meta)
    .map(([k, v]) => `${k}: ${JSON.stringify(v)}`)
    .join("\n");
  return `---\n${yaml}\n---\n\n${params.content}`;
}

function buildTeamAssetCanonicalMetadata(params: { teamSlug: string; asset: TeamAssetRecord }) {
  const spec = resolveTeamAssetTypeRuntime(params.asset.category);
  return {
    version: 1,
    id: params.asset.id,
    teamSlug: params.teamSlug,
    category: params.asset.category,
    family: spec.family,
    format: spec.defaultFormat,
    assetServerKind: spec.assetServerKind ?? null,
    materializationTargets: [...spec.materializationTargets],
    title: params.asset.title,
    filename: params.asset.filename,
    submittedBy: params.asset.submittedBy,
    role: params.asset.role,
    sourceZone: params.asset.sourceZone,
    note: params.asset.note ?? null,
    submittedAt: params.asset.submittedAt,
    updatedAt: params.asset.updatedAt,
    status: params.asset.status,
    approvalRequired: params.asset.approvalRequired,
    visibility: params.asset.visibility,
    releaseId: params.asset.releaseId ?? null,
    approvedBy: params.asset.approvedBy ?? null,
    approvedAt: params.asset.approvedAt ?? null,
    rejectedBy: params.asset.rejectedBy ?? null,
    rejectedAt: params.asset.rejectedAt ?? null,
    rejectionReason: params.asset.rejectionReason ?? null,
    publishedBy: params.asset.publishedBy ?? null,
    publishedAt: params.asset.publishedAt ?? null,
    projections: {
      sourcePath: params.asset.sourcePath,
      approvalPath: params.asset.approvalPath ?? null,
      publishedPath: params.asset.publishedPath ?? null,
      currentPath: params.asset.currentPath ?? null,
    },
  };
}

async function writeTeamAssetCanonicalItem(params: {
  teamSlug: string;
  asset: TeamAssetRecord;
  content: string;
}) {
  const itemDir = teamAssetItemDir(params.teamSlug, params.asset.id);
  await fs.mkdir(itemDir, { recursive: true });
  await writeText(teamAssetItemContentPath(params.teamSlug, params.asset), params.content);
  await writeText(
    teamAssetItemMetaPath(params.teamSlug, params.asset.id),
    `${JSON.stringify(
      buildTeamAssetCanonicalMetadata({
        teamSlug: params.teamSlug,
        asset: params.asset,
      }),
      null,
      2,
    )}\n`,
  );
}

async function writeTeamAssetCanonicalVersion(params: {
  teamSlug: string;
  asset: TeamAssetRecord;
  releaseId: string;
  content: string;
}) {
  await writeText(
    teamAssetItemVersionContentPath(params.teamSlug, params.asset, params.releaseId),
    params.content,
  );
}

function resolveTeamAssetLegacyProjectionTargets(params: {
  teamSlug: string;
  asset: TeamAssetRecord;
}) {
  const sourcePath = path.join(
    teamAssetCategoryDir(params.teamSlug, params.asset.sourceZone, params.asset.category),
    params.asset.filename,
  );
  const currentPath = path.join(
    teamAssetCategoryDir(params.teamSlug, "current", params.asset.category),
    params.asset.filename,
  );
  const publishedPath = params.asset.releaseId
    ? path.join(
        teamAssetReleasesDir(params.teamSlug),
        params.asset.releaseId,
        params.asset.category,
        params.asset.filename,
      )
    : null;
  return { sourcePath, currentPath, publishedPath };
}

async function writeTeamAssetLegacyProjections(params: {
  teamSlug: string;
  asset: TeamAssetRecord;
  content: string;
}) {
  const targets = resolveTeamAssetLegacyProjectionTargets(params);
  await writeText(targets.sourcePath, params.content);
  params.asset.sourcePath = path.relative(ROOT, targets.sourcePath);

  if (params.asset.status === "published" && targets.publishedPath) {
    await writeText(targets.currentPath, params.content);
    await writeText(targets.publishedPath, params.content);
    params.asset.currentPath = path.relative(ROOT, targets.currentPath);
    params.asset.publishedPath = path.relative(ROOT, targets.publishedPath);
    return;
  }

  params.asset.currentPath = undefined;
  params.asset.publishedPath = undefined;
}

async function readTeamAssetCanonicalContent(params: {
  teamSlug: string;
  asset: TeamAssetRecord;
}): Promise<string> {
  const canonicalPath = teamAssetItemContentPath(params.teamSlug, params.asset);
  if (await fileExists(canonicalPath)) {
    return readText(canonicalPath);
  }
  if (params.asset.currentPath && (await fileExists(path.join(ROOT, params.asset.currentPath)))) {
    return readText(path.join(ROOT, params.asset.currentPath));
  }
  return readText(path.join(ROOT, params.asset.sourcePath));
}

async function publishTeamAssetRecord(params: {
  team: TeamState;
  asset: TeamAssetRecord;
  actorId: string;
}) {
  const releaseId = new Date()
    .toISOString()
    .replace(/[-:]/g, "")
    .replace(/\.\d{3}Z$/, "Z");
  const content = await readTeamAssetCanonicalContent({
    teamSlug: params.team.profile.slug,
    asset: params.asset,
  });

  params.asset.status = "published";
  params.asset.updatedAt = nowIso();
  params.asset.publishedAt = params.asset.updatedAt;
  params.asset.publishedBy = params.actorId;
  params.asset.releaseId = releaseId;
  await writeTeamAssetLegacyProjections({
    teamSlug: params.team.profile.slug,
    asset: params.asset,
    content,
  });
  await writeTeamAssetCanonicalVersion({
    teamSlug: params.team.profile.slug,
    asset: params.asset,
    releaseId,
    content,
  });
  await writeTeamAssetCanonicalItem({
    teamSlug: params.team.profile.slug,
    asset: params.asset,
    content,
  });

  assetChangeEmitter.emit("change", {
    kind: "asset.published",
    teamSlug: params.team.profile.slug,
    assetId: params.asset.id,
    timestamp: params.asset.updatedAt,
  } satisfies AssetChangeEvent);
}

export async function createTeamAssetProposal(
  input: CreateAssetProposalInput,
): Promise<TeamAssetActionResult> {
  return mutateNamedTeamState(input.teamSlug, async (team) => {
    await ensureTeamAssetLayout(team.profile.slug);
    const title = input.title.trim();
    if (!title) {
      throw new HttpError(400, "title required");
    }
    const defaults = resolveDefaultCapabilityProfileForCategory(input.category);
    const capabilityRole = input.capabilityRole ?? defaults.role;
    const consumptionMode = input.consumptionMode ?? defaults.consumptionMode;
    const capabilityList = normalizeStringList(input.capabilityList);
    const tagList = normalizeStringList(input.tagList);
    const activationHintList = normalizeStringList(input.activationHintList);
    const triggerTermList = normalizeStringList(input.triggerTermList);
    const content = prependCapabilityFrontmatter({
      content: input.content,
      capabilityRole,
      consumptionMode,
      capabilityList,
      tagList,
      activationHintList,
      triggerTermList,
    }).trim();
    if (!content) {
      throw new HttpError(400, "content required");
    }

    const actor = resolveMemberPermissions(team, input.submittedByMemberId);
    if (!actor.permissions.canPropose) {
      throw new HttpError(403, `member cannot propose shared assets: ${input.submittedByMemberId}`);
    }

    const submittedBy =
      input.submittedByMemberId?.trim() || input.submittedByLabel?.trim() || "manager";
    const fileName = resolveUniqueAssetFileName({
      team,
      category: input.category,
      title,
    });
    const sourceZone = input.sourceZone ?? "collab";
    const createdAt = nowIso();
    const initialStatus: TeamAssetRecord["status"] =
      sourceZone === "drafts"
        ? "draft"
        : actor.permissions.canPublishWithoutApproval
          ? "approved"
          : "pending_approval";

    const asset: TeamAssetRecord = {
      id: crypto.randomUUID(),
      teamSlug: team.profile.slug,
      category: input.category,
      title,
      filename: fileName,
      submittedBy,
      role: actor.role,
      sourceZone,
      status: initialStatus,
      visibility: "team",
      approvalRequired: sourceZone !== "drafts" && !actor.permissions.canPublishWithoutApproval,
      note: input.note?.trim() || undefined,
      submittedAt: createdAt,
      updatedAt: createdAt,
      sourcePath: "",
    };

    await writeTeamAssetLegacyProjections({
      teamSlug: team.profile.slug,
      asset,
      content,
    });
    await writeTeamAssetCanonicalItem({
      teamSlug: team.profile.slug,
      asset,
      content,
    });

    if (asset.status === "approved") {
      asset.approvedAt = createdAt;
      asset.approvedBy = submittedBy;
      await publishTeamAssetRecord({ team, asset, actorId: submittedBy });
    }

    team.assets.unshift(asset);
    void appendAuditEntry({
      ts: createdAt,
      event: "asset.proposed",
      actor: submittedBy,
      teamSlug: team.profile.slug,
      resourceType: "asset",
      resourceId: asset.id,
      detail: `Asset proposed: ${title} (${input.category}), status=${initialStatus}`,
    });
    return { asset, changed: true };
  });
}

export async function approveTeamAssetProposal(input: {
  teamSlug: string;
  assetId: string;
  approvedByMemberId: string;
}): Promise<TeamAssetActionResult> {
  return mutateNamedTeamState(input.teamSlug, async (team) => {
    const actor = resolveMemberPermissions(team, input.approvedByMemberId);
    if (!actor.permissions.canApprove) {
      throw new HttpError(403, `member cannot approve shared assets: ${input.approvedByMemberId}`);
    }

    const asset = team.assets.find((a) => a.id === input.assetId);
    if (!asset) {
      throw new HttpError(404, `asset not found: ${input.assetId}`);
    }
    if (asset.status !== "pending_approval" && asset.status !== "approved") {
      throw new HttpError(409, `asset not awaiting approval: ${asset.id}`);
    }

    asset.status = "approved";
    asset.approvedAt = nowIso();
    asset.approvedBy = input.approvedByMemberId;
    await publishTeamAssetRecord({ team, asset, actorId: input.approvedByMemberId });
    void appendAuditEntry({
      ts: asset.approvedAt,
      event: "asset.approved",
      actor: input.approvedByMemberId,
      teamSlug: input.teamSlug,
      resourceType: "asset",
      resourceId: asset.id,
      detail: `Asset approved: ${asset.title}`,
    });
    return { asset, changed: true };
  });
}

export async function rejectTeamAssetProposal(input: {
  teamSlug: string;
  assetId: string;
  rejectedByMemberId: string;
  reason?: string;
}): Promise<TeamAssetActionResult> {
  return mutateNamedTeamState(input.teamSlug, async (team) => {
    const actor = resolveMemberPermissions(team, input.rejectedByMemberId);
    if (!actor.permissions.canApprove) {
      throw new HttpError(403, `member cannot reject shared assets: ${input.rejectedByMemberId}`);
    }

    const asset = team.assets.find((a) => a.id === input.assetId);
    if (!asset) {
      throw new HttpError(404, `asset not found: ${input.assetId}`);
    }

    asset.status = "rejected";
    asset.updatedAt = nowIso();
    asset.rejectedAt = asset.updatedAt;
    asset.rejectedBy = input.rejectedByMemberId;
    asset.rejectionReason = input.reason?.trim() || undefined;
    const content = await readTeamAssetCanonicalContent({
      teamSlug: team.profile.slug,
      asset,
    });
    await writeTeamAssetCanonicalItem({
      teamSlug: team.profile.slug,
      asset,
      content,
    });
    void appendAuditEntry({
      ts: asset.rejectedAt,
      event: "asset.rejected",
      actor: input.rejectedByMemberId,
      teamSlug: input.teamSlug,
      resourceType: "asset",
      resourceId: asset.id,
      detail: `Asset rejected: ${asset.title}${input.reason ? ` — ${input.reason}` : ""}`,
    });
    return { asset, changed: true };
  });
}

export async function promoteTeamAsset(
  teamSlug: string,
  assetId: string,
  actorId: string,
): Promise<TeamAssetActionResult> {
  return mutateNamedTeamState(teamSlug, async (team) => {
    const actor = resolveMemberPermissions(team, actorId);
    if (!actor.permissions.canPromote && !actor.permissions.canApprove) {
      throw new HttpError(403, `member cannot promote shared assets: ${actorId}`);
    }
    const asset = team.assets.find((a) => a.id === assetId);
    if (!asset) {
      throw new HttpError(404, `asset not found: ${assetId}`);
    }
    asset.approvedAt = nowIso();
    asset.approvedBy = actorId;
    await publishTeamAssetRecord({ team, asset, actorId });
    void appendAuditEntry({
      ts: asset.approvedAt,
      event: "asset.promoted",
      actor: actorId,
      teamSlug,
      resourceType: "asset",
      resourceId: assetId,
      detail: `Asset promoted: ${asset.title}`,
    });
    return { asset, changed: true };
  });
}

export async function backfillTeamAssetItemStoreBySlug(slugRaw: string): Promise<{
  teamSlug: string;
  processed: number;
  backfilled: number;
}> {
  const slug = slugifyTeamLabel(slugRaw);
  return mutateNamedTeamState(slug, async (team) => {
    await ensureTeamAssetLayout(slug);

    let processed = 0;
    let backfilled = 0;
    for (const asset of team.assets) {
      processed += 1;
      const canonicalPath = teamAssetItemContentPath(slug, asset);
      const hadCanonical = await fileExists(canonicalPath);
      const content = await readTeamAssetCanonicalContent({
        teamSlug: slug,
        asset,
      });
      await writeTeamAssetLegacyProjections({
        teamSlug: slug,
        asset,
        content,
      });
      await writeTeamAssetCanonicalItem({
        teamSlug: slug,
        asset,
        content,
      });
      if (asset.releaseId) {
        await writeTeamAssetCanonicalVersion({
          teamSlug: slug,
          asset,
          releaseId: asset.releaseId,
          content,
        });
      }
      if (!hadCanonical) {
        backfilled += 1;
      }
    }

    return { teamSlug: slug, processed, backfilled };
  });
}

export async function rebuildTeamAssetProjectionsBySlug(slugRaw: string): Promise<{
  teamSlug: string;
  rebuilt: number;
}> {
  const slug = slugifyTeamLabel(slugRaw);
  return mutateNamedTeamState(slug, async (team) => {
    await ensureTeamAssetLayout(slug);
    let rebuilt = 0;
    for (const asset of team.assets) {
      const content = await readTeamAssetCanonicalContent({
        teamSlug: slug,
        asset,
      });
      await writeTeamAssetLegacyProjections({
        teamSlug: slug,
        asset,
        content,
      });
      await writeTeamAssetCanonicalItem({
        teamSlug: slug,
        asset,
        content,
      });
      rebuilt += 1;
    }
    return { teamSlug: slug, rebuilt };
  });
}

// ============ Asset Server (Resolve/Manifest) ============

const STOP_WORDS = new Set([
  "the",
  "and",
  "for",
  "with",
  "from",
  "this",
  "that",
  "a",
  "an",
  "are",
  "as",
  "at",
  "be",
  "by",
  "can",
  "do",
  "does",
  "explain",
  "help",
  "how",
  "is",
  "it",
  "me",
  "need",
  "of",
  "or",
  "please",
  "to",
  "use",
  "what",
  "why",
  "you",
  "team",
  "shared",
  "asset",
  "一下",
  "一些",
  "为什么",
  "什么",
  "使用",
  "做",
  "先",
  "分类",
  "帮我",
  "怎么",
  "我想",
  "找",
  "产品",
  "整理",
  "是否",
  "用",
  "自动",
  "解释",
  "请",
  "这波",
  "这个",
  "这些",
  "需要",
  "为什",
  "什么",
]);

function tokenizeAssetText(value: string): string[] {
  const normalized = (value || "")
    .toLowerCase()
    .normalize("NFKC")
    .replace(/[^\p{L}\p{N}]+/gu, " ");
  const raw = normalized
    .split(/\s+/)
    .map((t) => t.trim())
    .filter(Boolean);
  const tokens: string[] = [];
  for (const r of raw) {
    const cjk = r.match(/[\u4e00-\u9fff\u3400-\u4dbf]/g);
    if (cjk && cjk.length >= 2) {
      tokens.push(r);
      for (let i = 0; i < cjk.length - 1; i++) {
        tokens.push(cjk[i] + cjk[i + 1]);
      }
    } else if (r.length >= 2) {
      tokens.push(r);
    }
  }
  return tokens.filter((t) => !STOP_WORDS.has(t));
}

function normalizeAssetPhrase(value: string): string {
  return (value || "").toLowerCase().normalize("NFKC").replace(/\s+/gu, " ").trim();
}

function topKeywordsFromText(...parts: string[]): string[] {
  const freq = new Map<string, number>();
  for (const p of parts) {
    for (const t of tokenizeAssetText(p)) {
      freq.set(t, (freq.get(t) ?? 0) + 1);
    }
  }
  return [...freq.entries()]
    .toSorted((a, b) => b[1] - a[1])
    .slice(0, 24)
    .map(([t]) => t);
}

function parseBooleanEnvFlag(value: string | undefined): boolean | undefined {
  const normalized = value?.trim().toLowerCase();
  if (!normalized) {
    return undefined;
  }
  if (["1", "true", "yes", "on", "enabled"].includes(normalized)) {
    return true;
  }
  if (["0", "false", "no", "off", "disabled"].includes(normalized)) {
    return false;
  }
  return undefined;
}

function isTeamClawHubSkillsEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  const explicit = parseBooleanEnvFlag(
    env.VELACLAW_TEAM_CLAWHUB_SKILLS_ENABLED ?? env.VELACLAW_SHARED_CLAWHUB_SKILLS_ENABLED,
  );
  return explicit === true;
}

function resolveAssetRouterMode(env: NodeJS.ProcessEnv = process.env): AssetRouterMode {
  const raw = env.VELACLAW_TEAM_ASSET_ROUTER_MODE?.trim().toLowerCase();
  if (raw === ASSET_ROUTER_MODE_LEXICAL) {
    return ASSET_ROUTER_MODE_LEXICAL;
  }
  return ASSET_ROUTER_MODE_DYNAMIC_LLM;
}

function encodeClawHubSkillAssetId(slug: string): string {
  return `${CLAWHUB_SKILL_ASSET_ID_PREFIX}${slug}`;
}

function decodeClawHubSkillAssetId(id: string): string | null {
  if (!id.startsWith(CLAWHUB_SKILL_ASSET_ID_PREFIX)) {
    return null;
  }
  const slug = id.slice(CLAWHUB_SKILL_ASSET_ID_PREFIX.length).trim();
  return slug || null;
}

function formatClawHubTimestamp(value: number | undefined): string {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
    return nowIso();
  }
  const ms = value < 10_000_000_000 ? value * 1000 : value;
  return new Date(ms).toISOString();
}

function buildClawHubSkillKeywords(...parts: string[]): string[] {
  return Array.from(new Set(["clawhub", "skill", "skills", ...topKeywordsFromText(...parts)]));
}

function isMarketOrFinancialAssetQuery(query: string): boolean {
  const normalized = normalizeAssetPhrase(query);
  return (
    hasLikelyMarketTicker(query) ||
    /\b(stock|stocks|equity|equities|financial|finance|valuation|earnings|revenue|profitability|market cap|market driver|price target|analyst|catalyst)\b/i.test(
      query,
    ) ||
    /股票|股价|涨|上涨|跌|下跌|财报|估值|基本面|投研|催化|公告|美股|港股|a股|板块|分析师|目标价|市值/.test(
      normalized,
    )
  );
}

function hasLikelyMarketTicker(query: string): boolean {
  const ignored = new Set([
    "AI",
    "AM",
    "API",
    "CST",
    "CPU",
    "GMT",
    "GPU",
    "GPT",
    "HTML",
    "HTTP",
    "JSON",
    "LLM",
    "OK",
    "PM",
    "SQL",
    "URL",
    "UTC",
  ]);
  return (query.match(/\b[A-Z]{1,5}(?:\.[A-Z]{1,4})?\b/g) ?? []).some(
    (match) => !ignored.has(match),
  );
}

function isUsStockAssetQuery(query: string): boolean {
  return (
    hasLikelyMarketTicker(query) ||
    /\b(us stock|american stocks|nasdaq|nyse|wall street|s&p 500)\b/i.test(query) ||
    /美股/.test(normalizeAssetPhrase(query))
  );
}

function isStockSelectionAssetQuery(query: string): boolean {
  const normalized = normalizeAssetPhrase(query);
  return (
    /\b(stock picking|stock screener|screen stocks|pick stocks|sector picks|watchlist|portfolio shortlist|recommend stocks)\b/i.test(
      query,
    ) ||
    /选股|帮我选几个|股票池|值得盯|哪几只|哪些股票|买哪些|行业股票|主题股票|筛选.*股票|股票.*筛选/.test(
      normalized,
    )
  );
}

function isMarketCatalystAssetQuery(query: string): boolean {
  return (
    isMarketOrFinancialAssetQuery(query) &&
    (/\b(why|reason|driver|catalyst|announcement|news|headline|moved|up|down|rally|selloff)\b/i.test(
      query,
    ) ||
      /为什么|原因|驱动|催化|公告|新闻|消息|涨|上涨|跌|下跌|这波|归因/.test(
        normalizeAssetPhrase(query),
      ))
  );
}

function isTradingOrTechnicalAssetQuery(query: string): boolean {
  return (
    /\b(trade|trading|buy|sell|hold|signal|technical|chart|rsi|moving average|support|resistance)\b/i.test(
      query,
    ) || /买入|卖出|持有|交易|技术|指标|均线|支撑|阻力|rsi/.test(normalizeAssetPhrase(query))
  );
}

function buildClawHubSkillSearchQueries(query: string): string[] {
  const trimmed = query.trim();
  if (!trimmed) {
    return [];
  }
  const queries = [trimmed];
  if (isMarketOrFinancialAssetQuery(trimmed)) {
    queries.push(
      `${trimmed} stock analysis financial analysis equity research market driver earnings valuation catalyst stock price 股票 股价 基本面 投研 财报 估值`,
    );
  }
  if (isMarketCatalystAssetQuery(trimmed)) {
    queries.push(
      `${trimmed} equity research event driven stock catalyst fundamental analysis market sentiment buy-side research`,
      `${trimmed} 个股基本面 深度研究 投研 新闻催化 市场情绪 催化剂日历 买方基金经理 事件驱动 归因`,
      `${trimmed} 消息面 事件驱动 公司公告 行业事件 舆情 情绪 影响股价 归因`,
    );
  }
  if (isUsStockAssetQuery(trimmed)) {
    queries.push(`${trimmed} US stock analysis American stocks 美股 financial metrics`);
  }
  return Array.from(new Set(queries));
}

function boostClawHubSkillMatch(
  query: string,
  match: AssetServerResolveMatch,
): AssetServerResolveMatch {
  const text = normalizeAssetPhrase(
    [
      match.id,
      match.title,
      match.summary,
      ...(Array.isArray(match.keywords) ? match.keywords : []),
      ...(Array.isArray(match.capability?.tags) ? match.capability.tags : []),
      ...(Array.isArray(match.capability?.activationHints) ? match.capability.activationHints : []),
      ...(Array.isArray(match.capability?.triggerTerms) ? match.capability.triggerTerms : []),
    ].join(" "),
  );
  let boost = 0;
  if (isMarketOrFinancialAssetQuery(query)) {
    if (
      /stock|financial|finance|equity|valuation|earnings|财报|估值|基本面|投研|股票|股价|美股|港股|a股/.test(
        text,
      )
    ) {
      boost += 16;
    }
    if (/research|analysis|analyst|分析|研究|投研/.test(text)) {
      boost += 8;
    }
  }
  if (isMarketCatalystAssetQuery(query)) {
    if (
      /equity|fundamental|stock analysis|financial analyst|event driven|market news|catalyst|news|driver|个股基本面|深度研究|催化|市场情绪|事件驱动|消息面|行业事件|舆情|影响股价|归因/.test(
        text,
      )
    ) {
      boost += 24;
    }
    if (/data api|api key|tushare|akshare|price checker|数据接口|行情数据/.test(text)) {
      boost -= 18;
    }
    if (
      !isTradingOrTechnicalAssetQuery(query) &&
      /trade signal|trading signal|buy\/sell|technical analysis|rsi|moving averages|均线|技术指标/.test(
        text,
      )
    ) {
      boost -= 22;
    }
  }
  if (isUsStockAssetQuery(query)) {
    if (/us stock|american stocks|美股/.test(text)) {
      boost += 28;
    }
    if (
      /china stock|a-shares|a股|港股|hk stocks/.test(text) &&
      !/腾讯|港股|a股|中国|china|hong kong|hk/i.test(query)
    ) {
      boost -= 90;
    }
    if (/\b(vn|vietnam)\b|越南/.test(text) && !/越南|vietnam|\bvn\b/i.test(query)) {
      boost -= 120;
    }
  }
  return boost === 0 ? match : { ...match, score: Math.max(1, match.score + boost) };
}

function buildClawHubSkillHubItem(team: TeamState): AssetServerItem {
  const content = [
    "---",
    "name: clawhub-skill-hub",
    "description: Discover and activate ClawHub skills as team shared assets when a task needs an external open-source capability.",
    'tags: ["clawhub", "skills", "open-source", "shared-assets"]',
    'activationHints: ["need an external skill", "find an open source skill", "ClawHub skill", "shared skill hub"]',
    'triggerTerms: ["clawhub", "skill hub", "skills hub", "open source skill", "共享 skill", "技能市场"]',
    "---",
    "",
    "# ClawHub Skill Hub",
    "",
    "This team treats ClawHub skills as shared assets. When a task may benefit from an external skill, rely on the active shared asset selection first. If a ClawHub skill has been materialized under `skills/team-shared-active-*`, read its `SKILL.md` and follow it.",
    "",
    "Do not expose ClawHub credentials. The control plane resolves and downloads skill assets; members only consume materialized files.",
    "",
  ].join("\n");
  const updatedAt = nowIso();
  const contentHash = crypto.createHash("sha256").update(content).digest("hex").slice(0, 16);
  return {
    id: CLAWHUB_SKILL_HUB_ASSET_ID,
    kind: "skills",
    category: "shared-skills",
    family: "capability",
    format: "md",
    title: "ClawHub Skill Hub",
    filename: "skill-clawhub-skill-hub.md",
    updatedAt,
    contentHash,
    summary:
      "Discover and activate ClawHub skills as team shared assets without exposing registry credentials to members.",
    keywords: buildClawHubSkillKeywords("clawhub skill hub open source shared assets"),
    materializationTargets: ["workspace.skills.active"],
    capability: {
      role: "instruction",
      consumptionMode: "skill",
      capabilities: ["clawhub-skill-discovery", "shared-skill-activation"],
      tags: ["clawhub", "skills", "open-source", "shared-assets"],
      activationHints: [
        "need an external skill",
        "find an open source skill",
        "ClawHub skill",
        "shared skill hub",
      ],
      triggerTerms: ["clawhub", "skill hub", "skills hub", "open source skill", "技能市场"],
    },
    content,
    currentPath: `clawhub://hub/${team.profile.slug}`,
    publishedPath: `clawhub://hub/${team.profile.slug}`,
  };
}

function buildClawHubSkillSummary(result: ClawHubSkillSearchResult | ClawHubSkillDetail): string {
  if ("skill" in result) {
    return (
      result.skill?.summary?.trim() ||
      result.latestVersion?.changelog?.trim() ||
      result.skill?.displayName ||
      result.skill?.slug ||
      "ClawHub skill"
    ).slice(0, 240);
  }
  return (result.summary?.trim() || result.displayName || result.slug || "ClawHub skill").slice(
    0,
    240,
  );
}

function buildClawHubSkillManifestItem(result: ClawHubSkillSearchResult): AssetServerResolveMatch {
  const title = result.displayName || result.slug;
  const summary = buildClawHubSkillSummary(result);
  const updatedAt = formatClawHubTimestamp(result.updatedAt);
  const version = result.version ? `@${result.version}` : "";
  const contentHash = crypto
    .createHash("sha256")
    .update(`${result.slug}\u0000${result.version ?? ""}\u0000${summary}`)
    .digest("hex")
    .slice(0, 16);
  return {
    id: encodeClawHubSkillAssetId(result.slug),
    kind: "skills",
    category: "shared-skills",
    family: "capability",
    format: "bundle",
    title: `${title}${version}`,
    filename: `clawhub-${slugifyAssetName(result.slug)}.skill`,
    updatedAt,
    contentHash,
    summary,
    keywords: buildClawHubSkillKeywords(result.slug, title, summary),
    materializationTargets: ["workspace.skills.active"],
    capability: {
      role: "instruction",
      consumptionMode: "skill",
      capabilities: ["clawhub-skill"],
      tags: ["clawhub", "skills"],
      activationHints: [summary, title, result.slug].filter(Boolean),
      triggerTerms: [result.slug, title].filter(Boolean),
    },
    currentPath: `clawhub://skills/${result.slug}${version}`,
    publishedPath: `clawhub://skills/${result.slug}${version}`,
    score: Math.max(1, Math.round((result.score || 0) * 100)),
    matchedTerms: [result.slug, ...topKeywordsFromText(title, summary)].slice(0, 8),
  };
}

function safeAssetFilePath(value: string): string | null {
  const raw = value.replace(/\\/g, "/").trim();
  if (!raw || raw.startsWith("/") || raw.includes("\0")) {
    return null;
  }
  const normalized = path.posix.normalize(raw);
  if (!normalized || normalized === "." || normalized === ".." || normalized.startsWith("../")) {
    return null;
  }
  return normalized;
}

function isProbablyTextFile(buffer: Buffer): boolean {
  return !buffer.includes(0);
}

async function collectClawHubSkillFiles(rootDir: string): Promise<AssetServerFile[]> {
  const files: AssetServerFile[] = [];
  let totalBytes = 0;
  async function walk(currentDir: string) {
    if (files.length >= CLAWHUB_SKILL_FILE_LIMIT || totalBytes >= CLAWHUB_SKILL_TOTAL_MAX_BYTES) {
      return;
    }
    const entries = await fs.readdir(currentDir, { withFileTypes: true });
    for (const entry of entries.toSorted((a, b) => a.name.localeCompare(b.name))) {
      if (files.length >= CLAWHUB_SKILL_FILE_LIMIT || totalBytes >= CLAWHUB_SKILL_TOTAL_MAX_BYTES) {
        return;
      }
      if (entry.name === ".git" || entry.name === "node_modules") {
        continue;
      }
      const fullPath = path.join(currentDir, entry.name);
      if (entry.isDirectory()) {
        await walk(fullPath);
        continue;
      }
      if (!entry.isFile()) {
        continue;
      }
      const relativePath = safeAssetFilePath(path.relative(rootDir, fullPath));
      if (!relativePath) {
        continue;
      }
      const stat = await fs.stat(fullPath);
      if (stat.size > CLAWHUB_SKILL_FILE_MAX_BYTES) {
        continue;
      }
      if (totalBytes + stat.size > CLAWHUB_SKILL_TOTAL_MAX_BYTES) {
        continue;
      }
      const buffer = await fs.readFile(fullPath);
      if (!isProbablyTextFile(buffer)) {
        continue;
      }
      files.push({
        path: relativePath,
        content: buffer.toString("utf8"),
      });
      totalBytes += stat.size;
    }
  }
  await walk(rootDir);
  return files;
}

async function readClawHubSkillBundleFiles(params: {
  slug: string;
  version?: string;
  token?: string;
}): Promise<{ files: AssetServerFile[]; skillContent: string }> {
  const archive = await downloadClawHubSkillArchive({
    slug: params.slug,
    version: params.version,
    token: params.token,
  });
  try {
    const result = await withExtractedArchiveRoot({
      archivePath: archive.archivePath,
      tempDirPrefix: "velaclaw-team-clawhub-skill-",
      timeoutMs: 120_000,
      rootMarkers: ["SKILL.md"],
      onExtracted: async (rootDir) => {
        const files = await collectClawHubSkillFiles(rootDir);
        const skillFile = files.find((file) => file.path === "SKILL.md");
        if (!skillFile) {
          return { ok: false as const, error: "downloaded ClawHub skill is missing SKILL.md" };
        }
        return { ok: true as const, files, skillContent: skillFile.content };
      },
    });
    if (!result.ok) {
      throw new Error(result.error);
    }
    return { files: result.files, skillContent: result.skillContent };
  } finally {
    await archive.cleanup().catch(() => undefined);
  }
}

async function buildClawHubSkillAssetItemBySlug(slug: string): Promise<AssetServerItem | null> {
  if (!isTeamClawHubSkillsEnabled()) {
    return null;
  }
  const token = await resolveClawHubAuthToken();
  const detail = await fetchClawHubSkillDetail({ slug, token }).catch(() => null);
  if (!detail?.skill) {
    return null;
  }
  const version = detail.latestVersion?.version;
  const bundle = await readClawHubSkillBundleFiles({ slug, version, token });
  const title = detail.skill.displayName || slug;
  const summary = buildClawHubSkillSummary(detail);
  const updatedAt = formatClawHubTimestamp(detail.skill.updatedAt);
  const contentHash = crypto
    .createHash("sha256")
    .update(bundle.files.map((file) => `${file.path}\u0000${file.content}`).join("\u0000"))
    .digest("hex")
    .slice(0, 16);
  const tags = detail.skill.tags ? Object.keys(detail.skill.tags).slice(0, 12) : [];
  return {
    id: encodeClawHubSkillAssetId(slug),
    kind: "skills",
    category: "shared-skills",
    family: "capability",
    format: "bundle",
    title,
    filename: `clawhub-${slugifyAssetName(slug)}.skill`,
    updatedAt,
    contentHash,
    summary,
    keywords: buildClawHubSkillKeywords(slug, title, summary, tags.join(" ")),
    materializationTargets: ["workspace.skills.active"],
    capability: {
      role: "instruction",
      consumptionMode: "skill",
      capabilities: ["clawhub-skill"],
      tags: ["clawhub", "skills", ...tags],
      activationHints: [summary, title, slug].filter(Boolean),
      triggerTerms: [slug, title, ...tags].filter(Boolean),
    },
    content: bundle.skillContent,
    files: bundle.files,
    currentPath: `clawhub://skills/${slug}${version ? `@${version}` : ""}`,
    publishedPath: `clawhub://skills/${slug}${version ? `@${version}` : ""}`,
  };
}

async function resolveClawHubSkillMatches(query: string): Promise<AssetServerResolveMatch[]> {
  if (!isTeamClawHubSkillsEnabled()) {
    return [];
  }
  const trimmed = query.trim();
  if (!trimmed || trimmed.startsWith("/")) {
    return [];
  }
  const token = await resolveClawHubAuthToken();
  const byId = new Map<string, AssetServerResolveMatch>();
  for (const searchQuery of buildClawHubSkillSearchQueries(trimmed)) {
    const results = await searchClawHubSkills({
      query: searchQuery,
      token,
      limit: CLAWHUB_SKILL_SEARCH_LIMIT,
    }).catch(() => []);
    for (const result of results) {
      const item = buildClawHubSkillManifestItem(result);
      const localScore = scoreAssetMatch(searchQuery, item);
      if (!localScore || localScore.score < CLAWHUB_SKILL_LOCAL_RELEVANCE_MIN_SCORE) {
        continue;
      }
      const boosted = boostClawHubSkillMatch(trimmed, {
        ...item,
        score: item.score + localScore.score,
        matchedTerms: localScore.matchedTerms,
      });
      const existing = byId.get(boosted.id);
      if (!existing || boosted.score > existing.score) {
        byId.set(boosted.id, boosted);
      }
    }
  }
  return [...byId.values()].toSorted((a, b) => b.score - a.score);
}

function parseFrontmatter(content: string): { data: Record<string, unknown>; body: string } {
  if (!content.startsWith("---\n")) {
    return { data: {}, body: content };
  }
  const end = content.indexOf("\n---\n", 4);
  if (end === -1) {
    return { data: {}, body: content };
  }
  const yaml = content.slice(4, end);
  const data: Record<string, unknown> = {};
  for (const line of yaml.split("\n")) {
    const m = line.match(/^(\w+):\s*(.+)$/);
    if (m) {
      try {
        data[m[1]] = JSON.parse(m[2]);
      } catch {
        data[m[1]] = m[2];
      }
    }
  }
  return { data, body: content.slice(end + 5) };
}

async function buildAssetServerItem(
  team: TeamState,
  asset: TeamAssetRecord,
): Promise<AssetServerItem | null> {
  const spec = resolveTeamAssetTypeRuntime(asset.category);
  const kind = spec.assetServerKind ?? null;
  if (!kind) {
    return null;
  }
  const rawContent = await readTeamAssetCanonicalContent({
    teamSlug: team.profile.slug,
    asset,
  }).catch(() => null);
  if (!rawContent) {
    return null;
  }
  const { data, body } = parseFrontmatter(rawContent);
  const tags = Array.isArray(data.tags) ? normalizeStringList(data.tags as string[]) : [];
  const capabilities = Array.isArray(data.capabilities)
    ? normalizeStringList(data.capabilities as string[])
    : [];
  const activationHints = Array.isArray(data.activationHints)
    ? normalizeStringList(data.activationHints as string[])
    : [];
  const triggerTerms = Array.isArray(data.triggerTerms)
    ? normalizeStringList(data.triggerTerms as string[])
    : [];
  const hash = crypto.createHash("sha256").update(rawContent).digest("hex").slice(0, 16);
  const summary =
    body
      .trim()
      .split("\n")[0]
      ?.replace(/^#+\s*/, "")
      .slice(0, 200) || asset.title;
  const keywords = topKeywordsFromText(asset.title, body, tags.join(" "), capabilities.join(" "));
  const defaults = resolveDefaultCapabilityProfileForCategory(asset.category);

  return {
    id: asset.id,
    kind,
    category: asset.category,
    family: spec.family,
    format: spec.defaultFormat,
    title: asset.title,
    filename: asset.filename,
    updatedAt: asset.updatedAt,
    contentHash: hash,
    summary,
    keywords,
    materializationTargets: [...spec.materializationTargets],
    capability: {
      role: ((typeof data.role === "string" ? data.role : undefined) ??
        defaults.role) as import("./types.js").AssetCapabilityRole,
      consumptionMode: ((typeof data.consumptionMode === "string"
        ? data.consumptionMode
        : undefined) ?? defaults.consumptionMode) as import("./types.js").AssetConsumptionMode,
      capabilities,
      tags,
      activationHints,
      triggerTerms,
    },
    content: rawContent,
    currentPath: asset.currentPath,
    publishedPath: asset.publishedPath,
  };
}

async function buildAssetServerBundleForTeam(teamSlugRaw: string): Promise<AssetServerBundle> {
  const teamSlug = slugifyTeamLabel(teamSlugRaw);
  const root = await readTeamsState();
  const team = findTeamBySlugOrThrow(root, teamSlug);
  const items: AssetServerItem[] = [];
  for (const asset of team.assets) {
    if (asset.status !== "published") {
      continue;
    }
    const item = await buildAssetServerItem(team, asset);
    if (item) {
      items.push(item);
    }
  }
  if (isTeamClawHubSkillsEnabled()) {
    items.push(buildClawHubSkillHubItem(team));
  }
  const kinds = buildAssetServerKindList(items.map((item) => item.kind));
  const byKind = Object.fromEntries(kinds.map((kind) => [kind, [] as AssetServerItem[]])) as Record<
    AssetServerKind,
    AssetServerItem[]
  >;
  for (const item of items) {
    byKind[item.kind] ??= [];
    byKind[item.kind].push(item);
  }
  const counts = Object.fromEntries(
    kinds.map((kind) => [kind, byKind[kind]?.length ?? 0]),
  ) as Record<AssetServerKind, number>;
  const manifestHash = crypto
    .createHash("sha256")
    .update(items.map((i) => i.contentHash).join(""))
    .digest("hex")
    .slice(0, 16);
  return {
    team: { slug: teamSlug, name: team.profile.name },
    generatedAt: nowIso(),
    manifestHash,
    counts,
    items: items.map(({ content: _content, files: _files, ...rest }) => rest),
    byKind,
  };
}

export async function getTeamAssetServerManifestBySlug(slug: string): Promise<AssetServerManifest> {
  const bundle = await buildAssetServerBundleForTeam(slug);
  const { byKind: _byKind, ...manifest } = bundle;
  return manifest;
}

export async function getTeamAssetServerBundleBySlug(slug: string): Promise<AssetServerBundle> {
  return buildAssetServerBundleForTeam(slug);
}

export async function getTeamAssetCapabilityRegistryBySlug(slug: string) {
  const bundle = await buildAssetServerBundleForTeam(slug);
  const kinds = buildAssetServerKindList(Object.keys(bundle.byKind) as AssetServerKind[]);
  const byKindMeta = Object.fromEntries(
    kinds.map((kind) => [
      kind,
      (bundle.byKind[kind] ?? []).map(({ content: _content, files: _files, ...rest }) => rest),
    ]),
  ) as Record<AssetServerKind, AssetServerManifestItem[]>;
  for (const kind of kinds) {
    byKindMeta[kind] ??= [];
  }
  return {
    team: bundle.team,
    generatedAt: bundle.generatedAt,
    manifestHash: bundle.manifestHash,
    counts: bundle.counts,
    byKind: byKindMeta,
  };
}

export async function getTeamAssetServerItemById(
  slug: string,
  id: string,
): Promise<AssetServerItem | null> {
  const clawHubSlug = decodeClawHubSkillAssetId(id);
  if (clawHubSlug) {
    return await buildClawHubSkillAssetItemBySlug(clawHubSlug);
  }
  const bundle = await buildAssetServerBundleForTeam(slug);
  for (const kind of buildAssetServerKindList(Object.keys(bundle.byKind) as AssetServerKind[])) {
    const found = bundle.byKind[kind].find((i) => i.id === id);
    if (found) {
      return found;
    }
  }
  return null;
}

function scoreAssetMatch(
  query: string,
  item: AssetServerManifestItem,
): { score: number; matchedTerms: string[] } | null {
  const normalizedQuery = normalizeAssetPhrase(query);
  const queryTokens = Array.from(new Set(tokenizeAssetText(query)));
  if (!queryTokens.length) {
    return null;
  }
  const titleTokens = new Set(tokenizeAssetText(item.title));
  const summaryTokens = new Set(tokenizeAssetText(item.summary));
  const keywordTokens = new Set([...item.keywords, ...item.capability.tags]);
  const activationTokens = new Set(tokenizeAssetText(item.capability.activationHints.join(" ")));
  const triggerTokens = new Set(tokenizeAssetText(item.capability.triggerTerms.join(" ")));
  const activationPhrases = item.capability.activationHints
    .map((value) => normalizeAssetPhrase(value))
    .filter((value) => value.length >= 2);
  const triggerPhrases = item.capability.triggerTerms
    .map((value) => normalizeAssetPhrase(value))
    .filter((value) => value.length >= 2);
  const matched = new Set<string>();
  let score = 0;
  for (const phrase of triggerPhrases) {
    if (normalizedQuery.includes(phrase)) {
      score += 9;
      matched.add(phrase);
    }
  }
  for (const phrase of activationPhrases) {
    if (normalizedQuery.includes(phrase)) {
      score += 6;
      matched.add(phrase);
    }
  }
  for (const t of queryTokens) {
    if (titleTokens.has(t)) {
      score += 7;
      matched.add(t);
    }
    if (summaryTokens.has(t)) {
      score += 4;
      matched.add(t);
    }
    if (keywordTokens.has(t)) {
      score += 2;
      matched.add(t);
    }
    if (activationTokens.has(t)) {
      score += 3;
      matched.add(t);
    }
    if (triggerTokens.has(t)) {
      score += 5;
      matched.add(t);
    }
  }
  return score > 0 ? { score, matchedTerms: [...matched] } : null;
}

function truncateAssetRouterText(value: string, maxChars: number): string {
  const text = value.replace(/\s+/g, " ").trim();
  return text.length > maxChars ? `${text.slice(0, maxChars).trimEnd()}...` : text;
}

function parseAssetRouterJsonObject(text: string): Record<string, unknown> {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const source = fenced?.[1] ?? text;
  const start = source.indexOf("{");
  const end = source.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) {
    throw new Error("router returned no JSON object");
  }
  const parsed = JSON.parse(source.slice(start, end + 1));
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("router returned invalid JSON object");
  }
  return parsed as Record<string, unknown>;
}

function normalizeAssetRouterQueries(query: string, value: unknown): string[] {
  const queries = [query, ...(Array.isArray(value) ? value : [])]
    .map((entry) => (typeof entry === "string" ? entry.trim() : ""))
    .filter(Boolean)
    .map((entry) => entry.slice(0, 240));
  return Array.from(new Set(queries)).slice(0, ASSET_ROUTER_DISCOVERY_QUERY_LIMIT);
}

function buildStrongSignalAssetRouterQueries(query: string): string[] {
  const trimmed = query.trim();
  if (!trimmed) {
    return [];
  }
  if (isMarketOrFinancialAssetQuery(trimmed)) {
    const queries = [
      trimmed,
      `${trimmed} stock analysis financial analysis equity research market driver catalyst news earnings valuation`,
    ];
    if (isStockSelectionAssetQuery(trimmed)) {
      queries.push(
        `${trimmed} stock picking stock screener sector watchlist portfolio shortlist 选股 股票池 值得盯 行业股票`,
        `${trimmed} sector stock selection watchlist portfolio construction theme investing`,
      );
    }
    if (isMarketCatalystAssetQuery(trimmed)) {
      queries.push(
        `${trimmed} event driven stock catalyst market news price move attribution`,
        `${trimmed} 个股基本面 深度研究 新闻催化 市场情绪 事件驱动 归因`,
      );
    }
    if (isUsStockAssetQuery(trimmed)) {
      queries.push(`${trimmed} US stock analysis American stocks 美股`);
    }
    return Array.from(new Set(queries)).slice(0, ASSET_ROUTER_DISCOVERY_QUERY_LIMIT);
  }
  return [];
}

function normalizeAssetRouterConfidence(value: unknown): number | undefined {
  const numeric =
    typeof value === "number"
      ? value
      : typeof value === "string"
        ? Number.parseFloat(value)
        : Number.NaN;
  if (!Number.isFinite(numeric)) {
    return undefined;
  }
  return Math.max(0, Math.min(1, numeric));
}

function normalizeAssetRouterThinkLevel(value: string): "low" | "medium" | "high" | "xhigh" {
  switch (value.trim().toLowerCase()) {
    case "medium":
    case "med":
      return "medium";
    case "high":
      return "high";
    case "xhigh":
    case "extra-high":
    case "extrahigh":
      return "xhigh";
    case "minimal":
    case "min":
    case "low":
    default:
      return "low";
  }
}

async function callTeamAssetRouterLlm(params: {
  team: TeamState;
  systemPrompt: string;
  userMessage: string;
  maxTokens: number;
}): Promise<string> {
  const gateway = params.team.modelGateway;
  if (!gateway.enabled) {
    throw new Error("team model gateway disabled");
  }

  const upstream = await resolveTeamModelGatewayUpstream(gateway);
  const requestedModel = ASSET_ROUTER_MODEL || gateway.defaultModelId;
  const model = upstream.mapRequestedModel?.(requestedModel) ?? requestedModel;
  const baseRequestBody: Record<string, unknown> = {
    model,
    messages: [
      { role: "system", content: params.systemPrompt },
      { role: "user", content: params.userMessage },
    ],
    temperature: 0,
    max_tokens: params.maxTokens,
  };
  const reasoningEffort = normalizeAssetRouterThinkLevel(ASSET_ROUTER_THINK_LEVEL);
  const requestBodies =
    reasoningEffort === "low"
      ? [{ ...baseRequestBody, reasoning_effort: reasoningEffort }, baseRequestBody]
      : [{ ...baseRequestBody, reasoning_effort: reasoningEffort }, baseRequestBody];
  let lastError: Error | null = null;

  for (const requestBody of requestBodies) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), ASSET_ROUTER_TIMEOUT_MS);
    try {
      const response = await fetch(`${upstream.baseUrl.replace(/\/+$/, "")}/chat/completions`, {
        method: "POST",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
          ...upstream.headers,
        },
        body: JSON.stringify(requestBody),
        signal: controller.signal,
      });
      const raw = await response.text();
      if (!response.ok) {
        lastError = new Error(raw || `${response.status} ${response.statusText}`);
        if ("reasoning_effort" in requestBody) {
          continue;
        }
        throw lastError;
      }
      const parsed = JSON.parse(raw) as { choices?: { message?: { content?: string } }[] };
      const content = parsed.choices?.[0]?.message?.content?.trim();
      if (!content) {
        throw new Error("router returned empty response");
      }
      return content;
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
      if (!("reasoning_effort" in requestBody)) {
        throw lastError;
      }
    } finally {
      clearTimeout(timeout);
    }
  }

  throw lastError ?? new Error("router LLM call failed");
}

async function buildAssetRouterPlan(params: {
  team: TeamState;
  query: string;
  allowedKinds: AssetServerKind[];
}): Promise<AssetRouterPlan> {
  const systemPrompt = [
    "You are a fast capability router for a team shared-asset system.",
    "Decide whether the user's task needs team shared skills/assets.",
    "Return ONLY compact JSON.",
    "Do not request assets for ordinary conversation or simple general knowledge.",
    "If assets are useful, produce capability-oriented search queries, not a full answer.",
  ].join("\n");
  const userMessage = JSON.stringify(
    {
      task: params.query,
      allowedKinds: params.allowedKinds,
      outputSchema: {
        needsAssets: "boolean",
        confidence: "number from 0 to 1",
        searchQueries: "array of 1-3 short capability search queries",
        reason: "short string",
      },
    },
    null,
    2,
  );
  const raw = await callTeamAssetRouterLlm({
    team: params.team,
    systemPrompt,
    userMessage,
    maxTokens: 320,
  });
  const parsed = parseAssetRouterJsonObject(raw);
  const needsAssets = parsed.needsAssets === true;
  return {
    needsAssets,
    confidence: normalizeAssetRouterConfidence(parsed.confidence),
    searchQueries: needsAssets
      ? normalizeAssetRouterQueries(params.query, parsed.searchQueries)
      : [],
    reason: typeof parsed.reason === "string" ? parsed.reason.slice(0, 240) : undefined,
  };
}

function resolveAllowedAssetKinds(
  bundle: AssetServerBundle,
  kinds?: AssetServerKind[],
): AssetServerKind[] {
  const defaultKinds = buildAssetServerKindList(Object.keys(bundle.byKind) as AssetServerKind[]);
  const allowedKinds = new Set(kinds ?? defaultKinds);
  if (isTeamClawHubSkillsEnabled() && (!kinds || kinds.includes("skills"))) {
    allowedKinds.add("skills");
  }
  return [...allowedKinds];
}

function resolveAllowedAssetKindsForTeam(
  team: TeamState,
  kinds?: AssetServerKind[],
): AssetServerKind[] {
  const publishedKinds = team.assets
    .filter((asset) => asset.status === "published")
    .map((asset) => resolveTeamAssetTypeRuntime(asset.category).assetServerKind)
    .filter((kind): kind is AssetServerKind => Boolean(kind));
  const defaultKinds = buildAssetServerKindList(publishedKinds);
  const allowedKinds = new Set(kinds ?? defaultKinds);
  if (isTeamClawHubSkillsEnabled() && (!kinds || kinds.includes("skills"))) {
    allowedKinds.add("skills");
  }
  return [...allowedKinds];
}

function createEmptyResolveMatches(kinds: Iterable<AssetServerKind>) {
  return Object.fromEntries(
    [...kinds].map((kind) => [kind, [] as AssetServerResolveMatch[]]),
  ) as Record<AssetServerKind, AssetServerResolveMatch[]>;
}

function upsertAssetRouterCandidate(
  byId: Map<string, AssetRouterCandidate>,
  candidate: AssetRouterCandidate,
): void {
  const existing = byId.get(candidate.match.id);
  if (!existing || candidate.match.score > existing.match.score) {
    byId.set(candidate.match.id, candidate);
  }
}

function rankAssetRouterCandidates(params: {
  localCandidates: AssetRouterCandidate[];
  clawHubCandidates: AssetRouterCandidate[];
}): AssetRouterCandidate[] {
  const combined = new Map<string, AssetRouterCandidate>();
  for (const candidate of [...params.localCandidates, ...params.clawHubCandidates]) {
    upsertAssetRouterCandidate(combined, candidate);
  }

  const ranked = [...combined.values()].toSorted((a, b) => b.match.score - a.match.score);
  const reservedLocal = params.localCandidates
    .toSorted((a, b) => b.match.score - a.match.score)
    .slice(0, Math.min(5, ASSET_ROUTER_TOP_K));
  const byId = new Map<string, AssetRouterCandidate>();
  for (const candidate of [...reservedLocal, ...ranked]) {
    if (!byId.has(candidate.match.id)) {
      byId.set(candidate.match.id, candidate);
    }
    if (byId.size >= ASSET_ROUTER_TOP_K) {
      break;
    }
  }
  return [...byId.values()];
}

function collectLocalAssetRouterCandidates(params: {
  bundle: AssetServerBundle;
  allowedKinds: Set<AssetServerKind>;
  searchQueries: string[];
}): AssetRouterCandidate[] {
  const byId = new Map<string, AssetRouterCandidate>();
  for (const kind of params.allowedKinds) {
    for (const item of params.bundle.byKind[kind] ?? []) {
      let best: { score: number; matchedTerms: string[] } | null = null;
      for (const query of params.searchQueries) {
        const scored = scoreAssetMatch(query, item);
        if (scored && (!best || scored.score > best.score)) {
          best = scored;
        }
      }
      if (!best) {
        continue;
      }
      const { content: _content, files: _files, ...meta } = item;
      upsertAssetRouterCandidate(byId, {
        source: "local",
        match: { ...meta, score: best.score, matchedTerms: best.matchedTerms },
      });
    }
  }
  return [...byId.values()].toSorted((a, b) => b.match.score - a.match.score);
}

async function collectClawHubAssetRouterCandidates(params: {
  searchQueries: string[];
  allowedKinds: Set<AssetServerKind>;
  limit: number;
}): Promise<AssetRouterCandidate[]> {
  if (!isTeamClawHubSkillsEnabled() || !params.allowedKinds.has("skills")) {
    return [];
  }
  const token = await resolveClawHubAuthToken();
  const byId = new Map<string, AssetRouterCandidate>();
  for (const query of params.searchQueries) {
    const results = await searchClawHubSkills({
      query,
      token,
      limit: Math.max(1, Math.min(CLAWHUB_SKILL_SEARCH_LIMIT, params.limit)),
    }).catch(() => []);
    for (const result of results) {
      const item = buildClawHubSkillManifestItem(result);
      upsertAssetRouterCandidate(byId, {
        source: "clawhub",
        match: {
          ...item,
          matchedTerms: [result.slug, ...topKeywordsFromText(item.title, item.summary)].slice(0, 8),
        },
      });
    }
  }
  return [...byId.values()].toSorted((a, b) => b.match.score - a.match.score);
}

async function rerankAssetRouterCandidates(params: {
  team: TeamState;
  query: string;
  candidates: AssetRouterCandidate[];
  limitPerKind: number;
}): Promise<{ needsAssets: boolean; selected: AssetRouterSelection[] }> {
  const cards = params.candidates.slice(0, ASSET_ROUTER_TOP_K).map((candidate, index) => ({
    index: index + 1,
    id: candidate.match.id,
    kind: candidate.match.kind,
    source: candidate.source,
    title: truncateAssetRouterText(candidate.match.title, 120),
    summary: truncateAssetRouterText(candidate.match.summary, 260),
    capabilities: candidate.match.capability.capabilities.slice(0, 8),
    tags: candidate.match.capability.tags.slice(0, 8),
    activationHints: candidate.match.capability.activationHints
      .map((hint) => truncateAssetRouterText(hint, 120))
      .slice(0, 4),
    retrievalScore: candidate.match.score,
  }));
  const systemPrompt = [
    "You are a fast reranker for team shared assets.",
    "Select only assets that materially help the user's current task.",
    "Prefer skills with directly relevant workflows or domain methods.",
    "Prefer local team assets over external hub assets when both are relevant, because local assets encode team-specific policy and orchestration.",
    "Return ONLY JSON. It is valid to select no assets.",
  ].join("\n");
  const userMessage = JSON.stringify(
    {
      task: params.query,
      maxPerKind: params.limitPerKind,
      candidates: cards,
      outputSchema: {
        needsAssets: "boolean",
        selected: [
          {
            id: "candidate id",
            confidence: "number from 0 to 1",
            reason: "short reason",
          },
        ],
      },
    },
    null,
    2,
  );
  const raw = await callTeamAssetRouterLlm({
    team: params.team,
    systemPrompt,
    userMessage,
    maxTokens: 520,
  });
  const parsed = parseAssetRouterJsonObject(raw);
  const selected = Array.isArray(parsed.selected)
    ? parsed.selected
        .map((entry): AssetRouterSelection | null => {
          if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
            return null;
          }
          const record = entry as Record<string, unknown>;
          const id = typeof record.id === "string" ? record.id.trim() : "";
          if (!id) {
            return null;
          }
          return {
            id,
            confidence: normalizeAssetRouterConfidence(record.confidence),
            reason: typeof record.reason === "string" ? record.reason.slice(0, 240) : undefined,
          };
        })
        .filter((entry): entry is AssetRouterSelection => Boolean(entry))
    : [];
  return {
    needsAssets: parsed.needsAssets === true || selected.length > 0,
    selected,
  };
}

function buildAssetRouterMatchesFromSelection(params: {
  allowedKinds: AssetServerKind[];
  candidates: AssetRouterCandidate[];
  selected: AssetRouterSelection[];
  limitPerKind: number;
}): Record<AssetServerKind, AssetServerResolveMatch[]> {
  const matches = createEmptyResolveMatches(params.allowedKinds);
  const byId = new Map(params.candidates.map((candidate) => [candidate.match.id, candidate]));
  const selectedSeen = new Set<string>();
  for (const selection of params.selected) {
    if (selectedSeen.has(selection.id)) {
      continue;
    }
    selectedSeen.add(selection.id);
    if (selection.confidence !== undefined && selection.confidence < ASSET_ROUTER_MIN_CONFIDENCE) {
      continue;
    }
    const candidate = byId.get(selection.id);
    if (!candidate) {
      continue;
    }
    const kind = candidate.match.kind;
    matches[kind] ??= [];
    if (matches[kind].length >= params.limitPerKind) {
      continue;
    }
    const confidenceScore =
      selection.confidence !== undefined ? Math.round(selection.confidence * 1000) : 0;
    matches[kind].push({
      ...candidate.match,
      score: Math.max(candidate.match.score, confidenceScore),
      matchedTerms: Array.from(new Set(["llm-router", ...candidate.match.matchedTerms])).slice(
        0,
        10,
      ),
    });
  }
  return matches;
}

async function resolveTeamAssetServerMatchesDynamicBySlug(
  slug: string,
  input: {
    query: string;
    kinds?: AssetServerKind[];
    limitPerKind?: number;
    fallbackQuery?: string;
  },
): Promise<AssetServerResolveResult> {
  const root = await readTeamsState();
  const team = findTeamBySlugOrThrow(root, slugifyTeamLabel(slug));
  const query = input.query.trim();
  const limitPerKind = input.limitPerKind ?? 2;
  const allowedKinds = resolveAllowedAssetKindsForTeam(team, input.kinds);
  const teamSummary = { slug: team.profile.slug, name: team.profile.name };
  const generatedAt = nowIso();
  if (!query || query.startsWith("/")) {
    return {
      team: teamSummary,
      generatedAt,
      query: input.query,
      matches: createEmptyResolveMatches(allowedKinds),
      debug: { routerMode: ASSET_ROUTER_MODE_DYNAMIC_LLM, needsAssets: false },
    };
  }

  const plan = await buildAssetRouterPlan({ team, query, allowedKinds });
  const strongSignalQueries = buildStrongSignalAssetRouterQueries(query);
  const shouldForceRetrieval = strongSignalQueries.length > 0;
  if (!plan.needsAssets && !shouldForceRetrieval) {
    return {
      team: teamSummary,
      generatedAt,
      query: input.query,
      matches: createEmptyResolveMatches(allowedKinds),
      debug: {
        routerMode: ASSET_ROUTER_MODE_DYNAMIC_LLM,
        needsAssets: false,
        searchQueries: [],
      },
    };
  }

  const searchQueries =
    plan.searchQueries.length > 0
      ? Array.from(new Set([...strongSignalQueries, ...plan.searchQueries])).slice(
          0,
          ASSET_ROUTER_DISCOVERY_QUERY_LIMIT,
        )
      : strongSignalQueries.length > 0
        ? strongSignalQueries
        : [query];
  const bundle = await buildAssetServerBundleForTeam(slug);
  const allowedKindSet = new Set(allowedKinds);
  const localCandidates = collectLocalAssetRouterCandidates({
    bundle,
    allowedKinds: allowedKindSet,
    searchQueries,
  });
  const clawHubCandidates = await collectClawHubAssetRouterCandidates({
    searchQueries,
    allowedKinds: allowedKindSet,
    limit: ASSET_ROUTER_TOP_K,
  });
  const candidates = rankAssetRouterCandidates({ localCandidates, clawHubCandidates });
  if (candidates.length === 0) {
    return {
      team: teamSummary,
      generatedAt,
      query: input.query,
      matches: createEmptyResolveMatches(allowedKinds),
      debug: {
        routerMode: ASSET_ROUTER_MODE_DYNAMIC_LLM,
        needsAssets: true,
        searchQueries,
        candidateCount: 0,
      },
    };
  }

  const rerank = await rerankAssetRouterCandidates({
    team,
    query,
    candidates,
    limitPerKind,
  });
  const matches = rerank.needsAssets
    ? buildAssetRouterMatchesFromSelection({
        allowedKinds,
        candidates,
        selected: rerank.selected,
        limitPerKind,
      })
    : createEmptyResolveMatches(allowedKinds);

  return {
    team: teamSummary,
    generatedAt,
    query: input.query,
    matches,
    debug: {
      routerMode: ASSET_ROUTER_MODE_DYNAMIC_LLM,
      needsAssets: rerank.needsAssets,
      searchQueries,
      candidateCount: candidates.length,
      selected: rerank.selected,
    },
  };
}

async function resolveTeamAssetServerMatchesLexicalBySlug(
  slug: string,
  input: { query: string; kinds?: AssetServerKind[]; limitPerKind?: number },
): Promise<AssetServerResolveResult> {
  const bundle = await buildAssetServerBundleForTeam(slug);
  const limitPerKind = input.limitPerKind ?? 2;
  const allowedKinds = resolveAllowedAssetKinds(bundle, input.kinds);
  const matches = createEmptyResolveMatches(allowedKinds);
  for (const kind of allowedKinds) {
    matches[kind] ??= [];
    for (const item of bundle.byKind[kind] ?? []) {
      const scored = scoreAssetMatch(input.query, item);
      if (scored) {
        const { content: _content, files: _files, ...meta } = item;
        matches[kind].push({ ...meta, score: scored.score, matchedTerms: scored.matchedTerms });
      }
    }
    matches[kind] = matches[kind].toSorted((a, b) => b.score - a.score).slice(0, limitPerKind);
  }
  if (allowedKinds.includes("skills")) {
    const clawHubMatches = await resolveClawHubSkillMatches(input.query);
    if (clawHubMatches.length > 0) {
      matches.skills ??= [];
      matches.skills = [...matches.skills, ...clawHubMatches]
        .toSorted((a, b) => b.score - a.score)
        .slice(0, limitPerKind);
    }
  }
  return { team: bundle.team, generatedAt: bundle.generatedAt, query: input.query, matches };
}

export async function resolveTeamAssetServerMatchesBySlug(
  slug: string,
  input: {
    query: string;
    kinds?: AssetServerKind[];
    limitPerKind?: number;
    fallbackQuery?: string;
  },
): Promise<AssetServerResolveResult> {
  const mode = resolveAssetRouterMode();
  if (mode === ASSET_ROUTER_MODE_LEXICAL) {
    return await resolveTeamAssetServerMatchesLexicalBySlug(slug, input);
  }
  try {
    return await resolveTeamAssetServerMatchesDynamicBySlug(slug, input);
  } catch (err) {
    const fallback = await resolveTeamAssetServerMatchesLexicalBySlug(slug, {
      ...input,
      query: input.fallbackQuery?.trim() || input.query,
    });
    return {
      ...fallback,
      query: input.query,
      debug: {
        ...fallback.debug,
        routerMode: ASSET_ROUTER_MODE_DYNAMIC_LLM,
        fallback: true,
        fallbackReason:
          err instanceof Error ? err.message.slice(0, 500) : String(err).slice(0, 500),
      },
    };
  }
}

// ============ Heartbeat ============

const heartbeatStore = new Map<string, MemberHeartbeat>();

export function receiveMemberHeartbeat(
  teamSlugRaw: string,
  memberIdRaw: string,
  payload: Partial<MemberHeartbeat>,
): MemberHeartbeat {
  const teamSlug = slugifyTeamLabel(teamSlugRaw);
  const memberId = validateMemberId(memberIdRaw);
  const hb: MemberHeartbeat = {
    memberId,
    teamSlug,
    timestamp: nowIso(),
    status: payload.status ?? "alive",
    quotaUsage: payload.quotaUsage,
    runtimeVersion: payload.runtimeVersion,
    uptime: payload.uptime,
  };
  heartbeatStore.set(`${teamSlug}:${memberId}`, hb);
  return hb;
}

export function getMemberHeartbeat(teamSlug: string, memberId: string): MemberHeartbeat | null {
  return heartbeatStore.get(`${teamSlug}:${memberId}`) ?? null;
}

export function getTeamHeartbeats(teamSlugRaw: string): MemberHeartbeat[] {
  const slug = slugifyTeamLabel(teamSlugRaw);
  const out: MemberHeartbeat[] = [];
  for (const [key, hb] of heartbeatStore) {
    if (key.startsWith(`${slug}:`)) {
      out.push(hb);
    }
  }
  return out;
}

export function isMemberHeartbeatStale(hb: MemberHeartbeat): boolean {
  return Date.now() - new Date(hb.timestamp).getTime() > HEARTBEAT_STALE_MS;
}

// ============ Evolution Engine ============

function defaultEvolutionState(): EvolutionState {
  return { lastRunAt: null, lastDigest: null, totalRuns: 0, totalAssetsGenerated: 0, history: [] };
}

export async function getEvolutionState(slug: string): Promise<EvolutionState> {
  const statePath = path.join(EVOLUTION_STATE_DIR, `${slugifyTeamLabel(slug)}.json`);
  try {
    return JSON.parse(await readText(statePath)) as EvolutionState;
  } catch {
    return defaultEvolutionState();
  }
}

async function writeEvolutionState(slug: string, state: EvolutionState) {
  await writeText(path.join(EVOLUTION_STATE_DIR, `${slug}.json`), JSON.stringify(state, null, 2));
}

function truncateDigestText(value: string, maxChars = 180): string {
  const trimmed = value.trim().replace(/\s+/g, " ");
  if (!trimmed) {
    return "";
  }
  return trimmed.length > maxChars ? `${trimmed.slice(0, maxChars - 1)}…` : trimmed;
}

function extractTextFromSessionJsonlEntry(entry: unknown): string {
  const message = (entry as { message?: unknown } | null | undefined)?.message;
  if (!message || typeof message !== "object") {
    return "";
  }
  const rawContent = (message as { content?: unknown }).content;
  const content: unknown[] = Array.isArray(rawContent) ? rawContent : [];
  const textParts = content
    .filter(
      (block): block is { type: string; text: string } =>
        !!block &&
        typeof block === "object" &&
        (block as { type?: unknown }).type === "text" &&
        typeof (block as { text?: unknown }).text === "string",
    )
    .map((block) => block.text);
  return truncateDigestText(textParts.join(" "));
}

async function extractTranscriptDigestFallback(sessionFilePath: string): Promise<{
  topic?: string;
  summary?: string;
}> {
  try {
    const raw = await readText(sessionFilePath);
    const lines = raw.split("\n").filter(Boolean);
    let topic = "";
    let summary = "";
    for (const line of lines) {
      let parsed: unknown;
      try {
        parsed = JSON.parse(line);
      } catch {
        continue;
      }
      const parsedObj = parsed as { type?: unknown; message?: { role?: unknown } } | null;
      if (!topic && parsedObj?.type === "message" && parsedObj?.message?.role === "user") {
        topic = extractTextFromSessionJsonlEntry(parsed);
      }
      if (!summary && parsedObj?.type === "message" && parsedObj?.message?.role === "assistant") {
        summary = extractTextFromSessionJsonlEntry(parsed);
      }
      if (topic && summary) {
        break;
      }
    }
    return {
      ...(topic ? { topic } : {}),
      ...(summary ? { summary } : {}),
    };
  } catch {
    return {};
  }
}

export async function collectMemberSessionDigests(slug: string): Promise<EvolutionDigest> {
  const teamSlug = slugifyTeamLabel(slug);
  const evoState = await getEvolutionState(teamSlug);
  const lastRunMs = evoState.lastRunAt ? new Date(evoState.lastRunAt).getTime() : 0;
  const members = await getMembersForTeam(teamSlug);

  const topics: string[] = [];
  const summaries: string[] = [];
  let totalSessions = 0,
    totalTokens = 0,
    memberCount = 0;

  for (const m of members) {
    const sessionsPath = path.join(
      memberRoot(teamSlug, m.id),
      "runtime",
      "config",
      "agents",
      "main",
      "sessions",
      "sessions.json",
    );
    if (!(await fileExists(sessionsPath))) {
      continue;
    }
    let sessions: Record<string, unknown>;
    try {
      sessions = JSON.parse(await readText(sessionsPath)) as Record<string, unknown>;
    } catch {
      continue;
    }

    let contributed = false;
    for (const rawEntry of Object.values(sessions)) {
      if (!rawEntry || typeof rawEntry !== "object") {
        continue;
      }
      const entry = rawEntry as Record<string, unknown>;
      const updatedAt = Number(entry.updatedAt || 0);
      if (updatedAt <= lastRunMs) {
        continue;
      }
      contributed = true;
      totalSessions++;
      totalTokens += Number(entry.inputTokens || 0) + Number(entry.outputTokens || 0);
      const titleCandidate =
        (typeof entry.derivedTitle === "string" && entry.derivedTitle) ||
        (typeof entry.displayName === "string" && entry.displayName) ||
        (typeof entry.subject === "string" && entry.subject) ||
        "";
      const title = titleCandidate.trim();
      const sessionId = typeof entry.sessionId === "string" ? entry.sessionId.trim() : "";
      let fallbackTopic = "";
      let fallbackSummary = "";
      if ((!title || !Array.isArray(entry.compactionCheckpoints)) && sessionId) {
        const fallback = await extractTranscriptDigestFallback(
          path.join(
            memberRoot(teamSlug, m.id),
            "runtime",
            "config",
            "agents",
            "main",
            "sessions",
            `${sessionId}.jsonl`,
          ),
        );
        fallbackTopic = fallback.topic ?? "";
        fallbackSummary = fallback.summary ?? "";
      }
      const effectiveTopic = title || fallbackTopic;
      if (effectiveTopic && !topics.includes(effectiveTopic)) {
        topics.push(effectiveTopic);
      }
      const cps: unknown[] = Array.isArray(entry.compactionCheckpoints)
        ? entry.compactionCheckpoints
        : [];
      for (const cp of cps) {
        if (
          cp &&
          typeof cp === "object" &&
          typeof (cp as { summary?: unknown }).summary === "string" &&
          (cp as { summary: string }).summary.trim()
        ) {
          summaries.push((cp as { summary: string }).summary.trim());
        }
      }
      if (fallbackSummary) {
        summaries.push(fallbackSummary);
      }
    }
    if (contributed) {
      memberCount++;
    }
  }

  return {
    topics,
    summaries: summaries.slice(0, 50),
    totalSessions,
    totalTokens,
    collectedAt: nowIso(),
    memberCount,
  };
}

async function callTeamLlm(
  slug: string,
  systemPrompt: string,
  userMessage: string,
): Promise<string> {
  const root = await readTeamsState();
  const team = findTeamBySlugOrThrow(root, slug);
  const gateway = team.modelGateway;
  if (!gateway.enabled) {
    throw new HttpError(503, "team model gateway disabled");
  }

  const upstream = await resolveTeamModelGatewayUpstream(gateway);
  const requestBody = {
    model: upstream.mapRequestedModel?.(gateway.defaultModelId) ?? gateway.defaultModelId,
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userMessage },
    ],
    temperature: 0.3,
    max_tokens: 4096,
  };

  try {
    const response = await fetch(`${upstream.baseUrl.replace(/\/+$/, "")}/chat/completions`, {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        ...upstream.headers,
      },
      body: JSON.stringify(requestBody),
    });
    const raw = await response.text();
    if (!response.ok) {
      throw new Error(raw || `${response.status} ${response.statusText}`);
    }
    const res = JSON.parse(raw) as { choices?: { message?: { content?: string } }[] };
    return res.choices?.[0]?.message?.content?.trim() || "";
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new HttpError(502, `LLM call failed: ${msg}`);
  }
}

function normalizeForDedup(title: string): string {
  return title
    .replace(/^\[Auto\]\s*/i, "")
    .trim()
    .toLowerCase();
}

export async function synthesizeEvolutionAssets(
  slug: string,
  digest: EvolutionDigest,
): Promise<EvolutionResult> {
  const teamSlug = slugifyTeamLabel(slug);
  const triggeredAt = nowIso();
  if (digest.topics.length === 0 && digest.summaries.length === 0) {
    return {
      teamSlug,
      triggeredAt,
      digest,
      generatedAssets: [],
      skipped: true,
      skipReason: "empty digest",
    };
  }

  const root = await readTeamsState();
  const team = findTeamBySlugOrThrow(root, teamSlug);
  const existingTitles = new Set(team.assets.map((a) => normalizeForDedup(a.title)));
  const existingAuto = team.assets
    .filter((a) => a.submittedBy === EVOLUTION_SYSTEM_ACTOR)
    .map((a) => `- ${a.title.replace(/^\[Auto\]\s*/, "")}`)
    .slice(0, 30);

  const systemPrompt = `You are a team knowledge management system. Extract reusable knowledge from anonymized session summaries.
Rules:
- Never include personally identifying info
- Output knowledge items separated by ---
- Each item starts with [MEMORY] or [SKILL]
- Second line is the title, remaining lines are content
- If nothing new, output [NONE]`;

  const existingSection = existingAuto.length
    ? `\n\nAlready generated (do not repeat):\n${existingAuto.join("\n")}`
    : "";
  const userMessage = `Session topics (${digest.topics.length}):\n${digest.topics.map((t) => `- ${t}`).join("\n")}\n\nSummaries (${digest.summaries.length}):\n${digest.summaries.map((s) => `- ${s}`).join("\n")}\n\nStats: ${digest.totalSessions} sessions, ${digest.memberCount} members.${existingSection}`;

  let output: string;
  try {
    output = await callTeamLlm(teamSlug, systemPrompt, userMessage);
  } catch (e) {
    return {
      teamSlug,
      triggeredAt,
      digest,
      generatedAssets: [],
      skipped: true,
      skipReason: `LLM error: ${e instanceof Error ? e.message : String(e)}`,
    };
  }

  if (!output.trim() || output.trim() === "[NONE]") {
    return {
      teamSlug,
      triggeredAt,
      digest,
      generatedAssets: [],
      skipped: true,
      skipReason: output.trim() === "[NONE]" ? "no new knowledge" : "LLM returned empty",
    };
  }

  const blocks = output
    .split(/^---$/m)
    .map((b) => b.trim())
    .filter(Boolean);
  const generated: EvolutionResult["generatedAssets"] = [];

  for (const block of blocks) {
    const lines = block.split("\n");
    const typeMatch = lines[0]?.match(/^\[(MEMORY|SKILL)\]$/);
    if (!typeMatch) {
      continue;
    }
    const title = lines[1]?.trim();
    const content = lines.slice(2).join("\n").trim();
    if (!title || !content) {
      continue;
    }
    if (existingTitles.has(normalizeForDedup(title))) {
      continue;
    }

    const category: TeamAssetCategory =
      typeMatch[1] === "SKILL" ? "shared-skills" : "shared-memory";
    try {
      const r = await createTeamAssetProposal({
        teamSlug,
        category,
        title: `[Auto] ${title}`,
        content,
        capabilityRole: typeMatch[1] === "SKILL" ? "instruction" : "knowledge",
        consumptionMode: typeMatch[1] === "SKILL" ? "skill" : "retrieval",
        submittedByMemberId: EVOLUTION_SYSTEM_ACTOR,
        sourceZone: "collab",
        note: `Auto-generated by evolution engine at ${triggeredAt}`,
      });
      generated.push({ id: r.asset.id, category, title });
      existingTitles.add(normalizeForDedup(title));
    } catch {}
  }

  return { teamSlug, triggeredAt, digest, generatedAssets: generated, skipped: false };
}

export async function runTeamEvolution(
  slug: string,
  options?: { force?: boolean },
): Promise<EvolutionResult> {
  const teamSlug = slugifyTeamLabel(slug);
  const root = await readTeamsState();
  const team = findTeamBySlugOrThrow(root, teamSlug);
  const config = team.evolution ?? defaultEvolutionConfig();
  const triggeredAt = nowIso();

  if (!config.enabled && !options?.force) {
    return {
      teamSlug,
      triggeredAt,
      digest: {
        topics: [],
        summaries: [],
        totalSessions: 0,
        totalTokens: 0,
        collectedAt: triggeredAt,
        memberCount: 0,
      },
      generatedAssets: [],
      skipped: true,
      skipReason: "evolution disabled",
    };
  }

  const evoState = await getEvolutionState(teamSlug);
  if (!options?.force && evoState.lastRunAt) {
    const elapsed = Date.now() - new Date(evoState.lastRunAt).getTime();
    if (elapsed < config.intervalMs) {
      return {
        teamSlug,
        triggeredAt,
        digest: {
          topics: [],
          summaries: [],
          totalSessions: 0,
          totalTokens: 0,
          collectedAt: triggeredAt,
          memberCount: 0,
        },
        generatedAssets: [],
        skipped: true,
        skipReason: `interval not reached`,
      };
    }
  }

  const digest = await collectMemberSessionDigests(teamSlug);
  if (!options?.force && digest.totalSessions < config.minSessionsToTrigger) {
    return {
      teamSlug,
      triggeredAt,
      digest,
      generatedAssets: [],
      skipped: true,
      skipReason: `not enough sessions`,
    };
  }

  const result = await synthesizeEvolutionAssets(teamSlug, digest);
  evoState.lastRunAt = triggeredAt;
  evoState.lastDigest = digest;
  evoState.totalRuns++;
  evoState.totalAssetsGenerated += result.generatedAssets.length;
  evoState.history.push({ runAt: triggeredAt, assetsGenerated: result.generatedAssets.length });
  if (evoState.history.length > 100) {
    evoState.history = evoState.history.slice(-100);
  }
  await writeEvolutionState(teamSlug, evoState);
  return result;
}

export async function updateTeamEvolutionConfig(
  slug: string,
  input: Partial<EvolutionConfig>,
): Promise<EvolutionConfig> {
  const teamSlug = slugifyTeamLabel(slug);
  return mutateNamedTeamState(teamSlug, async (state) => {
    const current = state.evolution ?? defaultEvolutionConfig();
    state.evolution = {
      enabled: input.enabled ?? current.enabled,
      intervalMs: input.intervalMs ?? current.intervalMs,
      minSessionsToTrigger: input.minSessionsToTrigger ?? current.minSessionsToTrigger,
      maxDigestSummaries: input.maxDigestSummaries ?? current.maxDigestSummaries,
      autoPublish: input.autoPublish ?? current.autoPublish,
    };
    return state.evolution;
  });
}

// ============ Runtime Actions ============

function buildMemberRuntimeComposeArgs(
  composePath: string,
  action: "start" | "stop" | "restart",
): string[] {
  const args = ["compose", "-f", composePath, action === "start" ? "up" : action];
  if (action === "start") {
    args.push("-d");
  }
  return args;
}

function formatRuntimeActionError(label: string, err: unknown): string {
  if (err instanceof Error && err.message.trim()) {
    return `${label}: ${err.message.trim()}`;
  }
  return `${label}: ${String(err)}`;
}

async function runDockerComposeForMemberRuntime(
  runtimeDir: string,
  composePath: string,
  action: "start" | "stop" | "restart",
): Promise<{ stdout: string; stderr: string }> {
  const composeArgs = buildMemberRuntimeComposeArgs(composePath, action);
  const failures: string[] = [];

  try {
    return await execFileAsync("docker", composeArgs, { cwd: runtimeDir });
  } catch (error) {
    failures.push(formatRuntimeActionError("docker compose", error));
  }

  try {
    return await execFileAsync("sudo", ["-n", "docker", ...composeArgs], { cwd: runtimeDir });
  } catch (error) {
    failures.push(formatRuntimeActionError("sudo -n docker compose", error));
  }

  throw new Error(
    `${failures.join(" | ")} | runtime control requires either direct docker access or passwordless sudo for docker compose`,
  );
}

export async function runMemberRuntimeActionForTeam(
  teamSlugRaw: string,
  memberIdRaw: string,
  action: "start" | "stop" | "restart",
) {
  const teamSlug = slugifyTeamLabel(teamSlugRaw);
  const memberId = validateMemberId(memberIdRaw);
  const runtimeDir = path.join(memberRoot(teamSlug, memberId), "runtime");
  const composePath = path.join(runtimeDir, "docker-compose.yml");
  if (!(await fileExists(composePath))) {
    throw new HttpError(404, `compose missing: ${memberId}`);
  }

  try {
    const { stdout, stderr } = await runDockerComposeForMemberRuntime(
      runtimeDir,
      composePath,
      action,
    );
    void appendAuditEntry({
      ts: nowIso(),
      event: "member.runtime.action",
      actor: "operator",
      teamSlug,
      resourceType: "runtime",
      resourceId: memberId,
      detail: `Runtime ${action}: success`,
    });
    return { memberId, action, ok: true, stdout: stdout.trim(), stderr: stderr.trim() };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    void appendAuditEntry({
      ts: nowIso(),
      event: "member.runtime.action",
      actor: "operator",
      teamSlug,
      resourceType: "runtime",
      resourceId: memberId,
      detail: `Runtime ${action}: failed — ${msg}`,
    });
    return { memberId, action, ok: false, stdout: "", stderr: msg };
  }
}

export async function batchMemberRuntimeAction(
  teamSlugRaw: string,
  action: "start" | "stop" | "restart",
) {
  const teamSlug = slugifyTeamLabel(teamSlugRaw);
  const members = await getMembersForTeam(teamSlug);
  const results = await Promise.allSettled(
    members.map((m) => runMemberRuntimeActionForTeam(teamSlug, m.id, action)),
  );
  return results
    .filter(
      (r): r is PromiseFulfilledResult<Awaited<ReturnType<typeof runMemberRuntimeActionForTeam>>> =>
        r.status === "fulfilled",
    )
    .map((r) => r.value);
}

// ============ Backup / Restore ============

export async function createTeamBackup(
  slug: string,
  outputPath?: string,
): Promise<TeamBackupResult> {
  const teamSlug = slugifyTeamLabel(slug);
  const root = await readTeamsState();
  const team = findTeamBySlugOrThrow(root, teamSlug);
  const members = await getMembersForTeam(teamSlug);

  const timestamp = new Date()
    .toISOString()
    .replace(/[-:]/g, "")
    .replace(/\.\d{3}Z$/, "Z");
  const archiveDir = path.join(ROOT, "artifacts");
  await fs.mkdir(archiveDir, { recursive: true });
  const archivePath = outputPath
    ? path.resolve(outputPath)
    : path.join(archiveDir, `${teamSlug}-backup-${timestamp}.tar.gz`);

  const tmpDir = path.join(archiveDir, `.backup-tmp-${crypto.randomUUID().slice(0, 8)}`);
  await fs.mkdir(tmpDir, { recursive: true });

  try {
    const manifest: TeamBackupManifest = {
      schemaVersion: 1,
      createdAt: nowIso(),
      teamSlug,
      teamName: team.profile.name,
      memberCount: members.length,
      assetCount: team.assets.length,
    };
    await writeText(path.join(tmpDir, "manifest.json"), JSON.stringify(manifest, null, 2));
    await writeText(path.join(tmpDir, "team-state.json"), JSON.stringify(team, null, 2));

    const membersSrc = teamMembersRoot(teamSlug);
    if (await fileExists(membersSrc)) {
      await fs.cp(membersSrc, path.join(tmpDir, "members"), { recursive: true });
    }
    const assetsSrc = path.join(ROOT, "teams", teamSlug);
    if (await fileExists(assetsSrc)) {
      await fs.cp(assetsSrc, path.join(tmpDir, "teams", teamSlug), { recursive: true });
    }
    const auditFile = path.join(AUDIT_DIR, `${teamSlug}.jsonl`);
    if (await fileExists(auditFile)) {
      await fs.copyFile(auditFile, path.join(tmpDir, "audit.jsonl"));
    }

    await execFileAsync("tar", ["czf", archivePath, "-C", tmpDir, "."]);
    return { archivePath, manifest };
  } finally {
    await fs.rm(tmpDir, { recursive: true, force: true });
  }
}

export async function restoreTeamBackup(
  archivePath: string,
  options?: { force?: boolean },
): Promise<TeamRestoreResult> {
  const resolved = path.resolve(archivePath);
  if (!(await fileExists(resolved))) {
    throw new HttpError(404, `archive not found: ${resolved}`);
  }

  const tmpDir = path.join(ROOT, "artifacts", `.restore-tmp-${crypto.randomUUID().slice(0, 8)}`);
  await fs.mkdir(tmpDir, { recursive: true });

  try {
    await execFileAsync("tar", ["xzf", resolved, "-C", tmpDir]);
    const manifest = JSON.parse(
      await readText(path.join(tmpDir, "manifest.json")),
    ) as TeamBackupManifest;
    if (manifest.schemaVersion !== 1) {
      throw new HttpError(400, `unsupported schema: ${String(manifest.schemaVersion)}`);
    }
    const teamSlug = manifest.teamSlug;

    const state = await readTeamsState();
    const existing = state.teams.find((t) => t.profile.slug === teamSlug);
    if (existing && !options?.force) {
      throw new HttpError(409, `team exists: ${teamSlug}. Use --force.`);
    }

    const restoredTeam = JSON.parse(
      await readText(path.join(tmpDir, "team-state.json")),
    ) as TeamState;

    let membersRestored = 0;
    const membersSrc = path.join(tmpDir, "members");
    if (await fileExists(membersSrc)) {
      const dest = teamMembersRoot(teamSlug);
      await fs.mkdir(path.dirname(dest), { recursive: true });
      await fs.cp(membersSrc, dest, { recursive: true, force: true });
      const entries = await fs.readdir(dest, { withFileTypes: true });
      membersRestored = entries.filter(
        (e) => e.isDirectory() && e.name !== MEMBER_TEMPLATE_ID,
      ).length;
    }

    const assetsSrc = path.join(tmpDir, "teams", teamSlug);
    if (await fileExists(assetsSrc)) {
      const dest = path.join(ROOT, "teams", teamSlug);
      await fs.mkdir(path.dirname(dest), { recursive: true });
      await fs.cp(assetsSrc, dest, { recursive: true, force: true });
    }

    const auditSrc = path.join(tmpDir, "audit.jsonl");
    if (await fileExists(auditSrc)) {
      await fs.mkdir(AUDIT_DIR, { recursive: true });
      await fs.copyFile(auditSrc, path.join(AUDIT_DIR, `${teamSlug}.jsonl`));
    }

    await mutateTeamsState(async (s) => {
      s.teams = s.teams.filter((t) => t.profile.slug !== teamSlug);
      s.teams.push(restoredTeam);
      return null;
    });

    await backfillTeamAssetItemStoreBySlug(teamSlug);
    await rebuildTeamAssetProjectionsBySlug(teamSlug);

    return { teamSlug, membersRestored, assetsRestored: restoredTeam.assets.length, warnings: [] };
  } finally {
    await fs.rm(tmpDir, { recursive: true, force: true });
  }
}
