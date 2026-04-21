export async function ensureDebugProxyCa(): Promise<{
  certPath: string | null;
  keyPath: string | null;
}> {
  return {
    certPath: null,
    keyPath: null,
  };
}
