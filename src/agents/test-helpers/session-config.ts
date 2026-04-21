import type { VelaclawConfig } from "../../config/types.velaclaw.js";

export function createPerSenderSessionConfig(
  overrides: Partial<NonNullable<VelaclawConfig["session"]>> = {},
): NonNullable<VelaclawConfig["session"]> {
  return {
    mainKey: "main",
    scope: "per-sender",
    ...overrides,
  };
}
