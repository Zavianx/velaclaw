// Narrow plugin-sdk surface for the bundled llm-task plugin.
// Keep this list additive and scoped to the bundled LLM task surface.

export { definePluginEntry } from "./plugin-entry.js";
export { resolvePreferredVelaclawTmpDir } from "../infra/tmp-velaclaw-dir.js";
export {
  formatThinkingLevels,
  formatXHighModelHint,
  normalizeThinkLevel,
  supportsXHighThinking,
} from "../auto-reply/thinking.js";
export type { AnyAgentTool, VelaclawPluginApi } from "../plugins/types.js";
