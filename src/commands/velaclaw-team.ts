import fs from "node:fs/promises";
import path from "node:path";

type VelaclawDataModule = typeof import("../velaclaw/data.js");

type CommonParams = { root?: string; json?: boolean };

function resolveRoot(root?: string) {
  return path.resolve(root || process.cwd());
}

async function pathExists(p: string) {
  try {
    await fs.access(p);
    return true;
  } catch {
    return false;
  }
}

async function ensureVelaclawWorkspace(root: string) {
  const marker = path.join(
    root,
    "members",
    "member-template",
    "runtime",
    "config",
    "velaclaw.json",
  );
  if (!(await pathExists(marker))) {
    throw new Error(`not a Velaclaw workspace: ${root}. Run 'velaclaw init <dir>' first.`);
  }
}

async function withVelaclawData<T>(root: string, fn: (data: VelaclawDataModule) => Promise<T>) {
  const prev = process.cwd();
  process.chdir(root);
  process.env.VELACLAW_ROOT = root;
  try {
    const data = await import("../velaclaw/data.js");
    return await fn(data);
  } finally {
    process.chdir(prev);
  }
}

function printResult(value: unknown, json: boolean | undefined, text: (v: unknown) => string) {
  if (json) {
    console.log(JSON.stringify(value, null, 2));
  } else {
    console.log(text(value));
  }
}

// ============ Commands ============

export async function velaclawTeamsListCommand(params: CommonParams) {
  const root = resolveRoot(params.root);
  await ensureVelaclawWorkspace(root);
  const teams = await withVelaclawData(root, (d) => d.getTeamsCatalog());
  printResult(teams, params.json, (v) => {
    const list = v as Array<{
      profile: { slug: string; name: string };
      summary: { memberCount: number };
    }>;
    if (list.length === 0) {
      return "No teams.";
    }
    return list
      .map((t) => `${t.profile.slug} — ${t.profile.name} (${t.summary.memberCount} members)`)
      .join("\n");
  });
}

export async function velaclawTeamCreateCommand(
  params: CommonParams & {
    name: string;
    slug?: string;
    description?: string;
    managerLabel?: string;
  },
) {
  const root = resolveRoot(params.root);
  await ensureVelaclawWorkspace(root);
  const profile = await withVelaclawData(root, (d) =>
    d.createTeam({
      name: params.name,
      slug: params.slug,
      description: params.description,
      managerLabel: params.managerLabel,
    }),
  );
  printResult(profile, params.json, (v) => {
    const p = v as { slug: string; name: string };
    return `Created team: ${p.slug} (${p.name})`;
  });
}

export async function velaclawTeamShowCommand(params: CommonParams & { slug: string }) {
  const root = resolveRoot(params.root);
  await ensureVelaclawWorkspace(root);
  const overview = await withVelaclawData(root, (d) => d.getTeamOverviewBySlug(params.slug));
  printResult(overview, params.json, (v) => {
    const o = v as {
      profile: { name: string; slug: string };
      summary: {
        memberCount: number;
        pendingInvitationCount: number;
        assetDraftCount: number;
        assetPendingApprovalCount: number;
        assetPublishedCount: number;
      };
    };
    return [
      `Team: ${o.profile.name} (${o.profile.slug})`,
      `Members: ${o.summary.memberCount}`,
      `Pending invitations: ${o.summary.pendingInvitationCount}`,
      `Assets — drafts: ${o.summary.assetDraftCount}, pending: ${o.summary.assetPendingApprovalCount}, published: ${o.summary.assetPublishedCount}`,
    ].join("\n");
  });
}

export async function velaclawTeamMembersListCommand(params: CommonParams & { slug: string }) {
  const root = resolveRoot(params.root);
  await ensureVelaclawWorkspace(root);
  const members = await withVelaclawData(root, (d) => d.getMembersForTeam(params.slug));
  printResult(members, params.json, (v) => {
    const list = v as Array<{ id: string; memberEmail?: string }>;
    if (list.length === 0) {
      return "No members.";
    }
    return list.map((m) => `${m.id}${m.memberEmail ? ` (${m.memberEmail})` : ""}`).join("\n");
  });
}

export async function velaclawTeamMemberQuotaCommand(
  params: CommonParams & {
    slug: string;
    memberId: string;
    role?: string;
    dailyMessages?: string;
    monthlyMessages?: string;
    status?: string;
  },
) {
  const root = resolveRoot(params.root);
  await ensureVelaclawWorkspace(root);
  const policy = await withVelaclawData(root, (d) =>
    d.updateMemberQuotaForTeam(params.slug, params.memberId, {
      role: params.role,
      dailyMessages: params.dailyMessages ? Number(params.dailyMessages) : undefined,
      monthlyMessages: params.monthlyMessages ? Number(params.monthlyMessages) : undefined,
      status: params.status as "active" | "paused" | undefined,
    }),
  );
  printResult(policy, params.json, (v) => {
    const p = v as { memberId: string; quota: { dailyMessages: number; status: string } };
    return `Quota updated for ${p.memberId}: daily=${p.quota.dailyMessages} status=${p.quota.status}`;
  });
}

