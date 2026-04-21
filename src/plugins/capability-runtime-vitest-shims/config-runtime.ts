import { resolveActiveTalkProviderConfig } from "../../config/talk.js";
import type { VelaclawConfig } from "../../config/types.js";

export { resolveActiveTalkProviderConfig };

export function getRuntimeConfigSnapshot(): VelaclawConfig | null {
  return null;
}
