// Public agent/model/runtime helpers for plugins that integrate with core agent flows.

export * from "../agents/agent-scope.js";
export * from "../agents/current-time.js";
export * from "../agents/date-time.js";
export * from "../agents/defaults.js";
export * from "../agents/identity-avatar.js";
export * from "../agents/identity.js";
export * from "../agents/model-auth-markers.js";
export * from "../agents/model-auth.js";
export * from "../agents/model-catalog.js";
export * from "../agents/model-selection.js";
export * from "../agents/simple-completion-runtime.js";
export * from "../agents/pi-embedded-block-chunker.js";
export * from "../agents/pi-embedded-utils.js";
export * from "../agents/provider-id.js";
export * from "../agents/sandbox-paths.js";
export * from "../agents/schema/typebox.js";
export * from "../agents/tools/common.js";
export * from "../agents/tools/web-guarded-fetch.js";
export * from "../agents/tools/web-shared.js";
export * from "../agents/tools/web-fetch-utils.js";
// Intentional public runtime surface: channel plugins use ingress agent helpers directly.
export * from "../agents/agent-command.js";
// TTS exports removed (speech subsystem cleaned up) — keep minimal stubs
// so plugins that still reference the removed functions compile without
// dragging the deleted runtime back in. Runtime behaviour is unchanged:
// callers get "unavailable" back.

export type ResolvedTtsConfig = {
  provider?: string;
  model?: string;
  voice?: string;
  providerConfigs: Record<string, Record<string, unknown>>;
  modelOverrides?: Record<string, unknown>;
  timeoutMs?: number;
  [key: string]: unknown;
};

export function resolveTtsConfig(_cfg?: unknown): ResolvedTtsConfig {
  return { providerConfigs: {} };
}

export {
  CLAUDE_CLI_PROFILE_ID,
  CODEX_CLI_PROFILE_ID,
  dedupeProfileIds,
  listProfilesForProvider,
  markAuthProfileGood,
  setAuthProfileOrder,
  upsertAuthProfile,
  upsertAuthProfileWithLock,
  repairOAuthProfileIdMismatch,
  suggestOAuthProfileIdForLegacyDefault,
  clearRuntimeAuthProfileStoreSnapshots,
  ensureAuthProfileStore,
  loadAuthProfileStoreForSecretsRuntime,
  loadAuthProfileStoreForRuntime,
  replaceRuntimeAuthProfileStoreSnapshots,
  loadAuthProfileStore,
  saveAuthProfileStore,
  calculateAuthProfileCooldownMs,
  clearAuthProfileCooldown,
  clearExpiredCooldowns,
  getSoonestCooldownExpiry,
  isProfileInCooldown,
  markAuthProfileCooldown,
  markAuthProfileFailure,
  markAuthProfileUsed,
  resolveProfilesUnavailableReason,
  resolveProfileUnusableUntilForDisplay,
  resolveApiKeyForProfile,
  resolveAuthProfileDisplayLabel,
  formatAuthDoctorHint,
  resolveAuthProfileEligibility,
  resolveAuthProfileOrder,
  resolveAuthStorePathForDisplay,
} from "../agents/auth-profiles.js";
export type {
  ApiKeyCredential,
  AuthCredentialReasonCode,
  AuthProfileCredential,
  AuthProfileEligibilityReasonCode,
  AuthProfileFailureReason,
  AuthProfileIdRepairResult,
  AuthProfileStore,
  OAuthCredential,
  ProfileUsageStats,
  TokenCredential,
  TokenExpiryState,
} from "../agents/auth-profiles.js";
