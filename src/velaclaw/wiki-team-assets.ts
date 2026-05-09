import fs from "node:fs/promises";
import path from "node:path";
import type {
  CreateAssetProposalInput,
  TeamAssetCategory,
  TeamAssetRecord,
  TeamAssetSourceZone,
} from "./types.js";

const AGENT_DIGEST_PATH = path.join(".velaclaw-wiki", "cache", "agent-digest.json");
const CLAIMS_DIGEST_PATH = path.join(".velaclaw-wiki", "cache", "claims.jsonl");
const SYSTEM_WIKI_ACTOR = "system-wiki";
const DEFAULT_MIN_CONFIDENCE = 0.7;

type WikiDigestPage = {
  id?: string;
  title: string;
  kind: string;
  path: string;
  sourceIds?: string[];
  questions?: string[];
  contradictions?: string[];
};

type WikiDigestClaim = {
  id?: string;
  pageId?: string;
  pageTitle?: string;
  pageKind?: string;
  pagePath: string;
  text: string;
  status?: string;
  confidence?: number;
  sourceIds?: string[];
  freshnessLevel?: string;
  lastTouchedAt?: string;
};

export type TeamWikiAssetProposalSkipped = {
  pagePath: string;
  title: string;
  reason:
    | "duplicate"
    | "unsupported-page-kind"
    | "missing-page-fields"
    | "no-safe-claims"
    | "proposal-failed";
  detail?: string;
};

export type TeamWikiAssetProposalResult = {
  teamSlug: string;
  vaultPath: string;
  proposedCount: number;
  skippedCount: number;
  proposals: TeamAssetRecord[];
  skipped: TeamWikiAssetProposalSkipped[];
  warnings: string[];
};

type TeamWikiAssetProposalDeps = {
  existingAssets: TeamAssetRecord[];
  createProposal: (input: CreateAssetProposalInput) => Promise<{ asset: TeamAssetRecord }>;
};

export type ProposeTeamAssetsFromWikiDigestInput = {
  teamSlug: string;
  vaultPath: string;
  minConfidence?: number;
  sourceZone?: TeamAssetSourceZone;
};

type WikiDigestBundle = {
  pages: WikiDigestPage[];
  claims: WikiDigestClaim[];
  warnings: string[];
};

function normalizeOptionalString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function buildWikiSourceMarker(pagePath: string): string {
  return `wiki-source:${pagePath}`;
}

function isKnownBadClaimStatus(status: string | undefined): boolean {
  const normalized = normalizeOptionalString(status).toLowerCase();
  return (
    normalized === "contested" ||
    normalized === "contradicted" ||
    normalized === "rejected" ||
    normalized === "deprecated"
  );
}

function isFreshEnough(value: string | undefined): boolean {
  const normalized = normalizeOptionalString(value).toLowerCase();
  return normalized === "" || normalized === "fresh" || normalized === "aging";
}

function isSafeClaim(claim: WikiDigestClaim, minConfidence: number): boolean {
  if (!claim.text.trim()) {
    return false;
  }
  if (typeof claim.confidence === "number" && claim.confidence < minConfidence) {
    return false;
  }
  if (isKnownBadClaimStatus(claim.status)) {
    return false;
  }
  if (!isFreshEnough(claim.freshnessLevel)) {
    return false;
  }
  return Array.isArray(claim.sourceIds) && claim.sourceIds.some((sourceId) => sourceId.trim());
}

function inferAssetCategory(page: WikiDigestPage, claims: WikiDigestClaim[]): TeamAssetCategory {
  if (page.kind === "entity") {
    return "shared-docs";
  }
  const searchable = [page.title, page.id ?? "", ...claims.map((claim) => claim.text)]
    .join(" ")
    .toLowerCase();
  if (/\b(workflow|process|checklist|runbook|playbook|procedure|steps?)\b/.test(searchable)) {
    return "shared-workflows";
  }
  return "shared-memory";
}

