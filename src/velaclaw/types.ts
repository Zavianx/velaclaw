// Velaclaw core type definitions

export type MemberRuntimeAction = "start" | "stop" | "restart";

export type FileEntry = {
  name: string;
  path: string;
  type: "file" | "directory";
  size?: number;
};

export type AssetBucket = {
  key: string;
  label: string;
  path: string;
  exists: boolean;
  files: FileEntry[];
};

export type MemberRecordSummary = {
  id: string;
  memberEmail?: string;
  path: string;
  hasRuntime: boolean;
  hasComposeFile: boolean;
  hasConfigFile: boolean;
};

export type MemberRecord = MemberRecordSummary & {
  buckets: AssetBucket[];
};

export type ProvisionMemberInput = {
  memberId: string;
  telegramUserId?: string;
  port?: number;
  gatewayToken?: string;
  identityName?: string;
};

export type ProvisionMemberResult = {
  created: true;
  member: MemberRecord;
  port: number;
  gatewayToken: string;
  pending: string[];
  paths: {
    memberPath: string;
    composePath: string;
    configPath: string;
    secretsPath: string;
    workspacePath: string;
  };
};

export type RemoveMemberResult = {
  removed: true;
  teamSlug: string;
  memberId: string;
  removedPath: string;
  hadMemberRecord: boolean;
  hadPolicy: boolean;
  runtimeTeardown: {
    ok: boolean;
    stdout: string;
    stderr: string;
  };
};

export type QuotaStatus = "active" | "paused";
export type QuotaThinking = "low" | "medium" | "high" | "xhigh";

export type MemberQuota = {
  dailyMessages: number;
  monthlyMessages: number;
  maxSubagents: number;
  maxThinking: QuotaThinking;
  allowedModels: string[];
  status: QuotaStatus;
};

export type TeamAssetPermissions = {
  canPropose: boolean;
  canPublishWithoutApproval: boolean;
  canApprove: boolean;
  canPromote?: boolean;
};

export type TeamMemberPolicy = {
  memberId: string;
  memberEmail?: string;
  role: string;
  quota: MemberQuota;
  assetPermissions: TeamAssetPermissions;
  runtimeAccessToken?: string;
  telegramUserId?: string;
  createdAt: string;
  updatedAt: string;
  invitationId?: string;
};

export type LegacyTeamAssetCategory =
  | "shared-memory"
  | "shared-skills"
  | "shared-tools"
  | "shared-workflows"
  | "shared-docs";

export type TeamAssetCategory = LegacyTeamAssetCategory | (string & {});

export type TeamAssetStatus = "draft" | "pending_approval" | "approved" | "published" | "rejected";
export type TeamAssetSourceZone = "drafts" | "collab";

export type TeamAssetRolePolicy = {
  role: string;
  canPropose: boolean;
  publishWithoutApproval: boolean;
  canApprove: boolean;
  canPromote: boolean;
};

export type TeamAssetRecord = {
  id: string;
  teamSlug: string;
  category: TeamAssetCategory;
  title: string;
  filename: string;
  submittedBy: string;
  role: string;
  sourceZone: TeamAssetSourceZone;
  note?: string;
  submittedAt: string;
  updatedAt: string;
  status: TeamAssetStatus;
  approvalRequired: boolean;
  visibility: "team";
  /** Legacy projection path: collab/drafts category tree. Canonical source now lives under assets/items/<id>. */
  sourcePath: string;
  /** Legacy projection path reserved for approval-specific flows. */
  approvalPath?: string;
  /** Legacy published projection path. */
  publishedPath?: string;
  /** Legacy current projection path used by member mounts and compatibility readers. */
  currentPath?: string;
  releaseId?: string;
  approvedBy?: string;
  approvedAt?: string;
  rejectedBy?: string;
  rejectedAt?: string;
  rejectionReason?: string;
  publishedBy?: string;
  publishedAt?: string;
};

export type LegacyAssetServerKind = "skills" | "memory" | "workflows" | "docs";
export type AssetServerKind = LegacyAssetServerKind | (string & {});
export type TeamAssetFamily = "knowledge" | "process" | "capability" | "config" | "data";
export type TeamAssetFormat = "md" | "json" | "yaml" | "bundle";
export type AssetMaterializationTarget =
  | "prompt.prepend"
  | "workspace.docs.active"
  | "workspace.skills.active"
  | "workspace.mount"
  | "workspace.config.overlay";
