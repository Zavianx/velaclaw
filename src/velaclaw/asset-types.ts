import type {
  AssetConsumptionMode,
  AssetMaterializationTarget,
  AssetServerKind,
  TeamAssetCategory,
  TeamAssetFamily,
  TeamAssetFormat,
  TeamAssetTypeSpec,
} from "./types.js";

const BUILTIN_TEAM_ASSET_TYPES: readonly TeamAssetTypeSpec[] = [
  {
    id: "shared-memory",
    label: "Shared Memory",
    family: "knowledge",
    defaultFormat: "md",
    fileExtension: ".md",
    filenamePrefix: "memory",
    assetServerKind: "memory",
    defaultCapabilityRole: "knowledge",
    defaultConsumptionMode: "retrieval",
    materializationTargets: ["prompt.prepend", "workspace.docs.active"],
  },
  {
    id: "shared-skills",
    label: "Shared Skills",
    family: "capability",
    defaultFormat: "md",
    fileExtension: ".md",
    filenamePrefix: "skill",
    assetServerKind: "skills",
    defaultCapabilityRole: "instruction",
    defaultConsumptionMode: "skill",
    materializationTargets: ["workspace.skills.active"],
  },
  {
    id: "shared-tools",
    label: "Shared Tools",
    family: "config",
    defaultFormat: "json",
    fileExtension: ".json",
    filenamePrefix: "tool",
    assetServerKind: "tools",
    defaultCapabilityRole: "integration",
    defaultConsumptionMode: "integration",
    materializationTargets: ["workspace.config.overlay"],
  },
  {
    id: "shared-workflows",
    label: "Shared Workflows",
    family: "process",
    defaultFormat: "md",
    fileExtension: ".md",
    filenamePrefix: "workflow",
    assetServerKind: "workflows",
    defaultCapabilityRole: "process",
    defaultConsumptionMode: "workflow",
    materializationTargets: ["prompt.prepend", "workspace.docs.active"],
  },
  {
    id: "shared-docs",
    label: "Shared Docs",
    family: "knowledge",
    defaultFormat: "md",
    fileExtension: ".md",
    filenamePrefix: "doc",
    assetServerKind: "docs",
    defaultCapabilityRole: "reference",
    defaultConsumptionMode: "reference",
    materializationTargets: ["prompt.prepend", "workspace.docs.active"],
  },
] as const;

const DEFAULT_FALLBACK_MATERIALIZATION_TARGETS = ["workspace.docs.active"] as const;

const assetTypeSpecsById = new Map<TeamAssetCategory, TeamAssetTypeSpec>(
  BUILTIN_TEAM_ASSET_TYPES.map(
    (spec) => [spec.id, spec] satisfies [TeamAssetCategory, TeamAssetTypeSpec],
  ),
);

const builtinAssetTypeIds: ReadonlySet<TeamAssetCategory> = new Set(
  BUILTIN_TEAM_ASSET_TYPES.map((spec) => spec.id),
);

const userAssetTypeIds = new Set<TeamAssetCategory>();

function inferFallbackFormat(category: string): TeamAssetFormat {
  const normalized = category.trim().toLowerCase();
  if (normalized.includes("tool") || normalized.includes("config")) {
    return "json";
  }
  return "md";
}

function inferFallbackFileExtension(format: TeamAssetFormat): string {
  switch (format) {
    case "json":
      return ".json";
    case "yaml":
      return ".yaml";
    case "bundle":
      return ".bundle";
    default:
      return ".md";
  }
}

function inferFallbackFamily(category: string): TeamAssetFamily {
  const normalized = category.trim().toLowerCase();
  if (normalized.includes("workflow") || normalized.includes("process")) {
    return "process";
  }
  if (normalized.includes("skill") || normalized.includes("capability")) {
    return "capability";
  }
  if (
    normalized.includes("tool") ||
    normalized.includes("config") ||
    normalized.includes("policy") ||
    normalized.includes("policies")
  ) {
    return "config";
  }
  if (
    normalized.includes("dataset") ||
    normalized.includes("eval") ||
    normalized.includes("benchmark")
  ) {
    return "data";
  }
  return "knowledge";
}

function inferFallbackConsumptionMode(family: TeamAssetFamily): AssetConsumptionMode {
  switch (family) {
    case "process":
      return "workflow";
    case "capability":
      return "skill";
    case "config":
      return "integration";
    default:
      return "retrieval";
  }
}

function inferFallbackCapabilityRole(
  family: TeamAssetFamily,
): TeamAssetTypeSpec["defaultCapabilityRole"] {
  switch (family) {
    case "process":
      return "process";
    case "capability":
      return "instruction";
    case "config":
      return "integration";
    default:
      return "knowledge";
  }
}

