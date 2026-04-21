import type { ReplyToMode } from "velaclaw/plugin-sdk/config-runtime";
import type { ReplyThreadingPolicy } from "velaclaw/plugin-sdk/reply-reference";
import { resolveBatchedReplyThreadingPolicy } from "velaclaw/plugin-sdk/reply-reference";

type ReplyThreadingContext = {
  ReplyThreading?: ReplyThreadingPolicy;
};

export function applyImplicitReplyBatchGate<T extends object>(
  ctx: T,
  replyToMode: ReplyToMode,
  isBatched: boolean,
) {
  const replyThreading = resolveBatchedReplyThreadingPolicy(replyToMode, isBatched);
  if (!replyThreading) {
    return;
  }
  (ctx as T & ReplyThreadingContext).ReplyThreading = replyThreading;
}
