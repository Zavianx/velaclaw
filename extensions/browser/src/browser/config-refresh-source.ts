import { createConfigIO, getRuntimeConfigSnapshot, type VelaclawConfig } from "../config/config.js";

export function loadBrowserConfigForRuntimeRefresh(): VelaclawConfig {
  return getRuntimeConfigSnapshot() ?? createConfigIO().loadConfig();
}