function inferFallbackFilenamePrefix(category: string): string {
  const normalized = category
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return normalized || "asset";
}

function inferFallbackMaterializationTargets(
  family: TeamAssetFamily,
): AssetMaterializationTarget[] {
  if (family === "capability") {
    return ["workspace.skills.active"];
  }
  if (family === "config") {
    return ["workspace.config.overlay"];
  }
  return [...DEFAULT_FALLBACK_MATERIALIZATION_TARGETS];
}

export function listBuiltinTeamAssetTypes(): TeamAssetTypeSpec[] {
  return [...BUILTIN_TEAM_ASSET_TYPES];
}

export function listRegisteredTeamAssetTypes(): TeamAssetTypeSpec[] {
  return [...assetTypeSpecsById.values()];
}

export function resolveKnownTeamAssetTypeSpec(
  category: TeamAssetCategory,
): TeamAssetTypeSpec | undefined {
  return assetTypeSpecsById.get(category);
}

export class TeamAssetTypeRegistrationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TeamAssetTypeRegistrationError";
  }
}

function normalizeAssetTypeId(id: unknown): string {
  if (typeof id !== "string") {
    throw new TeamAssetTypeRegistrationError("asset type id must be a non-empty string");
  }
  const trimmed = id.trim();
  if (!trimmed) {
    throw new TeamAssetTypeRegistrationError("asset type id must be a non-empty string");
  }
  return trimmed;
}

export function registerTeamAssetType(
  spec: TeamAssetTypeSpec,
  options?: { replace?: boolean },
): TeamAssetTypeSpec {
  const id = normalizeAssetTypeId(spec.id);
  if (builtinAssetTypeIds.has(id)) {
    throw new TeamAssetTypeRegistrationError(
      `cannot override built-in asset type "${id}"; choose a different id`,
    );
  }
  const existing = assetTypeSpecsById.get(id);
  if (existing && existing !== spec && !options?.replace) {
    throw new TeamAssetTypeRegistrationError(
      `asset type "${id}" already registered; pass { replace: true } to override`,
    );
  }
  const normalized: TeamAssetTypeSpec = { ...spec, id };
  assetTypeSpecsById.set(id, normalized);
  userAssetTypeIds.add(id);
  return normalized;
}

export function unregisterTeamAssetType(id: TeamAssetCategory): boolean {
  const normalized = normalizeAssetTypeId(id);
  if (builtinAssetTypeIds.has(normalized)) {
    throw new TeamAssetTypeRegistrationError(
      `cannot unregister built-in asset type "${normalized}"`,
    );
  }
  if (!userAssetTypeIds.has(normalized)) {
    return false;
  }
  userAssetTypeIds.delete(normalized);
  return assetTypeSpecsById.delete(normalized);
}

export function clearRegisteredTeamAssetTypes(): void {
  for (const id of userAssetTypeIds) {
    assetTypeSpecsById.delete(id);
  }
  userAssetTypeIds.clear();
}

export function isBuiltinTeamAssetType(id: TeamAssetCategory): boolean {
  return builtinAssetTypeIds.has(id);
}

export function resolveTeamAssetTypeRuntime(category: TeamAssetCategory): TeamAssetTypeSpec {
  const known = resolveKnownTeamAssetTypeSpec(category);
  if (known) {
    return known;
  }

  const family = inferFallbackFamily(category);
  const format = inferFallbackFormat(category);
  return {
    id: category,
    label: category,
    family,
    defaultFormat: format,
    fileExtension: inferFallbackFileExtension(format),
    filenamePrefix: inferFallbackFilenamePrefix(category),
    defaultCapabilityRole: inferFallbackCapabilityRole(family),
    defaultConsumptionMode: inferFallbackConsumptionMode(family),
    materializationTargets: inferFallbackMaterializationTargets(family),
  };
}

export function listDefaultAssetServerKinds(): AssetServerKind[] {
  const out = new Set<AssetServerKind>();
  for (const spec of assetTypeSpecsById.values()) {
    if (spec.assetServerKind) {
      out.add(spec.assetServerKind);
    }
  }
  return [...out];
}

export function buildAssetServerKindList(
  extraKinds?: Iterable<AssetServerKind | null | undefined>,
): AssetServerKind[] {
  const out = new Set<AssetServerKind>(listDefaultAssetServerKinds());
  for (const kind of extraKinds ?? []) {
    if (typeof kind === "string" && kind.trim()) {
      out.add(kind);
    }
  }
  return [...out];
}
