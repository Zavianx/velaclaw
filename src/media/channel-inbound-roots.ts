export function resolveChannelInboundRoots(): string[] {
  return [];
}

export function resolveChannelInboundAttachmentRoots(
  ..._args: unknown[]
): string[] {
  return resolveChannelInboundRoots();
}

export function resolveChannelRemoteInboundAttachmentRoots(
  ..._args: unknown[]
): string[] {
  return [];
}
