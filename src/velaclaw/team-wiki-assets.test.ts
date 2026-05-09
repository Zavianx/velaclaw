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
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "velaclaw-team-wiki-assets-"));
  roots.push(root);
  vi.stubEnv("VELACLAW_ROOT", root);
  vi.stubEnv("VELACLAW_TEST_FAST", "1");
  vi.resetModules();
  return await import("./data.js");
}

async function writeWikiDigest(vaultPath: string) {
  await fs.mkdir(path.join(vaultPath, ".velaclaw-wiki", "cache"), { recursive: true });
  await fs.writeFile(
    path.join(vaultPath, ".velaclaw-wiki", "cache", "agent-digest.json"),
    `${JSON.stringify({
      pages: [
        {
          id: "synthesis.release-readiness",
          title: "Release Readiness",
          kind: "synthesis",
          path: "syntheses/release-readiness.md",
          sourceIds: ["source.bridge.memory"],
          questions: [],
          contradictions: [],
        },
        {
          id: "concept.release-runbook",
          title: "Release Runbook",
          kind: "concept",
          path: "concepts/release-runbook.md",
          sourceIds: ["source.bridge.memory"],
          questions: [],
          contradictions: [],
        },
        {
          id: "synthesis.architecture-notes",
          title: "Architecture Notes",
          kind: "synthesis",
          path: "syntheses/architecture-notes.md",
          sourceIds: ["source.bridge.memory"],
          questions: [],
          contradictions: [],
        },
        {
          id: "synthesis.contested",
          title: "Contested Knowledge",
          kind: "synthesis",
          path: "syntheses/contested.md",
          sourceIds: ["source.bridge.memory"],
          questions: [],
          contradictions: [],
        },
        {
          id: "synthesis.stale",
          title: "Stale Knowledge",
          kind: "synthesis",
          path: "syntheses/stale.md",
          sourceIds: ["source.bridge.memory"],
          questions: [],
          contradictions: [],
        },
        {
          id: "synthesis.low-confidence",
          title: "Low Confidence Knowledge",
          kind: "synthesis",
          path: "syntheses/low-confidence.md",
          sourceIds: ["source.bridge.memory"],
          questions: [],
          contradictions: [],
        },
        {
          id: "synthesis.no-evidence",
          title: "No Evidence Knowledge",
          kind: "synthesis",
          path: "syntheses/no-evidence.md",
          sourceIds: [],
          questions: [],
          contradictions: [],
        },
        {
          id: "source.raw-notes",
          title: "Raw Notes",
          kind: "source",
          path: "sources/raw-notes.md",
          sourceIds: ["source.bridge.memory"],
          questions: [],
          contradictions: [],
        },
      ],
    })}\n`,
    "utf8",
  );
  await fs.writeFile(
    path.join(vaultPath, ".velaclaw-wiki", "cache", "claims.jsonl"),
    [
      JSON.stringify({
        id: "claim.release.ready",
        pageId: "synthesis.release-readiness",
        pageTitle: "Release Readiness",
        pageKind: "synthesis",
        pagePath: "syntheses/release-readiness.md",
        text: "Use the release readiness checklist before publishing.",
        status: "active",
        confidence: 0.92,
        sourceIds: ["source.bridge.memory"],
        freshnessLevel: "fresh",
      }),
      JSON.stringify({
        id: "claim.release.runbook",
        pageId: "concept.release-runbook",
        pageTitle: "Release Runbook",
        pageKind: "concept",
        pagePath: "concepts/release-runbook.md",
        text: "Runbook steps should include rollback owner and publish window.",
        status: "active",
        confidence: 0.88,
        sourceIds: ["source.bridge.memory"],
        freshnessLevel: "aging",
      }),
      JSON.stringify({
        id: "claim.architecture.notes",
        pageId: "synthesis.architecture-notes",
        pageTitle: "Architecture Notes",
        pageKind: "synthesis",
        pagePath: "syntheses/architecture-notes.md",
        text: "The gateway stores durable team decisions as reviewed shared assets.",
        status: "active",
        confidence: 0.86,
        sourceIds: ["source.bridge.memory"],
        freshnessLevel: "fresh",
      }),
      JSON.stringify({
        id: "claim.contested",
        pageId: "synthesis.contested",
        pageTitle: "Contested Knowledge",
        pageKind: "synthesis",
        pagePath: "syntheses/contested.md",
        text: "This contested claim must not become shared knowledge.",
        status: "contested",
        confidence: 0.95,
        sourceIds: ["source.bridge.memory"],
        freshnessLevel: "fresh",
      }),
      JSON.stringify({
        id: "claim.stale",
        pageId: "synthesis.stale",
        pageTitle: "Stale Knowledge",
        pageKind: "synthesis",
        pagePath: "syntheses/stale.md",
        text: "Stale wiki claims should stay out of team assets.",
        status: "active",
        confidence: 0.9,
        sourceIds: ["source.bridge.memory"],
        freshnessLevel: "stale",
      }),
      JSON.stringify({
        id: "claim.low-confidence",
        pageId: "synthesis.low-confidence",
        pageTitle: "Low Confidence Knowledge",
        pageKind: "synthesis",
        pagePath: "syntheses/low-confidence.md",
        text: "Low confidence claims should stay out of team assets.",
        status: "active",
        confidence: 0.4,
        sourceIds: ["source.bridge.memory"],
        freshnessLevel: "fresh",
      }),
      JSON.stringify({
        id: "claim.no-evidence",
        pageId: "synthesis.no-evidence",
        pageTitle: "No Evidence Knowledge",
        pageKind: "synthesis",
        pagePath: "syntheses/no-evidence.md",
        text: "Claims without source ids should stay out of team assets.",
        status: "active",
        confidence: 0.9,
        sourceIds: [],
        freshnessLevel: "fresh",
      }),
      JSON.stringify({
        id: "claim.raw-notes",
        pageId: "source.raw-notes",
        pageTitle: "Raw Notes",
        pageKind: "source",
        pagePath: "sources/raw-notes.md",
        text: "Source pages should not be proposed directly.",
        status: "active",
        confidence: 0.9,
        sourceIds: ["source.bridge.memory"],
        freshnessLevel: "fresh",
      }),
    ].join("\n") + "\n",
    "utf8",
  );
}

