import crypto from "node:crypto";
import path from "node:path";
import type { MsgContext } from "../auto-reply/templating.js";
import type { ReasoningLevel, ThinkLevel } from "../auto-reply/thinking.js";
import { resolveStateDir } from "../config/paths.js";
import { loadJsonFile, saveJsonFile } from "../infra/json-file.js";
import { DEFAULT_ACCOUNT_ID } from "../routing/account-id.js";
import { normalizeAgentId } from "../routing/session-key.js";
import {
  normalizeLowercaseStringOrEmpty,
  normalizeOptionalString,
} from "../shared/string-coerce.js";

export type ClawProfile = {
  id: string;
  name: string;
  nameKey: string;
  sessionKey: string;
  rolePrompt?: string;
  skillFilter?: string[];
  providerOverride?: string;
  modelOverride?: string;
  thinkingLevel?: ThinkLevel;
  reasoningLevel?: ReasoningLevel;
  createdAt: number;
  updatedAt: number;
  archivedAt?: number;
};

export type ClawScope = {
  agentId: string;
  channel: string;
  accountId: string;
  conversationId: string;
  senderId: string;
};

export type ClawStore = {
  version: 1;
  profiles: ClawProfile[];
  activeByScope: Record<string, { profileId?: string; updatedAt: number }>;
};

export type ClawProfileInput = {
  name: string;
  rolePrompt?: string;
  skillFilter?: string[];
  providerOverride?: string;
  modelOverride?: string;
  thinkingLevel?: ThinkLevel;
  reasoningLevel?: ReasoningLevel;
};

export type ClawRouteResult = {
  ctx: MsgContext;
  profile?: ClawProfile;
};

const CLAW_STORE_VERSION = 1;
const SCOPE_SEPARATOR = "\u241f";

function nowMs(): number {
  return Date.now();
}

function normalizeName(value: string): string {
  return value.trim().replace(/\s+/g, " ").slice(0, 80);
}

export function normalizeClawNameKey(value: string): string {
  return normalizeName(value).toLocaleLowerCase();
}

function normalizeScopePart(value: unknown, fallback: string): string {
  return normalizeLowercaseStringOrEmpty(value).replace(/\s+/g, " ") || fallback;
}

function normalizeStoredSkillFilter(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }
  const normalized = value
    .map((entry) => normalizeOptionalString(entry))
    .filter((entry): entry is string => Boolean(entry));
  return [...new Set(normalized)];
}

function normalizeProfile(raw: unknown): ClawProfile | null {
  if (!raw || typeof raw !== "object") {
    return null;
  }
  const record = raw as Partial<ClawProfile>;
  const id = normalizeOptionalString(record.id);
  const name = normalizeOptionalString(record.name);
  const sessionKey = normalizeOptionalString(record.sessionKey);
  if (!id || !name || !sessionKey) {
    return null;
  }
  const nameKey = normalizeOptionalString(record.nameKey) ?? normalizeClawNameKey(name);
  const createdAt =
    typeof record.createdAt === "number" && Number.isFinite(record.createdAt)
      ? record.createdAt
      : nowMs();
  const updatedAt =
    typeof record.updatedAt === "number" && Number.isFinite(record.updatedAt)
      ? record.updatedAt
      : createdAt;
  return {
    id,
    name: normalizeName(name),
    nameKey,
    sessionKey,
    rolePrompt: normalizeOptionalString(record.rolePrompt),
    skillFilter: normalizeStoredSkillFilter(record.skillFilter),
    providerOverride: normalizeOptionalString(record.providerOverride),
    modelOverride: normalizeOptionalString(record.modelOverride),
    thinkingLevel: record.thinkingLevel,
    reasoningLevel: record.reasoningLevel,
    createdAt,
    updatedAt,
    ...(typeof record.archivedAt === "number" && Number.isFinite(record.archivedAt)
      ? { archivedAt: record.archivedAt }
      : {}),
  };
}

