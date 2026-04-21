export function buildPairingReply(params: {
  channel?: string;
  id?: string;
  idLine?: string;
  code?: string;
  idLabel?: string;
}) {
  const channel = params.channel ?? "channel";
  const idLabel = params.idLabel ?? "id";
  const id = params.id ?? "unknown";
  const idLine = params.idLine?.trim();
  const code = params.code ?? "unknown";
  return [
    `Access not configured for ${channel}.`,
    "",
    idLine || `${idLabel}: ${id}`,
    `Pairing code: ${code}`,
  ].join("\n");
}
