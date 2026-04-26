import crypto from "node:crypto";
import fs from "node:fs";
import fsp from "node:fs/promises";
import net from "node:net";
import path from "node:path";
import { resolveConfigPath, resolveStateDir } from "../config/paths.js";
import { resolveVelaclawPackageRootSync } from "../infra/velaclaw-root.js";

const SCAFFOLD_DIRS = [
  "members/member-template/runtime/config/local-plugins",
  "members/member-template/runtime/secrets",
  "members/member-template/runtime/workspace",
  "members/member-template/private-memory",
  "members/member-template/private-skills",
  "members/member-template/private-tools",
  "members/member-template/private-docs",
  "services/litellm",
  "state",
  "state/audit",
  "state/evolution",
  "teams",
  "shared-snapshots",
  "team-assets/shared-memory",
  "team-assets/shared-skills",
  "team-assets/shared-tools",
  "team-assets/shared-workflows",
  "team-assets/shared-docs",
  "team-assets/policies",
  "artifacts",
] as const;

const TEAM_MEMBER_AGENTS_TEMPLATE_FILENAME = "AGENTS.team-member.md";
const DEFAULT_CONTROL_PLANE_PORT = 4318;
const DEFAULT_CONTROL_PLANE_HOST = "host.docker.internal";

const DEFAULT_MANAGER_MODEL_ID = process.env.VELACLAW_MANAGER_DEFAULT_MODEL_ID?.trim() || "gpt-5.4";

type MutableJsonObject = Record<string, unknown>;

export type VelaclawControlPlaneState = {
  version: 1;
  workspaceRoot: string;
  port: number;
  listenBaseUrl: string;
  memberBaseUrl: string;
  updatedAt: string;
};

type CodexEnvironment = {
  mode: "oauth" | "apikey" | "none";
  apiKey?: string;
  baseUrl?: string;
  model?: string;
};

function resolveCodexHome(env: NodeJS.ProcessEnv): string {
  const explicit = env.CODEX_HOME?.trim();
  if (explicit) {
    return explicit;
  }
  const home = env.HOME?.trim() || process.env.HOME || "";
  return home ? path.join(home, ".codex") : "";
}

function readCodexAuthMode(codexHome: string): {
  mode: "oauth" | "apikey" | "none";
  apiKey?: string;
} {
  if (!codexHome) {
    return { mode: "none" };
  }
  const authPath = path.join(codexHome, "auth.json");
  try {
    const raw = fs.readFileSync(authPath, "utf8");
    const data = JSON.parse(raw) as Record<string, unknown>;
    const tokens = data?.tokens as Record<string, unknown> | undefined;
    if (tokens && typeof tokens.access_token === "string" && tokens.access_token.trim()) {
      return { mode: "oauth" };
    }
    const key = data?.OPENAI_API_KEY;
    if (typeof key === "string" && key.trim()) {
      return { mode: "apikey", apiKey: key.trim() };
    }
  } catch {
    // auth.json missing or unreadable — treat as "none"
  }
  return { mode: "none" };
}

function readCodexConfigToml(codexHome: string): { baseUrl?: string; model?: string } {
  if (!codexHome) {
    return {};
  }
  const configPath = path.join(codexHome, "config.toml");
  try {
    const raw = fs.readFileSync(configPath, "utf8");
    const topSection = raw.split(/^\s*\[/m, 1)[0] ?? "";
    const modelMatch = topSection.match(/^\s*model\s*=\s*"([^"]+)"/m);
    const model = modelMatch?.[1]?.trim();
    const baseUrlMatch = raw.match(
      /\[model_providers\.[^\]]+\][^[]*?\n\s*base_url\s*=\s*"([^"]+)"/m,
    );
    const baseUrl = baseUrlMatch?.[1]?.trim();
    return { model, baseUrl };
  } catch {
    return {};
  }
}

