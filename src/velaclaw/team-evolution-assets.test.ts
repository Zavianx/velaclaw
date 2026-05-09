import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

const roots: string[] = [];

afterEach(async () => {
  vi.unstubAllEnvs();
  vi.resetModules();
  await Promise.all(roots.splice(0).map((root) => fs.rm(root, { recursive: true, force: true })));
});

async function loadTeamDataForTempRoot() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "velaclaw-team-evolution-"));
  roots.push(root);
  vi.stubEnv("VELACLAW_ROOT", root);
  vi.stubEnv("VELACLAW_TEST_FAST", "1");
  vi.resetModules();
  return await import("./data.js");
}

describe("team evolution asset proposals", () => {
  it("keeps system-evolution generated assets in the review queue", async () => {
    const data = await loadTeamDataForTempRoot();
    await data.createTeam({ name: "Product Team", slug: "product-team" });

    const result = await data.createTeamAssetProposal({
      teamSlug: "product-team",
      category: "shared-memory",
      title: "[Auto] Incident rollback order",
      content: "Reusable rollback order from anonymized session summaries.",
      submittedByMemberId: "system-evolution",
      sourceZone: "collab",
    });

    expect(result.asset.status).toBe("pending_approval");
    expect(result.asset.approvalRequired).toBe(true);
    expect(result.asset.approvedAt).toBeUndefined();
    expect(result.asset.publishedAt).toBeUndefined();
    expect(result.asset.currentPath).toBeUndefined();
    expect(result.asset.publishedPath).toBeUndefined();
  });
});
