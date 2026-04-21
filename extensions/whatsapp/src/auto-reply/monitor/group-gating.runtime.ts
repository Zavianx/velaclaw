export {
  implicitMentionKindWhen,
  resolveInboundMentionDecision,
} from "velaclaw/plugin-sdk/channel-inbound";
export { hasControlCommand } from "velaclaw/plugin-sdk/command-detection";
export { recordPendingHistoryEntryIfEnabled } from "velaclaw/plugin-sdk/reply-history";
export { parseActivationCommand } from "velaclaw/plugin-sdk/reply-runtime";
export { normalizeE164 } from "../../text-runtime.js";