function renderProposalContent(params: {
  page: WikiDigestPage;
  claims: WikiDigestClaim[];
  vaultPath: string;
}): string {
  const sourceIds = Array.from(
    new Set([
      ...(params.page.sourceIds ?? []),
      ...params.claims.flatMap((claim) => claim.sourceIds ?? []),
    ]),
  ).filter(Boolean);
  const lines = [
    `<!-- velaclaw:wiki-source path="${params.page.path}" -->`,
    `# ${params.page.title}`,
    "",
    "## Wiki Source",
    `- Vault: \`${params.vaultPath}\``,
    `- Page: \`${params.page.path}\``,
    ...(params.page.id ? [`- Page ID: \`${params.page.id}\``] : []),
    ...(sourceIds.length > 0
      ? [`- Evidence sources: ${sourceIds.map((id) => `\`${id}\``).join(", ")}`]
      : []),
    "",
    "## Selected Claims",
    ...params.claims.map((claim) => {
      const details = [
        claim.id ? `id=${claim.id}` : null,
        typeof claim.confidence === "number" ? `confidence=${claim.confidence.toFixed(2)}` : null,
        claim.freshnessLevel ? `freshness=${claim.freshnessLevel}` : null,
      ].filter(Boolean);
      return `- ${claim.text}${details.length > 0 ? ` (${details.join(", ")})` : ""}`;
    }),
    "",
    "## Review Notes",
    "- Generated from the compiled memory wiki digest.",
    "- Review before publishing to team shared assets.",
  ];
  return `${lines.join("\n")}\n`;
}

async function readAgentDigest(vaultPath: string, warnings: string[]): Promise<WikiDigestPage[]> {
  const digestPath = path.join(vaultPath, AGENT_DIGEST_PATH);
  try {
    const parsed = JSON.parse(await fs.readFile(digestPath, "utf8")) as { pages?: unknown };
    return Array.isArray(parsed.pages)
      ? parsed.pages.flatMap((page): WikiDigestPage[] => {
          if (!page || typeof page !== "object") {
            return [];
          }
          const record = page as Record<string, unknown>;
          const title = normalizeOptionalString(record.title);
          const kind = normalizeOptionalString(record.kind);
          const pagePath = normalizeOptionalString(record.path);
          if (!title || !kind || !pagePath) {
            return [];
          }
          return [
            {
              id: normalizeOptionalString(record.id) || undefined,
              title,
              kind,
              path: pagePath,
              sourceIds: Array.isArray(record.sourceIds)
                ? record.sourceIds.flatMap((value) => {
                    const normalized = normalizeOptionalString(value);
                    return normalized ? [normalized] : [];
                  })
                : [],
              questions: Array.isArray(record.questions) ? record.questions.map(String) : [],
              contradictions: Array.isArray(record.contradictions)
                ? record.contradictions.map(String)
                : [],
            },
          ];
        })
      : [];
  } catch (error) {
    warnings.push(
      `Could not read wiki agent digest: ${error instanceof Error ? error.message : String(error)}`,
    );
    return [];
  }
}

async function readClaimsDigest(vaultPath: string, warnings: string[]): Promise<WikiDigestClaim[]> {
  const claimsPath = path.join(vaultPath, CLAIMS_DIGEST_PATH);
  try {
    const raw = await fs.readFile(claimsPath, "utf8");
    const claims: WikiDigestClaim[] = [];
    for (const [index, line] of raw.split(/\r?\n/).entries()) {
      const trimmed = line.trim();
      if (!trimmed) {
        continue;
      }
      try {
        const parsed = JSON.parse(trimmed) as Record<string, unknown>;
        const pagePath = normalizeOptionalString(parsed.pagePath);
        const text = normalizeOptionalString(parsed.text);
        if (!pagePath || !text) {
          continue;
        }
        claims.push({
          id: normalizeOptionalString(parsed.id) || undefined,
          pageId: normalizeOptionalString(parsed.pageId) || undefined,
          pageTitle: normalizeOptionalString(parsed.pageTitle) || undefined,
          pageKind: normalizeOptionalString(parsed.pageKind) || undefined,
          pagePath,
          text,
          status: normalizeOptionalString(parsed.status) || undefined,
          confidence:
            typeof parsed.confidence === "number" && Number.isFinite(parsed.confidence)
              ? parsed.confidence
              : undefined,
          sourceIds: Array.isArray(parsed.sourceIds)
            ? parsed.sourceIds.flatMap((value) => {
                const normalized = normalizeOptionalString(value);
                return normalized ? [normalized] : [];
              })
            : [],
          freshnessLevel: normalizeOptionalString(parsed.freshnessLevel) || undefined,
          lastTouchedAt: normalizeOptionalString(parsed.lastTouchedAt) || undefined,
        });
      } catch (error) {
        warnings.push(
          `Could not parse wiki claim line ${index + 1}: ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
      }
    }
    return claims;
  } catch (error) {
    warnings.push(
      `Could not read wiki claims digest: ${error instanceof Error ? error.message : String(error)}`,
    );
    return [];
  }
}

