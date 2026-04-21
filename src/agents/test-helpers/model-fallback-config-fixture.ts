import type { VelaclawConfig } from "../../config/types.velaclaw.js";

export function makeModelFallbackCfg(overrides: Partial<VelaclawConfig> = {}): VelaclawConfig {
  return {
    agents: {
      defaults: {
        model: {
          primary: "openai/gpt-4.1-mini",
          fallbacks: ["anthropic/claude-haiku-3-5"],
        },
      },
    },
    ...overrides,
  } as VelaclawConfig;
}
