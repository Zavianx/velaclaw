import type { VelaclawConfig } from "velaclaw/plugin-sdk/browser-config-runtime";
import {
  normalizePluginsConfig,
  resolveEffectiveEnableState,
} from "velaclaw/plugin-sdk/browser-config-runtime";

export function isDefaultBrowserPluginEnabled(cfg: VelaclawConfig): boolean {
  return resolveEffectiveEnableState({
    id: "browser",
    origin: "bundled",
    config: normalizePluginsConfig(cfg.plugins),
    rootConfig: cfg,
    enabledByDefault: true,
  }).enabled;
}