function detectCodexEnvironment(env: NodeJS.ProcessEnv): CodexEnvironment {
  const codexHome = resolveCodexHome(env);
  const auth = readCodexAuthMode(codexHome);
  const config = readCodexConfigToml(codexHome);
  if (auth.mode === "none") {
    const envApiKey = env.OPENAI_API_KEY?.trim();
    if (envApiKey) {
      return {
        mode: "apikey",
        apiKey: envApiKey,
        baseUrl: env.OPENAI_BASE_URL?.trim() || config.baseUrl,
        model: config.model,
      };
    }
  }
  return { mode: auth.mode, apiKey: auth.apiKey, baseUrl: config.baseUrl, model: config.model };
}

export function resolveVelaclawPackageRoot(): string {
  return (
    resolveVelaclawPackageRootSync({
      moduleUrl: import.meta.url,
      argv1: process.argv[1],
      cwd: process.cwd(),
    }) ?? process.cwd()
  );
}

export function resolveManagedVelaclawRoot(env: NodeJS.ProcessEnv = process.env): string {
  return path.join(resolveStateDir(env), "team-control");
}

export function resolveActiveVelaclawRoot(
  rootOverride?: string,
  env: NodeJS.ProcessEnv = process.env,
): string {
  return path.resolve(rootOverride || env.VELACLAW_ROOT?.trim() || resolveManagedVelaclawRoot(env));
}

export function getVelaclawControlPlaneStatePath(root: string): string {
  return path.join(root, "state", "control-plane.json");
}

function normalizeControlPlanePort(value: string | number | undefined | null): number | null {
  const port = typeof value === "number" ? value : Number((value ?? "").trim());
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    return null;
  }
  return port;
}

function resolveRequestedControlPlanePort(
  env: NodeJS.ProcessEnv = process.env,
  explicitPort?: number,
): number | null {
  return (
    normalizeControlPlanePort(explicitPort) ??
    normalizeControlPlanePort(env.VELACLAW_CONTROL_PORT) ??
    normalizeControlPlanePort(env.PORT)
  );
}

function resolveMemberControlBaseUrl(port: number, env: NodeJS.ProcessEnv = process.env): string {
  const explicit = env.VELACLAW_TEAM_CONTROL_BASE_URL?.trim();
  if (explicit) {
    return explicit.replace(/\/+$/, "");
  }
  const host = env.VELACLAW_TEAM_CONTROL_HOST?.trim() || DEFAULT_CONTROL_PLANE_HOST;
  return `http://${host}:${port}`;
}

function buildVelaclawControlPlaneState(
  root: string,
  port: number,
  env: NodeJS.ProcessEnv = process.env,
): VelaclawControlPlaneState {
  return {
    version: 1,
    workspaceRoot: path.resolve(root),
    port,
    listenBaseUrl: `http://127.0.0.1:${port}`,
    memberBaseUrl: resolveMemberControlBaseUrl(port, env),
    updatedAt: new Date().toISOString(),
  };
}

function normalizeVelaclawControlPlaneState(raw: unknown): VelaclawControlPlaneState | null {
  if (!raw || typeof raw !== "object") {
    return null;
  }
  const record = raw as Record<string, unknown>;
  const port = normalizeControlPlanePort(
    typeof record.port === "number" || typeof record.port === "string" ? record.port : undefined,
  );
  const workspaceRoot =
    typeof record.workspaceRoot === "string" && record.workspaceRoot.trim()
      ? path.resolve(record.workspaceRoot)
      : "";
  const listenBaseUrl =
    typeof record.listenBaseUrl === "string" && record.listenBaseUrl.trim()
      ? record.listenBaseUrl.trim().replace(/\/+$/, "")
      : "";
  const memberBaseUrl =
    typeof record.memberBaseUrl === "string" && record.memberBaseUrl.trim()
      ? record.memberBaseUrl.trim().replace(/\/+$/, "")
      : "";
  const updatedAt =
    typeof record.updatedAt === "string" && record.updatedAt.trim() ? record.updatedAt.trim() : "";
  if (!port || !workspaceRoot || !listenBaseUrl || !memberBaseUrl || !updatedAt) {
    return null;
  }
  return {
    version: 1,
    workspaceRoot,
    port,
    listenBaseUrl,
    memberBaseUrl,
    updatedAt,
  };
}

