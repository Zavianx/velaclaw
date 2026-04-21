import { ensureAuthProfileStore } from "../../agents/auth-profiles.js";
import type { VelaclawConfig } from "../../config/types.velaclaw.js";
import { normalizeOptionalString } from "../../shared/string-coerce.js";

export function resolveProfileOverride(params: {
  rawProfile?: string;
  provider: string;
  cfg: VelaclawConfig;
  agentDir?: string;
}): { profileId?: string; error?: string } {
  const raw = normalizeOptionalString(params.rawProfile);
  if (!raw) {
    return {};
  }
  const store = ensureAuthProfileStore(params.agentDir, {
    allowKeychainPrompt: false,
  });
  const profile = store.profiles[raw];
  if (!profile) {
    return { error: `Auth profile "${raw}" not found.` };
  }
  if (profile.provider !== params.provider) {
    return {
      error: `Auth profile "${raw}" is for ${profile.provider}, not ${params.provider}.`,
    };
  }
  return { profileId: raw };
}