function normalizeStore(raw: unknown): ClawStore {
  if (!raw || typeof raw !== "object") {
    return { version: CLAW_STORE_VERSION, profiles: [], activeByScope: {} };
  }
  const record = raw as Partial<ClawStore>;
  const profiles = Array.isArray(record.profiles)
    ? record.profiles.map(normalizeProfile).filter((entry): entry is ClawProfile => Boolean(entry))
    : [];
  const activeByScope: ClawStore["activeByScope"] = {};
  if (record.activeByScope && typeof record.activeByScope === "object") {
    for (const [key, value] of Object.entries(record.activeByScope)) {
      if (!value || typeof value !== "object") {
        continue;
      }
      const active = value as { profileId?: unknown; updatedAt?: unknown };
      const updatedAt =
        typeof active.updatedAt === "number" && Number.isFinite(active.updatedAt)
          ? active.updatedAt
          : nowMs();
      activeByScope[key] = {
        profileId: normalizeOptionalString(active.profileId),
        updatedAt,
      };
    }
  }
  return { version: CLAW_STORE_VERSION, profiles, activeByScope };
}

export function buildClawSessionKey(agentId: string, profileId: string): string {
  return `agent:${normalizeAgentId(agentId)}:claw:${profileId}`;
}

export function resolveClawStorePath(
  agentId: string,
  env: NodeJS.ProcessEnv = process.env,
): string {
  return path.join(
    resolveStateDir(env),
    "agents",
    normalizeAgentId(agentId),
    "claws",
    "claws.json",
  );
}

export function loadClawStore(agentId: string, env: NodeJS.ProcessEnv = process.env): ClawStore {
  return normalizeStore(loadJsonFile(resolveClawStorePath(agentId, env)));
}

export function saveClawStore(
  agentId: string,
  store: ClawStore,
  env: NodeJS.ProcessEnv = process.env,
): void {
  saveJsonFile(resolveClawStorePath(agentId, env), {
    version: CLAW_STORE_VERSION,
    profiles: store.profiles.toSorted((a, b) => a.createdAt - b.createdAt),
    activeByScope: store.activeByScope,
  });
}

export function buildClawScopeKey(scope: ClawScope): string {
  return [
    normalizeAgentId(scope.agentId),
    scope.channel,
    scope.accountId,
    scope.conversationId,
    scope.senderId,
  ].join(SCOPE_SEPARATOR);
}

export function resolveClawScopeFromContext(params: {
  agentId: string;
  ctx: MsgContext;
}): ClawScope {
  const { ctx } = params;
  const channel = normalizeScopePart(
    ctx.OriginatingChannel ?? ctx.Provider ?? ctx.Surface,
    "unknown",
  );
  const accountId = normalizeOptionalString(ctx.AccountId) ?? DEFAULT_ACCOUNT_ID;
  const conversationId = normalizeScopePart(
    ctx.NativeChannelId ?? ctx.OriginatingTo ?? ctx.To ?? ctx.NativeDirectUserId ?? ctx.From,
    "unknown",
  );
  const senderId = normalizeScopePart(
    ctx.SenderId ?? ctx.NativeDirectUserId ?? ctx.From ?? ctx.SenderE164,
    "unknown",
  );
  return {
    agentId: normalizeAgentId(params.agentId),
    channel,
    accountId,
    conversationId,
    senderId,
  };
}

export function listClawProfiles(params: {
  agentId: string;
  includeArchived?: boolean;
  env?: NodeJS.ProcessEnv;
}): ClawProfile[] {
  const store = loadClawStore(params.agentId, params.env);
  return store.profiles.filter((profile) => params.includeArchived || profile.archivedAt == null);
}

export function findClawProfileByName(params: {
  agentId: string;
  name: string;
  includeArchived?: boolean;
  env?: NodeJS.ProcessEnv;
}): ClawProfile | null {
  const nameKey = normalizeClawNameKey(params.name);
  if (!nameKey) {
    return null;
  }
  return (
    listClawProfiles({
      agentId: params.agentId,
      includeArchived: params.includeArchived,
      env: params.env,
    }).find((profile) => profile.nameKey === nameKey || profile.id === params.name) ?? null
  );
}