describe("team wiki asset proposals", () => {
  it("proposes safe wiki knowledge and keeps it pending review", async () => {
    const data = await loadTeamDataForTempRoot();
    const vaultPath = await fs.mkdtemp(path.join(os.tmpdir(), "velaclaw-wiki-vault-"));
    roots.push(vaultPath);
    await writeWikiDigest(vaultPath);
    await data.createTeam({ name: "Product Team", slug: "product-team" });

    const result = await data.proposeTeamAssetsFromWikiDigest({
      teamSlug: "product-team",
      vaultPath,
    });

    expect(result.proposedCount).toBe(3);
    expect(result.skippedCount).toBe(5);
    expect(result.proposals.map((asset) => asset.status)).toEqual([
      "pending_approval",
      "pending_approval",
      "pending_approval",
    ]);
    expect(result.proposals.map((asset) => asset.submittedBy)).toEqual([
      "system-wiki",
      "system-wiki",
      "system-wiki",
    ]);
    expect(result.proposals.map((asset) => asset.category).toSorted()).toEqual([
      "shared-memory",
      "shared-workflows",
      "shared-workflows",
    ]);
    expect(result.skipped.map((entry) => entry.reason).toSorted()).toEqual([
      "no-safe-claims",
      "no-safe-claims",
      "no-safe-claims",
      "no-safe-claims",
      "unsupported-page-kind",
    ]);
    expect(result.proposals[0]?.currentPath).toBeUndefined();
    expect(result.proposals[0]?.publishedPath).toBeUndefined();
  });

  it("does not duplicate proposals from the same wiki page", async () => {
    const data = await loadTeamDataForTempRoot();
    const vaultPath = await fs.mkdtemp(path.join(os.tmpdir(), "velaclaw-wiki-vault-"));
    roots.push(vaultPath);
    await writeWikiDigest(vaultPath);
    await data.createTeam({ name: "Product Team", slug: "product-team" });

    await data.proposeTeamAssetsFromWikiDigest({ teamSlug: "product-team", vaultPath });
    const second = await data.proposeTeamAssetsFromWikiDigest({
      teamSlug: "product-team",
      vaultPath,
    });

    expect(second.proposedCount).toBe(0);
    expect(second.skippedCount).toBe(8);
    expect(second.skipped.some((entry) => entry.reason === "duplicate")).toBe(true);
  });
});
