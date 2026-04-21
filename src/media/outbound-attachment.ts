export function buildOutboundAttachmentDescriptor(): null {
  return null;
}

export async function resolveOutboundAttachmentFromUrl(
  mediaUrl: string,
  _maxBytes: number,
  _options?: Record<string, unknown>,
): Promise<{ path: string; contentType?: string }> {
  return {
    path: mediaUrl,
    contentType: undefined,
  };
}