export function createClawProfile(params: {
  agentId: string;
  input: ClawProfileInput;
  env?: NodeJS.ProcessEnv;
}): ClawProfile {
  const agentId = normalizeAgentId(params.agentId);
  const name = normalizeName(params.input.name);
  const nameKey = normalizeClawNameKey(name);
  if (!nameKey) {
    throw new Error("Missing claw name.");
  }
  const store = loadClawStore(agentId, params.env);
  if (store.profiles.some((profile) => profile.archivedAt == null && profile.nameKey === nameKey)) {
    throw new Error(`Claw "${name}" already exists.`);
  }
  const timestamp = nowMs();
  const id = crypto.randomUUID().replace(/-/g, "").slice(0, 16);
  const profile: ClawProfile = {
    id,
    name,
    nameKey,
    sessionKey: buildClawSessionKey(agentId, id),
    rolePrompt: normalizeOptionalString(params.input.rolePrompt),
    skillFilter: normalizeStoredSkillFilter(params.input.skillFilter),
    providerOverride: normalizeOptionalString(params.input.providerOverride),
    modelOverride: normalizeOptionalString(params.input.modelOverride),
    thinkingLevel: params.input.thinkingLevel,
    reasoningLevel: params.input.reasoningLevel,
    createdAt: timestamp,
    updatedAt: timestamp,
  };
  store.profiles.push(profile);
  saveClawStore(agentId, store, params.env);
  return profile;
}

export function updateClawProfile(params: {
  agentId: string;
  profileId: string;
  patch: Partial<ClawProfileInput>;
  clear?: {
    rolePrompt?: boolean;
    skillFilter?: boolean;
    modelOverride?: boolean;
    thinkingLevel?: boolean;
    reasoningLevel?: boolean;
  };
  env?: NodeJS.ProcessEnv;
}): ClawProfile {
  const agentId = normalizeAgentId(params.agentId);
  const store = loadClawStore(agentId, params.env);
  const index = store.profiles.findIndex(
    (profile) => profile.id === params.profileId && profile.archivedAt == null,
  );
  if (index === -1) {
    throw new Error("Claw not found.");
  }
  const current = store.profiles[index];
  const nextName = params.patch.name ? normalizeName(params.patch.name) : current.name;
  const nextNameKey = normalizeClawNameKey(nextName);
  if (!nextNameKey) {
    throw new Error("Missing claw name.");
  }
  if (
    nextNameKey !== current.nameKey &&
    store.profiles.some((profile) => profile.archivedAt == null && profile.nameKey === nextNameKey)
  ) {
    throw new Error(`Claw "${nextName}" already exists.`);
  }
  const next: ClawProfile = {
    ...current,
    name: nextName,
    nameKey: nextNameKey,
    updatedAt: nowMs(),
  };
  if (params.clear?.rolePrompt) {
    delete next.rolePrompt;
  } else if (Object.hasOwn(params.patch, "rolePrompt")) {
    next.rolePrompt = normalizeOptionalString(params.patch.rolePrompt);
  }
  if (params.clear?.skillFilter) {
    delete next.skillFilter;
  } else if (Object.hasOwn(params.patch, "skillFilter")) {
    next.skillFilter = normalizeStoredSkillFilter(params.patch.skillFilter);
  }
  if (params.clear?.modelOverride) {
    delete next.providerOverride;
    delete next.modelOverride;
  } else {
    if (Object.hasOwn(params.patch, "providerOverride")) {
      next.providerOverride = normalizeOptionalString(params.patch.providerOverride);
    }
    if (Object.hasOwn(params.patch, "modelOverride")) {
      next.modelOverride = normalizeOptionalString(params.patch.modelOverride);
    }
  }
  if (params.clear?.thinkingLevel) {
    delete next.thinkingLevel;
  } else if (Object.hasOwn(params.patch, "thinkingLevel")) {
    next.thinkingLevel = params.patch.thinkingLevel;
  }
  if (params.clear?.reasoningLevel) {
    delete next.reasoningLevel;
  } else if (Object.hasOwn(params.patch, "reasoningLevel")) {
    next.reasoningLevel = params.patch.reasoningLevel;
  }
  store.profiles[index] = next;
  saveClawStore(agentId, store, params.env);
  return next;
}

