import { readStringOrNumberParam, readStringParam } from "velaclaw/plugin-sdk/channel-actions";
import type { VelaclawConfig } from "velaclaw/plugin-sdk/config-runtime";

export { resolveReactionMessageId } from "velaclaw/plugin-sdk/channel-actions";
export { handleWhatsAppAction } from "./action-runtime.js";
export { isWhatsAppGroupJid, normalizeWhatsAppTarget } from "./normalize.js";
export { readStringOrNumberParam, readStringParam, type VelaclawConfig };
