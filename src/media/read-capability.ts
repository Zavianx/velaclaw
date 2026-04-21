export function canReadMedia(): boolean {
  return true;
}

export function resolveAgentScopedOutboundMediaAccess(_params?: Record<string, unknown>): "read" {
  return "read";
}
