// TTS runtime stub — the full implementation was removed during the main
// history cleanup. Keep the exported shape so callers compile.

export async function maybeApplyTtsToPayload(
  payload: unknown,
  _context?: unknown,
): Promise<unknown> {
  return payload;
}
