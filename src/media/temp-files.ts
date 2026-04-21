import os from "node:os";
import path from "node:path";

export function resolveMediaTempDir(): string {
  return path.join(os.tmpdir(), "velaclaw-media");
}
