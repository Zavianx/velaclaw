// Line plugin SDK stub — the Line extension was removed during the main
// history cleanup. Keep these helpers so plugin-surface tests and contract
// harnesses still compile; runtime callers receive empty results.

export function listLineAccountIds(_cfg?: unknown): string[] {
  return [];
}

export function resolveDefaultLineAccountId(_cfg?: unknown): string | undefined {
  return undefined;
}

export function resolveLineAccount(_args?: { cfg?: unknown; accountId?: string }): unknown {
  return undefined;
}
