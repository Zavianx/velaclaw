// LM Studio runtime helper stubs. The full implementation was removed from
// the main tree; keep the exported surface so plugins and tests that still
// reference the module continue to compile. Runtime helpers are no-ops.

export async function ensureLmstudioModelLoaded(..._args: unknown[]): Promise<void> {
  // no-op
}

export async function resolveLmstudioRuntimeApiKey(
  ..._args: unknown[]
): Promise<string | undefined> {
  return undefined;
}

export function normalizeLmstudioProviderConfig(_provider?: unknown): unknown {
  return undefined;
}
