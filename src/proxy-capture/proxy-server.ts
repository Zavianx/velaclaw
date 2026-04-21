export async function startDebugProxyServer(): Promise<{
  close: () => Promise<void>;
  port: null;
}> {
  return {
    close: async () => {},
    port: null,
  };
}
