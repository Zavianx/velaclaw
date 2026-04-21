export async function cleanupBrowserSessionsForLifecycleEnd(_params?: {
  sessionKeys?: string[];
  onWarn?: (msg: string) => void;
}): Promise<void> {
  // Browser lifecycle cleanup is unavailable in this slimmed Velaclaw build.
}
