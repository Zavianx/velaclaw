import type { MemoryPluginRuntime } from "velaclaw/plugin-sdk/memory-core-host-runtime-core";
import { resolveMemoryBackendConfig } from "velaclaw/plugin-sdk/memory-core-host-runtime-files";
import { closeAllMemorySearchManagers, getMemorySearchManager } from "./memory/index.js";

export const memoryRuntime: MemoryPluginRuntime = {
  async getMemorySearchManager(params) {
    const { manager, error } = await getMemorySearchManager(params);
    return {
      manager,
      error,
    };
  },
  resolveMemoryBackendConfig(params) {
    return resolveMemoryBackendConfig(params);
  },
  async closeAllMemorySearchManagers() {
    await closeAllMemorySearchManagers();
  },
};
