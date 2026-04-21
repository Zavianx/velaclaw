import { normalizeOptionalString } from "../shared/string-coerce.js";

export const DEFAULT_PLUGIN_DISCOVERY_CACHE_MS = 1000;
export const DEFAULT_PLUGIN_MANIFEST_CACHE_MS = 1000;

export function shouldUsePluginSnapshotCache(env: NodeJS.ProcessEnv): boolean {
  if (normalizeOptionalString(env.VELACLAW_DISABLE_PLUGIN_DISCOVERY_CACHE)) {
    return false;
  }
  if (normalizeOptionalString(env.VELACLAW_DISABLE_PLUGIN_MANIFEST_CACHE)) {
    return false;
  }
  const discoveryCacheMs = normalizeOptionalString(env.VELACLAW_PLUGIN_DISCOVERY_CACHE_MS);
  if (discoveryCacheMs === "0") {
    return false;
  }
  const manifestCacheMs = normalizeOptionalString(env.VELACLAW_PLUGIN_MANIFEST_CACHE_MS);
  if (manifestCacheMs === "0") {
    return false;
  }
  return true;
}

export function resolvePluginCacheMs(rawValue: string | undefined, defaultMs: number): number {
  const raw = normalizeOptionalString(rawValue);
  if (raw === "" || raw === "0") {
    return 0;
  }
  if (!raw) {
    return defaultMs;
  }
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed)) {
    return defaultMs;
  }
  return Math.max(0, parsed);
}

export function resolvePluginSnapshotCacheTtlMs(env: NodeJS.ProcessEnv): number {
  const discoveryCacheMs = resolvePluginCacheMs(
    env.VELACLAW_PLUGIN_DISCOVERY_CACHE_MS,
    DEFAULT_PLUGIN_DISCOVERY_CACHE_MS,
  );
  const manifestCacheMs = resolvePluginCacheMs(
    env.VELACLAW_PLUGIN_MANIFEST_CACHE_MS,
    DEFAULT_PLUGIN_MANIFEST_CACHE_MS,
  );
  return Math.min(discoveryCacheMs, manifestCacheMs);
}

export function buildPluginSnapshotCacheEnvKey(env: NodeJS.ProcessEnv): string {
  return JSON.stringify({
    VELACLAW_BUNDLED_PLUGINS_DIR: env.VELACLAW_BUNDLED_PLUGINS_DIR ?? "",
    VELACLAW_DISABLE_PLUGIN_DISCOVERY_CACHE: env.VELACLAW_DISABLE_PLUGIN_DISCOVERY_CACHE ?? "",
    VELACLAW_DISABLE_PLUGIN_MANIFEST_CACHE: env.VELACLAW_DISABLE_PLUGIN_MANIFEST_CACHE ?? "",
    VELACLAW_PLUGIN_DISCOVERY_CACHE_MS: env.VELACLAW_PLUGIN_DISCOVERY_CACHE_MS ?? "",
    VELACLAW_PLUGIN_MANIFEST_CACHE_MS: env.VELACLAW_PLUGIN_MANIFEST_CACHE_MS ?? "",
    VELACLAW_HOME: env.VELACLAW_HOME ?? "",
    VELACLAW_STATE_DIR: env.VELACLAW_STATE_DIR ?? "",
    VELACLAW_CONFIG_PATH: env.VELACLAW_CONFIG_PATH ?? "",
    HOME: env.HOME ?? "",
    USERPROFILE: env.USERPROFILE ?? "",
    VITEST: env.VITEST ?? "",
  });
}
