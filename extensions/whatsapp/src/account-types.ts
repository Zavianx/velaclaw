import type { VelaclawConfig } from "velaclaw/plugin-sdk/config-runtime";

export type WhatsAppAccountConfig = NonNullable<
  NonNullable<NonNullable<VelaclawConfig["channels"]>["whatsapp"]>["accounts"]
>[string];
