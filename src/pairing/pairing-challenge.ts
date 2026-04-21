import { buildPairingReply } from "./pairing-messages.js";

type PairingMeta = Record<string, string | undefined | null>;

export type PairingChallengeParams = {
  channel: string;
  senderId: string;
  senderIdLine: string;
  meta?: PairingMeta;
  upsertPairingRequest: (params: {
    id: string;
    meta?: PairingMeta;
  }) => Promise<{ code: string; created: boolean }>;
  sendPairingReply: (text: string) => Promise<void>;
  buildReplyText?: (params: { code: string; senderIdLine: string }) => string;
  onCreated?: (params: { code: string }) => void;
  onReplyError?: (err: unknown) => void;
};

export async function issuePairingChallenge(
  params: PairingChallengeParams,
): Promise<{ created: boolean; code?: string }> {
  const { code, created } = await params.upsertPairingRequest({
    id: params.senderId,
    meta: params.meta,
  });
  if (!created) {
    return { created: false };
  }

  params.onCreated?.({ code });

  const replyText =
    params.buildReplyText?.({
      code,
      senderIdLine: params.senderIdLine,
    }) ??
    buildPairingReply({
      channel: params.channel,
      idLine: params.senderIdLine,
      code,
    });

  try {
    await params.sendPairingReply(replyText);
  } catch (error) {
    params.onReplyError?.(error);
  }

  return { created: true, code };
}