export function readVelaclawControlPlaneStateSync(root: string): VelaclawControlPlaneState | null {
  try {
    const raw = fs.readFileSync(getVelaclawControlPlaneStatePath(root), "utf8");
    return normalizeVelaclawControlPlaneState(JSON.parse(raw));
  } catch {
    return null;
  }
}

export async function readVelaclawControlPlaneState(
  root: string,
): Promise<VelaclawControlPlaneState | null> {
  try {
    const raw = await fsp.readFile(getVelaclawControlPlaneStatePath(root), "utf8");
    return normalizeVelaclawControlPlaneState(JSON.parse(raw));
  } catch {
    return null;
  }
}

async function writeVelaclawControlPlaneState(
  root: string,
  state: VelaclawControlPlaneState,
): Promise<void> {
  const statePath = getVelaclawControlPlaneStatePath(root);
  await fsp.mkdir(path.dirname(statePath), { recursive: true });
  await fsp.writeFile(statePath, `${JSON.stringify(state, null, 2)}\n`, "utf8");
}

async function isLoopbackPortAvailable(port: number): Promise<boolean> {
  return await new Promise<boolean>((resolve, reject) => {
    const server = net.createServer();
    server.unref();
    server.once("error", (error) => {
      const code = (error as NodeJS.ErrnoException).code;
      if (code === "EADDRINUSE" || code === "EACCES") {
        resolve(false);
        return;
      }
      reject(error);
    });
    server.listen(port, "127.0.0.1", () => {
      server.close((error) => {
        if (error) {
          reject(error);
          return;
        }
        resolve(true);
      });
    });
  });
}

async function findAvailableControlPlanePort(
  startPort = DEFAULT_CONTROL_PLANE_PORT,
): Promise<number> {
  let port = startPort;
  while (port <= 65535) {
    if (await isLoopbackPortAvailable(port)) {
      return port;
    }
    port++;
  }
  throw new Error("No available control-plane port found");
}

export async function ensureVelaclawControlPlaneStateInitialized(
  root: string,
  env: NodeJS.ProcessEnv = process.env,
): Promise<VelaclawControlPlaneState> {
  const existing = await readVelaclawControlPlaneState(root);
  if (existing) {
    return existing;
  }
  const requestedPort = resolveRequestedControlPlanePort(env);
  const port = requestedPort ?? (await findAvailableControlPlanePort(DEFAULT_CONTROL_PLANE_PORT));
  const state = buildVelaclawControlPlaneState(root, port, env);
  await writeVelaclawControlPlaneState(root, state);
  return state;
}

export async function updateVelaclawControlPlaneState(
  root: string,
  params?: { port?: number; env?: NodeJS.ProcessEnv },
): Promise<VelaclawControlPlaneState> {
  const env = params?.env ?? process.env;
  const existing = await ensureVelaclawControlPlaneStateInitialized(root, env);
  const nextPort =
    normalizeControlPlanePort(params?.port) ??
    resolveRequestedControlPlanePort(env) ??
    existing.port;
  const nextState = buildVelaclawControlPlaneState(root, nextPort, env);
  if (
    existing.port !== nextState.port ||
    existing.listenBaseUrl !== nextState.listenBaseUrl ||
    existing.memberBaseUrl !== nextState.memberBaseUrl ||
    existing.workspaceRoot !== nextState.workspaceRoot
  ) {
    await writeVelaclawControlPlaneState(root, nextState);
    return nextState;
  }
  return existing;
}

export function getVelaclawWorkspaceMarker(root: string): string {
  return path.join(root, "members", "member-template", "runtime", "config", "velaclaw.json");
}

export async function isVelaclawWorkspace(root: string): Promise<boolean> {
  try {
    await fsp.access(getVelaclawWorkspaceMarker(root));
    return true;
  } catch {
    return false;
  }
}

