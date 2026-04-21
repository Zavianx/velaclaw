export class DebugProxyCaptureStore {
  async close(): Promise<void> {
    // No-op stub.
  }
}

export async function getDebugProxyCaptureStore(): Promise<DebugProxyCaptureStore> {
  return new DebugProxyCaptureStore();
}

export async function closeDebugProxyCaptureStore(): Promise<void> {
  // No-op stub.
}
