import type { ChannelDoctorConfigMutation } from "velaclaw/plugin-sdk/channel-contract";
import type { VelaclawConfig } from "velaclaw/plugin-sdk/config-runtime";
import { normalizeCompatibilityConfig as normalizeCompatibilityConfigImpl } from "./doctor.js";

export function normalizeCompatibilityConfig({
  cfg,
}: {
  cfg: VelaclawConfig;
}): ChannelDoctorConfigMutation {
  return normalizeCompatibilityConfigImpl({ cfg });
}