async function readWikiDigestBundle(vaultPath: string): Promise<WikiDigestBundle> {
  const warnings: string[] = [];
  const [pages, claims] = await Promise.all([
    readAgentDigest(vaultPath, warnings),
    readClaimsDigest(vaultPath, warnings),
  ]);
  return { pages, claims, warnings };
}

function hasExistingWikiProposal(existingAssets: TeamAssetRecord[], pagePath: string): boolean {
  const marker = buildWikiSourceMarker(pagePath);
  return existingAssets.some((asset) => asset.note?.includes(marker));
}

export async function proposeTeamAssetsFromWikiDigestWithDeps(
  input: ProposeTeamAssetsFromWikiDigestInput,
  deps: TeamWikiAssetProposalDeps,
): Promise<TeamWikiAssetProposalResult> {
  const vaultPath = path.resolve(input.vaultPath);
  const minConfidence = input.minConfidence ?? DEFAULT_MIN_CONFIDENCE;
  const digest = await readWikiDigestBundle(vaultPath);
  const claimsByPage = new Map<string, WikiDigestClaim[]>();
  for (const claim of digest.claims) {
    const current = claimsByPage.get(claim.pagePath) ?? [];
    current.push(claim);
    claimsByPage.set(claim.pagePath, current);
  }

  const proposals: TeamAssetRecord[] = [];
  const skipped: TeamWikiAssetProposalSkipped[] = [];

  for (const page of digest.pages) {
    if (!page.title || !page.path) {
      skipped.push({
        pagePath: page.path,
        title: page.title,
        reason: "missing-page-fields",
      });
      continue;
    }
    if (page.kind === "source" || page.kind === "report") {
      skipped.push({
        pagePath: page.path,
        title: page.title,
        reason: "unsupported-page-kind",
      });
      continue;
    }
    if (hasExistingWikiProposal(deps.existingAssets, page.path)) {
      skipped.push({ pagePath: page.path, title: page.title, reason: "duplicate" });
      continue;
    }
    const safeClaims = (claimsByPage.get(page.path) ?? []).filter((claim) =>
      isSafeClaim(claim, minConfidence),
    );
    if (safeClaims.length === 0) {
      skipped.push({ pagePath: page.path, title: page.title, reason: "no-safe-claims" });
      continue;
    }
    try {
      const category = inferAssetCategory(page, safeClaims);
      const result = await deps.createProposal({
        teamSlug: input.teamSlug,
        category,
        title: `Wiki: ${page.title}`,
        content: renderProposalContent({ page, claims: safeClaims, vaultPath }),
        submittedByMemberId: SYSTEM_WIKI_ACTOR,
        sourceZone: input.sourceZone ?? "collab",
        note: `Generated from ${buildWikiSourceMarker(page.path)}`,
      });
      proposals.push(result.asset);
      deps.existingAssets.push(result.asset);
    } catch (error) {
      skipped.push({
        pagePath: page.path,
        title: page.title,
        reason: "proposal-failed",
        detail: error instanceof Error ? error.message : String(error),
      });
    }
  }

  return {
    teamSlug: input.teamSlug,
    vaultPath,
    proposedCount: proposals.length,
    skippedCount: skipped.length,
    proposals,
    skipped,
    warnings: digest.warnings,
  };
}
