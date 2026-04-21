import { resolveChannelPreviewStreamMode } from "velaclaw/plugin-sdk/channel-streaming";

export type TelegramPreviewStreamMode = "off" | "partial" | "block";

export function resolveTelegramPreviewStreamMode(
  params: {
    streamMode?: unknown;
    streaming?: unknown;
  } = {},
): TelegramPreviewStreamMode {
  return resolveChannelPreviewStreamMode(params, "partial");
}