export async function velaclawTeamMemberRemoveCommand(
  params: CommonParams & {
    slug: string;
    memberId: string;
  },
) {
  const root = resolveRoot(params.root);
  await ensureVelaclawWorkspace(root);
  const result = await withVelaclawData(root, (d) =>
    d.removeMemberForTeam(params.slug, params.memberId),
  );
  printResult(result, params.json, (v) => {
    const r = v as {
      memberId: string;
      removedPath: string;
      runtimeTeardown: { ok: boolean };
    };
    return `Removed member: ${r.memberId} (runtime=${r.runtimeTeardown.ok ? "stopped" : "unknown"} path=${r.removedPath})`;
  });
}

export async function velaclawTeamInvitationsListCommand(params: CommonParams & { slug: string }) {
  const root = resolveRoot(params.root);
  await ensureVelaclawWorkspace(root);
  const overview = await withVelaclawData(root, (d) => d.getTeamOverviewBySlug(params.slug));
  printResult(overview.invitations, params.json, (v) => {
    const list = v as Array<{ code: string; inviteeLabel: string; status: string }>;
    if (list.length === 0) {
      return "No invitations.";
    }
    return list.map((i) => `${i.code} — ${i.inviteeLabel} (${i.status})`).join("\n");
  });
}

export async function velaclawTeamInvitationCreateCommand(
  params: CommonParams & {
    slug: string;
    inviteeLabel: string;
    memberId?: string;
    memberEmail?: string;
    role?: string;
    note?: string;
  },
) {
  const root = resolveRoot(params.root);
  await ensureVelaclawWorkspace(root);
  const inv = await withVelaclawData(root, (d) =>
    d.createInvitationForTeam(params.slug, {
      inviteeLabel: params.inviteeLabel,
      memberId: params.memberId || params.memberEmail || "",
      memberEmail: params.memberEmail,
      role: params.role,
      note: params.note,
    }),
  );
  printResult(inv, params.json, (v) => {
    const i = v as { code: string; memberId: string };
    return `Invitation created: code=${i.code} (${i.memberId})`;
  });
}

export async function velaclawTeamInvitationAcceptCommand(
  params: CommonParams & {
    code: string;
    identityName?: string;
    telegramUserId?: string;
    telegramBotToken?: string;
    telegramBotTokenFile?: string;
  },
) {
  const root = resolveRoot(params.root);
  await ensureVelaclawWorkspace(root);
  const result = await withVelaclawData(root, (d) =>
    d.acceptInvitationByCode(params.code, {
      identityName: params.identityName,
      telegramUserId: params.telegramUserId,
      telegramBotToken: params.telegramBotToken,
      telegramBotTokenFile: params.telegramBotTokenFile,
    }),
  );
  printResult(result, params.json, (v) => {
    const r = v as { provision: { member: { id: string }; port: number } };
    return `Accepted: memberId=${r.provision.member.id} port=${r.provision.port}`;
  });
}

export async function velaclawTeamInvitationRevokeCommand(
  params: CommonParams & { slug: string; invitationId: string },
) {
  const root = resolveRoot(params.root);
  await ensureVelaclawWorkspace(root);
  const inv = await withVelaclawData(root, (d) =>
    d.revokeInvitationForTeam(params.slug, params.invitationId),
  );
  printResult(inv, params.json, (v) => {
    const i = v as { id: string };
    return `Revoked: ${i.id}`;
  });
}

export async function velaclawTeamAssetsListCommand(params: CommonParams & { slug: string }) {
  const root = resolveRoot(params.root);
  await ensureVelaclawWorkspace(root);
  const overview = await withVelaclawData(root, (d) => d.getTeamOverviewBySlug(params.slug));
  printResult(overview.assets.records, params.json, (v) => {
    const list = v as Array<{ id: string; category: string; status: string; title: string }>;
    if (list.length === 0) {
      return "No assets.";
    }
    return list.map((a) => `${a.id.slice(0, 8)} ${a.category} [${a.status}] ${a.title}`).join("\n");
  });
}