export function setActiveClaw(params: {
  agentId: string;
  scope: ClawScope;
  profileId?: string;
  env?: NodeJS.ProcessEnv;
}): void {
  const agentId = normalizeAgentId(params.agentId);
  const store = loadClawStore(agentId, params.env);
  const scopeKey = buildClawScopeKey(params.scope);
  if (!params.profileId) {
    delete store.activeByScope[scopeKey];
  } else {
    const profile = store.profiles.find(
      (entry) => entry.id === params.profileId && entry.archivedAt == null,
    );
    if (!profile) {
      throw new Error("Claw not found.");
    }
    store.activeByScope[scopeKey] = { profileId: profile.id, updatedAt: nowMs() };
  }
  saveClawStore(agentId, store, params.env);
}

export function resolveActiveClawProfile(params: {
  agentId: string;
  ctx: MsgContext;
  env?: NodeJS.ProcessEnv;
}): ClawProfile | null {
  const agentId = normalizeAgentId(params.agentId);
  const store = loadClawStore(agentId, params.env);
  const scope = resolveClawScopeFromContext({ agentId, ctx: params.ctx });
  const active = store.activeByScope[buildClawScopeKey(scope)];
  if (!active?.profileId) {
    return null;
  }
  return (
    store.profiles.find(
      (profile) => profile.id === active.profileId && profile.archivedAt == null,
    ) ?? null
  );
}

export function archiveClawProfile(params: {
  agentId: string;
  profileId: string;
  env?: NodeJS.ProcessEnv;
}): ClawProfile {
  const agentId = normalizeAgentId(params.agentId);
  const store = loadClawStore(agentId, params.env);
  const index = store.profiles.findIndex(
    (profile) => profile.id === params.profileId && profile.archivedAt == null,
  );
  if (index === -1) {
    throw new Error("Claw not found.");
  }
  const archived = {
    ...store.profiles[index],
    archivedAt: nowMs(),
    updatedAt: nowMs(),
  };
  store.profiles[index] = archived;
  for (const [scopeKey, active] of Object.entries(store.activeByScope)) {
    if (active.profileId === params.profileId) {
      delete store.activeByScope[scopeKey];
    }
  }
  saveClawStore(agentId, store, params.env);
  return archived;
}

export function attachClawProfileToContext(ctx: MsgContext, profile: ClawProfile): MsgContext {
  return {
    ...ctx,
    SessionKey: profile.sessionKey,
    ...(ctx.CommandSource === "native" ? { CommandTargetSessionKey: profile.sessionKey } : {}),
    ClawSessionId: profile.id,
    ClawSessionName: profile.name,
    ClawSessionKey: profile.sessionKey,
    ClawSessionRolePrompt: profile.rolePrompt,
    ClawSkillFilter: profile.skillFilter,
    ClawProviderOverride: profile.providerOverride,
    ClawModelOverride: profile.modelOverride,
    ClawThinkingLevel: profile.thinkingLevel,
    ClawReasoningLevel: profile.reasoningLevel,
  };
}

export function applyActiveClawToContext(params: {
  agentId: string;
  ctx: MsgContext;
  env?: NodeJS.ProcessEnv;
}): ClawRouteResult {
  const profile = resolveActiveClawProfile(params);
  if (!profile) {
    return { ctx: params.ctx };
  }
  return {
    ctx: attachClawProfileToContext(params.ctx, profile),
    profile,
  };
}
