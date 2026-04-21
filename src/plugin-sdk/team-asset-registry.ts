// Public surface for registering team asset types from plugins.
//
// Velaclaw ships five built-in asset types (shared-memory / shared-skills /
// shared-tools / shared-workflows / shared-docs). Plugins can extend this set
// at runtime with their own `family.concept` identifiers (for example
// `policy.security`, `dataset.eval`, `profile.agent`) without patching core.
//
// Usage:
//   import { registerTeamAssetType } from "velaclaw/plugin-sdk/team-asset-registry";
//   registerTeamAssetType({
//     id: "policy.security",
//     label: "Security Policy",
//     family: "config",
//     defaultFormat: "yaml",
//     fileExtension: ".yaml",
//     filenamePrefix: "policy",
//     assetServerKind: "policies",
//     defaultCapabilityRole: "reference",
//     defaultConsumptionMode: "reference",
//     materializationTargets: ["workspace.config.overlay"],
//   });
//
// Built-in ids cannot be overridden; attempts throw
// `TeamAssetTypeRegistrationError`.

export {
  isBuiltinTeamAssetType,
  listBuiltinTeamAssetTypes,
  listRegisteredTeamAssetTypes,
  registerTeamAssetType,
  TeamAssetTypeRegistrationError,
  unregisterTeamAssetType,
} from "../velaclaw/asset-types.js";

export type {
  AssetCapabilityRole,
  AssetConsumptionMode,
  AssetMaterializationTarget,
  AssetServerKind,
  TeamAssetCategory,
  TeamAssetFamily,
  TeamAssetFormat,
  TeamAssetTypeSpec,
} from "../velaclaw/types.js";