export async function velaclawTeamAssetProposeCommand(
  params: CommonParams & {
    slug: string;
    category: string;
    title: string;
    content?: string;
    file?: string;
    submittedByMemberId?: string;
  },
) {
  const root = resolveRoot(params.root);
  await ensureVelaclawWorkspace(root);
  let content = params.content;
  if (!content && params.file) {
    content = await fs.readFile(params.file, "utf8");
  }
  if (!content) {
    throw new Error("content or --file required");
  }

  const result = await withVelaclawData(root, (d) =>
    d.createTeamAssetProposal({
      teamSlug: params.slug,
      category: params.category,
      title: params.title,
      content,
      submittedByMemberId: params.submittedByMemberId,
      sourceZone: "collab",
    }),
  );
  printResult(result, params.json, (v) => {
    const r = v as { asset: { id: string; status: string } };
    return `Asset ${r.asset.id} → ${r.asset.status}`;
  });
}

export async function velaclawTeamAssetApproveCommand(
  params: CommonParams & { slug: string; assetId: string; approvedByMemberId?: string },
) {
  const root = resolveRoot(params.root);
  await ensureVelaclawWorkspace(root);
  const result = await withVelaclawData(root, (d) =>
    d.approveTeamAssetProposal({
      teamSlug: params.slug,
      assetId: params.assetId,
      approvedByMemberId: params.approvedByMemberId ?? "manager",
    }),
  );
  printResult(result, params.json, (v) => {
    const r = v as { asset: { id: string; status: string } };
    return `Approved: ${r.asset.id} → ${r.asset.status}`;
  });
}

export async function velaclawTeamAssetRejectCommand(
  params: CommonParams & {
    slug: string;
    assetId: string;
    rejectedByMemberId?: string;
    reason?: string;
  },
) {
  const root = resolveRoot(params.root);
  await ensureVelaclawWorkspace(root);
  const result = await withVelaclawData(root, (d) =>
    d.rejectTeamAssetProposal({
      teamSlug: params.slug,
      assetId: params.assetId,
      rejectedByMemberId: params.rejectedByMemberId ?? "manager",
      reason: params.reason,
    }),
  );
  printResult(result, params.json, (v) => {
    const r = v as { asset: { id: string } };
    return `Rejected: ${r.asset.id}`;
  });
}

export async function velaclawTeamAssetPromoteCommand(
  params: CommonParams & { slug: string; assetId: string; actorId?: string },
) {
  const root = resolveRoot(params.root);
  await ensureVelaclawWorkspace(root);
  const result = await withVelaclawData(root, (d) =>
    d.promoteTeamAsset(params.slug, params.assetId, params.actorId ?? "manager"),
  );
  printResult(result, params.json, (v) => {
    const r = v as { asset: { id: string; status: string } };
    return `Promoted: ${r.asset.id} → ${r.asset.status}`;
  });
}

export async function velaclawTeamAssetBackfillItemsCommand(
  params: CommonParams & { slug: string },
) {
  const root = resolveRoot(params.root);
  await ensureVelaclawWorkspace(root);
  const result = await withVelaclawData(root, (d) =>
    d.backfillTeamAssetItemStoreBySlug(params.slug),
  );
  printResult(result, params.json, (v) => {
    const r = v as { teamSlug: string; processed: number; backfilled: number };
    return `Backfilled canonical items for ${r.teamSlug}: processed=${r.processed} new=${r.backfilled}`;
  });
}

export async function velaclawTeamAssetRebuildProjectionsCommand(
  params: CommonParams & { slug: string },
) {
  const root = resolveRoot(params.root);
  await ensureVelaclawWorkspace(root);
  const result = await withVelaclawData(root, (d) =>
    d.rebuildTeamAssetProjectionsBySlug(params.slug),
  );
  printResult(result, params.json, (v) => {
    const r = v as { teamSlug: string; rebuilt: number };
    return `Rebuilt asset projections for ${r.teamSlug}: rebuilt=${r.rebuilt}`;
  });
}

export async function velaclawTeamBackupCommand(
  params: CommonParams & { slug: string; output?: string },
) {
  const root = resolveRoot(params.root);
  await ensureVelaclawWorkspace(root);
  const result = await withVelaclawData(root, (d) =>
    d.createTeamBackup(params.slug, params.output),
  );
  printResult(result, params.json, (v) => {
    const r = v as { archivePath: string; manifest: { memberCount: number; assetCount: number } };
    return `Backup: ${r.archivePath} (members=${r.manifest.memberCount}, assets=${r.manifest.assetCount})`;
  });
}

export async function velaclawTeamRestoreCommand(
  params: CommonParams & { archive: string; force?: boolean },
) {
  const root = resolveRoot(params.root);
  await ensureVelaclawWorkspace(root);
  const result = await withVelaclawData(root, (d) =>
    d.restoreTeamBackup(params.archive, { force: params.force }),
  );
  printResult(result, params.json, (v) => {
    const r = v as { teamSlug: string; membersRestored: number; assetsRestored: number };
    return `Restored: ${r.teamSlug} (members=${r.membersRestored}, assets=${r.assetsRestored})`;
  });
}
