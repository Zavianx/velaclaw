import { getRuntimeConfigSnapshot } from "../../config/runtime-snapshot.js";
import type { VelaclawConfig } from "../../config/types.velaclaw.js";
import { coerceSecretRef } from "../../config/types.secrets.js";

function hasConfiguredSkillApiKeyRef(config?: VelaclawConfig): boolean {
  const entries = config?.skills?.entries;
  if (!entries || typeof entries !== "object") {
    return false;
  }
  for (const skillConfig of Object.values(entries)) {
    if (!skillConfig || typeof skillConfig !== "object") {
      continue;
    }
    if (coerceSecretRef(skillConfig.apiKey) !== null) {
      return true;
    }
  }
  return false;
}

export function resolveSkillRuntimeConfig(config?: VelaclawConfig): VelaclawConfig | undefined {
  const runtimeConfig = getRuntimeConfigSnapshot();
  if (!runtimeConfig) {
    return config;
  }
  if (!config) {
    return runtimeConfig;
  }
  const runtimeHasRawSkillSecretRefs = hasConfiguredSkillApiKeyRef(runtimeConfig);
  const configHasRawSkillSecretRefs = hasConfiguredSkillApiKeyRef(config);
  if (runtimeHasRawSkillSecretRefs && !configHasRawSkillSecretRefs) {
    return config;
  }
  return runtimeConfig;
}
