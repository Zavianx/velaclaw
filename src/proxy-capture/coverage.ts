export function maybeWarnAboutDebugProxyCoverage(): void {
  // No-op stub restored to keep CLI startup functional in the slimmed tree.
}

export function buildDebugProxyCoverageReport(): {
  ok: true;
  enabled: false;
  summary: string;
} {
  return {
    ok: true,
    enabled: false,
    summary: "Debug proxy capture is unavailable in this build.",
  };
}
