// Narrow plugin-sdk surface for the bundled diffs plugin.
// Keep this list additive and scoped to the bundled diffs surface.

export { definePluginEntry } from "./plugin-entry.js";
export type { VelaclawConfig } from "../config/config.js";
export { resolvePreferredVelaclawTmpDir } from "../infra/tmp-velaclaw-dir.js";
export type {
  AnyAgentTool,
  VelaclawPluginApi,
  VelaclawPluginConfigSchema,
  VelaclawPluginToolContext,
  PluginLogger,
} from "../plugins/types.js";
