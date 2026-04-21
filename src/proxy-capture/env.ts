export function resolveDebugProxySettings(
  ..._args: unknown[]
): { enabled: boolean; proxyUrl?: string } | null {
  return null;
}

export function applyDebugProxyEnv<T extends NodeJS.ProcessEnv>(env: T): T {
  return env;
}

export function createDebugProxyWebSocketAgent(..._args: unknown[]): undefined {
  return undefined;
}

export function resolveEffectiveDebugProxyUrl(configuredProxyUrl?: string): string | undefined {
  const explicit = configuredProxyUrl?.trim();
  return explicit || undefined;
}