export type AssetCapabilityRole =
  | "instruction"
  | "knowledge"
  | "integration"
  | "process"
  | "reference";
export type AssetConsumptionMode = "skill" | "retrieval" | "integration" | "workflow" | "reference";

export type TeamAssetTypeSpec = {
  id: TeamAssetCategory;
  label: string;
  family: TeamAssetFamily;
  defaultFormat: TeamAssetFormat;
  fileExtension: string;
  filenamePrefix: string;
  assetServerKind?: AssetServerKind;
  defaultCapabilityRole: AssetCapabilityRole;
  defaultConsumptionMode: AssetConsumptionMode;
  materializationTargets: AssetMaterializationTarget[];
};

export type AssetCapabilityProfile = {
  role: AssetCapabilityRole;
  consumptionMode: AssetConsumptionMode;
  capabilities: string[];
  tags: string[];
  activationHints: string[];
  triggerTerms: string[];
};

export type AssetServerFile = {
  path: string;
  content: string;
};

export type AssetServerItem = {
  id: string;
  kind: AssetServerKind;
  category: TeamAssetCategory;
  family: TeamAssetFamily;
  format: TeamAssetFormat;
  title: string;
  filename: string;
  updatedAt: string;
  contentHash: string;
  summary: string;
  keywords: string[];
  materializationTargets: AssetMaterializationTarget[];
  capability: AssetCapabilityProfile;
  content: string;
  files?: AssetServerFile[];
  currentPath?: string;
  publishedPath?: string;
};

export type AssetServerManifestItem = Omit<AssetServerItem, "content" | "files">;

export type AssetServerManifest = {
  team: { slug: string; name: string };
  generatedAt: string;
  manifestHash: string;
  counts: Record<AssetServerKind, number>;
  items: AssetServerManifestItem[];
};

export type AssetServerBundle = AssetServerManifest & {
  byKind: Record<AssetServerKind, AssetServerItem[]>;
};

export type AssetServerResolveMatch = AssetServerManifestItem & {
  score: number;
  matchedTerms: string[];
};

export type AssetServerResolveResult = {
  team: { slug: string; name: string };
  generatedAt: string;
  query: string;
  matches: Record<AssetServerKind, AssetServerResolveMatch[]>;
  debug?: {
    routerMode?: string;
    fallback?: boolean;
    fallbackReason?: string;
    needsAssets?: boolean;
    searchQueries?: string[];
    candidateCount?: number;
    selected?: Array<{ id: string; confidence?: number; reason?: string }>;
  };
};

export type TeamProfile = {
  name: string;
  slug: string;
  description: string;
  managerLabel: string;
  inviteBasePath: string;
  createdAt: string;
  updatedAt: string;
};

export type TeamModelGatewayMode = "native" | "proxy";

export type TeamModelGateway = {
  enabled: boolean;
  mode?: TeamModelGatewayMode;
  providerId: string;
  nativeProviderId?: string;
  nativeApiKeyEnv?: string;
  upstreamBaseUrl: string;
  upstreamApiKeyEnv: string;
  defaultModelId: string;
  allowedModelIds: string[];
  token: string;
  panelToken?: string;
  assetServerToken?: string;
};

export type TeamInvitationStatus = "pending" | "accepted" | "revoked";

export type TeamInvitation = {
  id: string;
  code: string;
  teamSlug: string;
  status: TeamInvitationStatus;
  inviteeLabel: string;
  memberId: string;
  memberEmail?: string;
  role: string;
  note: string;
  quota: MemberQuota;
  createdAt: string;
  createdBy: string;
  acceptedAt?: string;
  acceptedMemberId?: string;
  revokedAt?: string;
};

export type EvolutionConfig = {
  enabled: boolean;
  intervalMs: number;
  minSessionsToTrigger: number;
  maxDigestSummaries: number;
  autoPublish: boolean;
};

export type EvolutionDigest = {
  topics: string[];
  summaries: string[];
  totalSessions: number;
  totalTokens: number;
  collectedAt: string;
  memberCount: number;
};

