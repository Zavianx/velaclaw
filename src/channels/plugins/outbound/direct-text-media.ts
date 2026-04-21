import { sanitizeForPlainText } from "velaclaw/plugin-sdk/outbound-runtime";
import {
  resolvePayloadMediaUrls,
  sendPayloadMediaSequence,
  sendPayloadMediaSequenceAndFinalize,
  sendPayloadMediaSequenceOrFallback,
  sendTextMediaPayload,
} from "velaclaw/plugin-sdk/reply-payload";
import { chunkText } from "../../../auto-reply/chunk.js";
import type { VelaclawConfig } from "../../../config/types.velaclaw.js";
import type { OutboundSendDeps } from "../../../infra/outbound/deliver.js";
import {
  getOutboundMediaAccessLocalRoots,
  getOutboundMediaAccessReadFile,
  type OutboundMediaAccess,
} from "../../../media/load-options.js";
import { resolveChannelMediaMaxBytes } from "../media-limits.js";
import type { ChannelOutboundAdapter } from "../types.adapters.js";

type DirectSendOptions = {
  cfg: VelaclawConfig;
  accountId?: string | null;
  replyToId?: string | null;
  mediaUrl?: string;
  mediaAccess?: OutboundMediaAccess;
  mediaLocalRoots?: readonly string[];
  mediaReadFile?: (filePath: string) => Promise<Buffer>;
  maxBytes?: number;
};

type DirectSendResult = { messageId: string; [key: string]: unknown };

type DirectSendFn<TOpts extends Record<string, unknown>, TResult extends DirectSendResult> = (
  to: string,
  text: string,
  opts: TOpts,
) => Promise<TResult>;
export {
  resolvePayloadMediaUrls,
  sendPayloadMediaSequence,
  sendPayloadMediaSequenceAndFinalize,
  sendPayloadMediaSequenceOrFallback,
  sendTextMediaPayload,
} from "velaclaw/plugin-sdk/reply-payload";

export function resolveScopedChannelMediaMaxBytes(params: {
  cfg: VelaclawConfig;
  accountId?: string | null;
  resolveChannelLimitMb: (params: { cfg: VelaclawConfig; accountId: string }) => number | undefined;
}): number | undefined {
  return resolveChannelMediaMaxBytes({
    cfg: params.cfg,
    resolveChannelLimitMb: params.resolveChannelLimitMb,
    accountId: params.accountId,
  });
}

export function createScopedChannelMediaMaxBytesResolver(channel: string) {
  return (params: { cfg: VelaclawConfig; accountId?: string | null }) =>
    resolveScopedChannelMediaMaxBytes({
      cfg: params.cfg,
      accountId: params.accountId,
      resolveChannelLimitMb: ({ cfg, accountId }) =>
        (cfg.channels?.[channel]?.accounts?.[accountId] as { mediaMaxMb?: number } | undefined)
          ?.mediaMaxMb ?? cfg.channels?.[channel]?.mediaMaxMb,
    });
}

export function createDirectTextMediaOutbound<
  TOpts extends Record<string, unknown>,
  TResult extends DirectSendResult,
>(params: {
  channel: string;
  resolveSender: (deps: OutboundSendDeps | undefined) => DirectSendFn<TOpts, TResult>;
  resolveMaxBytes: (params: {
    cfg: VelaclawConfig;
    accountId?: string | null;
  }) => number | undefined;
  buildTextOptions: (params: DirectSendOptions) => TOpts;
  buildMediaOptions: (params: DirectSendOptions) => TOpts;
}): ChannelOutboundAdapter {
  const sendDirect = async (sendParams: {
    cfg: VelaclawConfig;
    to: string;
    text: string;
    accountId?: string | null;
    deps?: OutboundSendDeps;
    replyToId?: string | null;
    mediaUrl?: string;
    mediaAccess?: OutboundMediaAccess;
    buildOptions: (params: DirectSendOptions) => TOpts;
  }) => {
    const send = params.resolveSender(sendParams.deps);
    const maxBytes = params.resolveMaxBytes({
      cfg: sendParams.cfg,
      accountId: sendParams.accountId,
    });
    const result = await send(
      sendParams.to,
      sendParams.text,
      sendParams.buildOptions({
        cfg: sendParams.cfg,
        mediaUrl: sendParams.mediaUrl,
        mediaAccess: sendParams.mediaAccess,
        mediaLocalRoots: getOutboundMediaAccessLocalRoots(sendParams.mediaAccess),
        mediaReadFile: getOutboundMediaAccessReadFile(sendParams.mediaAccess),
        accountId: sendParams.accountId,
        replyToId: sendParams.replyToId,
        maxBytes,
      }),
    );
    return { channel: params.channel, ...result };
  };

  const outbound: ChannelOutboundAdapter = {
    deliveryMode: "direct",
    chunker: chunkText,
    chunkerMode: "text",
    textChunkLimit: 4000,
    sanitizeText: ({ text }) => sanitizeForPlainText(text),
    sendPayload: async (ctx) =>
      await sendTextMediaPayload({ channel: params.channel, ctx, adapter: outbound }),
    sendText: async ({ cfg, to, text, accountId, deps, replyToId }) => {
      return await sendDirect({
        cfg,
        to,
        text,
        accountId,
        deps,
        replyToId,
        buildOptions: params.buildTextOptions,
      });
    },
    sendMedia: async ({
      cfg,
      to,
      text,
      mediaUrl,
      mediaAccess,
      mediaLocalRoots,
      mediaReadFile,
      accountId,
      deps,
      replyToId,
    }) => {
      return await sendDirect({
        cfg,
        to,
        text,
        mediaUrl,
        mediaAccess:
          mediaAccess ??
          (mediaLocalRoots || mediaReadFile
            ? {
                ...(mediaLocalRoots?.length ? { localRoots: mediaLocalRoots } : {}),
                ...(mediaReadFile ? { readFile: mediaReadFile } : {}),
              }
            : undefined),
        accountId,
        deps,
        replyToId,
        buildOptions: params.buildMediaOptions,
      });
    },
  };
  return outbound;
}
