import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { ensureVelaclawWorkspaceInitialized } from "./workspace.js";

const roots: string[] = [];

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => fs.rm(root, { recursive: true, force: true })));
});

describe("ensureVelaclawWorkspaceInitialized", () => {
  it("seeds managed member-template local plugins for provisioned member runtimes", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "velaclaw-workspace-test-"));
    roots.push(root);

    await ensureVelaclawWorkspaceInitialized(root);

    for (const pluginId of [
      "member-quota-guard",
      "shared-asset-injector",
      "member-runtime-upgrader",
    ]) {
      const pluginRoot = path.join(
        root,
        "members",
        "member-template",
        "runtime",
        "config",
        "local-plugins",
        pluginId,
      );
      expect((await fs.stat(path.join(pluginRoot, "velaclaw.plugin.json"))).isFile()).toBe(true);
      expect((await fs.stat(path.join(pluginRoot, "index.js"))).isFile()).toBe(true);
    }
  });
});