export type EvolutionResult = {
  teamSlug: string;
  triggeredAt: string;
  digest: EvolutionDigest;
  generatedAssets: { id: string; category: string; title: string }[];
  skipped: boolean;
  skipReason?: string;
};

export type EvolutionState = {
  lastRunAt: string | null;
  lastDigest: EvolutionDigest | null;
  totalRuns: number;
  totalAssetsGenerated: number;
  history: { runAt: string; assetsGenerated: number }[];
};

export type TeamState = {
  version: 1;
  profile: TeamProfile;
  modelGateway: TeamModelGateway;
  invitations: TeamInvitation[];
  memberPolicies: TeamMemberPolicy[];
  assetRolePolicies: TeamAssetRolePolicy[];
  assets: TeamAssetRecord[];
  evolution?: EvolutionConfig;
};

export type TeamsState = {
  version: 2;
  teams: TeamState[];
};

export type AuditEventType =
  | "team.created"
  | "team.profile.updated"
  | "team.gateway.updated"
  | "invitation.created"
  | "invitation.accepted"
  | "invitation.revoked"
  | "member.provisioned"
  | "member.removed"
  | "member.quota.updated"
  | "member.channel.configured"
  | "asset.proposed"
  | "asset.approved"
  | "asset.rejected"
  | "asset.promoted"
  | "member.runtime.action"
  | "member.runtime.upgrade";

export type AuditEntry = {
  ts: string;
  event: AuditEventType;
  actor: string;
  teamSlug: string;
  resourceType: string;
  resourceId: string;
  detail: string;
  meta?: Record<string, unknown>;
};

export type AuditLogPage = {
  entries: AuditEntry[];
  offset: number;
  limit: number;
  total: number;
};

export type AssetChangeEvent = {
  kind: "asset.published" | "asset.promoted";
  teamSlug: string;
  assetId: string;
  timestamp: string;
};

export type MemberHeartbeat = {
  memberId: string;
  teamSlug: string;
  timestamp: string;
  status: "alive" | "degraded";
  quotaUsage?: {
    dailyCount: number;
    monthlyCount: number;
  };
  runtimeVersion?: string;
  uptime?: number;
};

export type CreateTeamInput = {
  name: string;
  slug?: string;
  description?: string;
  managerLabel?: string;
};

export type CreateInvitationInput = {
  inviteeLabel: string;
  memberId: string;
  memberEmail?: string;
  role?: string;
  note?: string;
  createdBy?: string;
  quota?: Partial<MemberQuota>;
};

export type AcceptInvitationInput = {
  identityName?: string;
  telegramUserId?: string;
  telegramBotToken?: string;
  telegramBotTokenFile?: string;
};

export type AcceptInvitationResult = {
  invitation: TeamInvitation;
  provision: ProvisionMemberResult;
  policy: TeamMemberPolicy;
};

export type UpdateMemberQuotaInput = {
  role?: string;
  dailyMessages?: number;
  monthlyMessages?: number;
  maxSubagents?: number;
  maxThinking?: QuotaThinking;
  allowedModels?: string[];
  status?: QuotaStatus;
};

export type CreateAssetProposalInput = {
  teamSlug: string;
  category: TeamAssetCategory;
  title: string;
  content: string;
  capabilityRole?: AssetCapabilityRole;
  consumptionMode?: AssetConsumptionMode;
  capabilityList?: string[];
  tagList?: string[];
  activationHintList?: string[];
  triggerTermList?: string[];
  submittedByMemberId?: string;
  submittedByLabel?: string;
  note?: string;
  sourceZone?: TeamAssetSourceZone;
};

export type TeamAssetActionResult = {
  asset: TeamAssetRecord;
  changed: boolean;
};

export type TeamBackupManifest = {
  schemaVersion: 1;
  createdAt: string;
  teamSlug: string;
  teamName: string;
  memberCount: number;
  assetCount: number;
};

export type TeamBackupResult = {
  archivePath: string;
  manifest: TeamBackupManifest;
};

export type TeamRestoreResult = {
  teamSlug: string;
  membersRestored: number;
  assetsRestored: number;
  warnings: string[];
};