export async function ensureVelaclawWorkspaceInitialized(targetRoot: string) {
  await fsp.mkdir(targetRoot, { recursive: true });
  for (const dir of SCAFFOLD_DIRS) {
    await fsp.mkdir(path.join(targetRoot, dir), { recursive: true });
  }

  // Ensure a minimal marker file exists
  const markerPath = getVelaclawWorkspaceMarker(targetRoot);
  if (!fs.existsSync(markerPath)) {
    const configDir = path.dirname(markerPath);
    await fsp.mkdir(configDir, { recursive: true });
    await fsp.writeFile(
      markerPath,
      JSON.stringify(
        {
          name: "velaclaw-member-template",
          version: "1",
          gateway: { bind: "loopback" },
        },
        null,
        2,
      ) + "\n",
      "utf8",
    );
  }

  // Initialize state/team.json if missing
  const teamJsonPath = path.join(targetRoot, "state", "team.json");
  if (!fs.existsSync(teamJsonPath)) {
    await fsp.writeFile(
      teamJsonPath,
      JSON.stringify({ version: 2, teams: [] }, null, 2) + "\n",
      "utf8",
    );
  }

  await ensureVelaclawControlPlaneStateInitialized(targetRoot, process.env);
  await ensureMemberTemplateWorkspaceFiles(targetRoot);
}

async function ensureMemberTemplateWorkspaceFiles(targetRoot: string) {
  const workspaceDir = path.join(targetRoot, "members", "member-template", "runtime", "workspace");
  await fsp.mkdir(workspaceDir, { recursive: true });

  const agentsPath = path.join(workspaceDir, "AGENTS.md");
  if (!fs.existsSync(agentsPath)) {
    const templatePath = path.join(
      resolveVelaclawPackageRoot(),
      "docs",
      "reference",
      "templates",
      TEAM_MEMBER_AGENTS_TEMPLATE_FILENAME,
    );
    const content = await fsp.readFile(templatePath, "utf8");
    await fsp.writeFile(agentsPath, content.endsWith("\n") ? content : `${content}\n`, "utf8");
  }
}

function readPrimaryModelRef(config: MutableJsonObject): string {
  const agents = config.agents;
  if (!agents || typeof agents !== "object") {
    return "";
  }
  const defaults = (agents as MutableJsonObject).defaults;
  if (!defaults || typeof defaults !== "object") {
    return "";
  }
  const model = (defaults as MutableJsonObject).model;
  if (typeof model === "string") {
    return model.trim();
  }
  if (model && typeof model === "object") {
    const primary = (model as MutableJsonObject).primary;
    return typeof primary === "string" ? primary.trim() : "";
  }
  return "";
}

function shouldAdoptManagerDefaultModel(modelRef: string): boolean {
  if (!modelRef) {
    return true;
  }
  // `team-gateway/*` is the inherited Velaclaw placeholder; leave explicit
  // user choices (including `openai/*`, `openai-codex/*`, etc.) untouched.
  const normalized = modelRef.trim().toLowerCase();
  return normalized.startsWith("team-gateway/");
}

export function resolveManagerLocalProviderId(env: NodeJS.ProcessEnv = process.env): string {
  const explicit = env.VELACLAW_MANAGER_LOCAL_PROVIDER_ID?.trim();
  if (explicit) {
    return explicit;
  }
  const codex = detectCodexEnvironment(env);
  return codex.mode === "oauth" ? "openai-codex" : "openai";
}

export function resolveManagerDefaultModelId(env: NodeJS.ProcessEnv = process.env): string {
  return (
    env.VELACLAW_MANAGER_LOCAL_MODEL_ID?.trim() ||
    detectCodexEnvironment(env).model?.trim() ||
    DEFAULT_MANAGER_MODEL_ID
  );
}

function resolveManagerDefaultModelRef(
  codex: CodexEnvironment,
  env: NodeJS.ProcessEnv = process.env,
): string {
  if (env.VELACLAW_MANAGER_DEFAULT_MODEL?.trim()) {
    return env.VELACLAW_MANAGER_DEFAULT_MODEL.trim();
  }
  const modelId = resolveManagerDefaultModelId(env);
  if (codex.mode === "oauth") {
    return `openai-codex/${modelId}`;
  }
  // Prefer the OpenAI-compatible provider when Codex OAuth is unavailable.
  return `openai/${modelId}`;
}

function ensureOpenAiProviderApiKey(config: MutableJsonObject, codex: CodexEnvironment): boolean {
  if (codex.mode !== "apikey" || !codex.apiKey) {
    return false;
  }
  const models = ((config.models as MutableJsonObject | undefined) ??= {});
  const providers = ((models.providers as MutableJsonObject | undefined) ??= {});
  const openai = ((providers.openai as MutableJsonObject | undefined) ??= {});
  let changed = false;
  const modelId = codex.model?.trim() || DEFAULT_MANAGER_MODEL_ID;
  if (typeof openai.apiKey !== "string" || !openai.apiKey.trim()) {
    openai.apiKey = codex.apiKey;
    changed = true;
  }
  if (typeof openai.baseUrl !== "string" || !openai.baseUrl.trim()) {
    openai.baseUrl = codex.baseUrl || "https://api.openai.com/v1";
    changed = true;
  }
  const existingModels = openai.models;
  if (!Array.isArray(existingModels) || existingModels.length === 0) {
    openai.models = [{ id: modelId, name: modelId }];
    changed = true;
  }
  // When the user's codex talks to a non-official baseUrl, they've opted into
  // some proxy / self-hosted / fake-IP environment. Mirror that trust here so
  // velaclaw can reach the same endpoint (DNS may resolve to RFC 6890 ranges).
  const baseUrl = typeof openai.baseUrl === "string" ? openai.baseUrl.trim() : "";
  const isOfficialOpenAi = /^https:\/\/api\.openai\.com\//i.test(baseUrl);
  if (!isOfficialOpenAi) {
    const request = ((openai.request as MutableJsonObject | undefined) ??= {});
    if (request.allowPrivateNetwork !== true) {
      request.allowPrivateNetwork = true;
      changed = true;
    }
  }
  return changed;
}

function setPrimaryModelRef(config: MutableJsonObject, modelRef: string) {
  const agents = ((config.agents as MutableJsonObject | undefined) ??= {});
  const defaults = ((agents.defaults as MutableJsonObject | undefined) ??= {});
  const existingModel = defaults.model;
  if (existingModel && typeof existingModel === "object" && !Array.isArray(existingModel)) {
    (existingModel as MutableJsonObject).primary = modelRef;
  } else {
    defaults.model = { primary: modelRef };
  }
}

export async function ensureVelaclawManagerConfigInitialized(
  env: NodeJS.ProcessEnv = process.env,
): Promise<{ changed: boolean; configPath: string }> {
  const stateDir = resolveStateDir(env);
  const configPath = resolveConfigPath(env, stateDir);
  await fsp.mkdir(path.dirname(configPath), { recursive: true });

  let config: MutableJsonObject = {};
  try {
    config = JSON.parse(await fsp.readFile(configPath, "utf8")) as MutableJsonObject;
  } catch {
    config = {};
  }

  let changed = false;
  const codex = detectCodexEnvironment(env);
  const currentPrimary = readPrimaryModelRef(config);
  if (shouldAdoptManagerDefaultModel(currentPrimary)) {
    setPrimaryModelRef(config, resolveManagerDefaultModelRef(codex, env));
    changed = true;
  }
  if (ensureOpenAiProviderApiKey(config, codex)) {
    changed = true;
  }

  const gateway = ((config.gateway as MutableJsonObject | undefined) ??= {});
  if (typeof gateway.mode !== "string" || !gateway.mode.trim()) {
    gateway.mode = "local";
    changed = true;
  }
  const gatewayAuth = ((gateway.auth as MutableJsonObject | undefined) ??= {});
  if (typeof gatewayAuth.mode !== "string" || !gatewayAuth.mode.trim()) {
    gatewayAuth.mode = "token";
    changed = true;
  }
  if (
    gatewayAuth.mode === "token" &&
    (typeof gatewayAuth.token !== "string" || !gatewayAuth.token.trim())
  ) {
    gatewayAuth.token = crypto.randomBytes(24).toString("hex");
    changed = true;
  }

  if (changed) {
    await fsp.writeFile(configPath, JSON.stringify(config, null, 2) + "\n", "utf8");
  }

  return { changed, configPath };
}
