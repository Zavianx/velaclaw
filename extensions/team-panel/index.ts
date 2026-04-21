import { definePluginEntry } from "velaclaw/plugin-sdk/plugin-entry";

type TelegramButtons = Array<
  Array<{ text: string; callback_data: string; style?: "danger" | "success" | "primary" }>
>;

type TeamSummary = {
  profile: { slug: string; name: string };
  summary: {
    memberCount: number;
    pendingInvitationCount: number;
    assetPublishedCount?: number;
  };
};

type TeamOverview = {
  profile: {
    slug: string;
    name: string;
    description?: string;
    managerLabel?: string;
  };
  summary: {
    memberCount: number;
    pendingInvitationCount: number;
    assetDraftCount: number;
    assetPendingApprovalCount: number;
    assetPublishedCount: number;
  };
  members: Array<{
    id: string;
    memberEmail?: string;
    hasRuntime?: boolean;
    hasComposeFile?: boolean;
    hasConfigFile?: boolean;
  }>;
  invitations: Array<{
    id: string;
    inviteeLabel: string;
    memberId: string;
    status: string;
    code: string;
    role: string;
  }>;
  assets: {
    records: Array<{
      id: string;
      title: string;
      category: string;
      status: string;
      submittedBy: string;
    }>;
  };
};

type TeamPanelConfig = {
  controlBaseUrl?: string;
  adminToken?: string;
  accessToken?: string;
  teamSlug?: string;
  allowTeamListing?: boolean;
  allowEvolutionTrigger?: boolean;
  allowMemberRemoval?: boolean;
  memberId?: string;
  runtimeAccessToken?: string;
};

const INTERACTIVE_NAMESPACE = "vtp";
const MAX_CALLBACK_BYTES = 64;
const DEFAULT_CONTROL_PLANE_PORT = "4318";

function asTrimmedString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function resolveControlPlaneBaseUrl(config?: TeamPanelConfig): string {
  const explicit =
    asTrimmedString(config?.controlBaseUrl) ||
    asTrimmedString(process.env.VELACLAW_TEAM_CONTROL_BASE_URL);
  if (explicit) {
    return explicit.replace(/\/+$/, "");
  }
  const port =
    asTrimmedString(process.env.VELACLAW_CONTROL_PORT) ||
    asTrimmedString(process.env.PORT) ||
    DEFAULT_CONTROL_PLANE_PORT;
  return `http://127.0.0.1:${port}`;
}

function resolveScopedTeamSlug(config?: TeamPanelConfig): string {
  return asTrimmedString(config?.teamSlug);
}

function isTeamScopedPanel(config?: TeamPanelConfig): boolean {
  return Boolean(resolveScopedTeamSlug(config) && asTrimmedString(config?.accessToken));
}

function isTeamListingAllowed(config?: TeamPanelConfig): boolean {
  return !isTeamScopedPanel(config) || config?.allowTeamListing === true;
}

function isEvolutionTriggerAllowed(config?: TeamPanelConfig): boolean {
  return config?.allowEvolutionTrigger !== false;
}

function isMemberRemovalAllowed(config?: TeamPanelConfig): boolean {
  return !isTeamScopedPanel(config) || config?.allowMemberRemoval === true;
}

function buildHeaders(config?: TeamPanelConfig): Record<string, string> {
  const token = isTeamScopedPanel(config)
    ? asTrimmedString(config?.accessToken)
    : asTrimmedString(config?.adminToken) || asTrimmedString(process.env.VELACLAW_ADMIN_TOKEN);
  return token ? { Authorization: `Bearer ${token}` } : {};
}

async function fetchJson(
  config: TeamPanelConfig | undefined,
  requestPath: string,
  init?: RequestInit,
) {
  const extraHeaders = init?.headers
    ? Object.fromEntries(new Headers(init.headers).entries())
    : undefined;
  const response = await fetch(`${resolveControlPlaneBaseUrl(config)}${requestPath}`, {
    ...init,
    headers: {
      Accept: "application/json",
      ...buildHeaders(config),
      ...(init?.body ? { "Content-Type": "application/json" } : {}),
      ...extraHeaders,
    },
  });
  const text = await response.text();
  let payload: unknown = null;
  try {
    payload = text ? JSON.parse(text) : null;
  } catch {
    payload = text;
  }
  if (!response.ok) {
    const message =
      payload &&
      typeof payload === "object" &&
      "error" in payload &&
      typeof payload.error === "string"
        ? payload.error
        : typeof payload === "string" && payload.trim()
          ? payload
          : `${response.status} ${response.statusText}`;
    throw new Error(message);
  }
  return payload;
}

async function listTeams(config?: TeamPanelConfig): Promise<TeamSummary[]> {
  if (!isTeamListingAllowed(config)) {
    const slug = resolveScopedTeamSlug(config);
    if (!slug) {
      return [];
    }
    const overview = await getTeamOverview(slug, config);
    return [
      {
        profile: overview.profile,
        summary: {
          memberCount: overview.summary.memberCount,
          pendingInvitationCount: overview.summary.pendingInvitationCount,
          assetPublishedCount: overview.summary.assetPublishedCount,
        },
      },
    ];
  }
  const payload = (await fetchJson(config, "/api/teams")) as { teams?: TeamSummary[] };
  return Array.isArray(payload.teams) ? payload.teams : [];
}

async function getTeamOverview(slug: string, config?: TeamPanelConfig): Promise<TeamOverview> {
  if (isTeamScopedPanel(config)) {
    const scopedSlug = resolveScopedTeamSlug(config);
    if (slug !== scopedSlug) {
      throw new Error("当前面板只允许访问所属团队。");
    }
    return (await fetchJson(
      config,
      `/api/teams/${encodeURIComponent(slug)}/panel/overview`,
    )) as TeamOverview;
  }
  return (await fetchJson(config, `/api/teams/${encodeURIComponent(slug)}`)) as TeamOverview;
}

async function triggerEvolution(slug: string, config?: TeamPanelConfig) {
  if (!isEvolutionTriggerAllowed(config)) {
    throw new Error("当前团队面板未开放进化触发。");
  }
  const requestPath = isTeamScopedPanel(config)
    ? `/api/teams/${encodeURIComponent(slug)}/panel/evolution/trigger`
    : `/api/teams/${encodeURIComponent(slug)}/evolution/trigger`;
  await fetchJson(config, requestPath, {
    method: "POST",
    body: JSON.stringify({ force: true }),
  });
}

async function removeMember(slug: string, memberId: string, config?: TeamPanelConfig) {
  if (!isMemberRemovalAllowed(config)) {
    throw new Error("当前团队面板未开放成员移除。");
  }
  if (!isTeamScopedPanel(config)) {
    await fetchJson(
      config,
      `/api/teams/${encodeURIComponent(slug)}/members/${encodeURIComponent(memberId)}/remove`,
      {
        method: "POST",
        body: JSON.stringify({}),
      },
    );
    return;
  }

  const actorMemberId = asTrimmedString(config?.memberId);
  const runtimeAccessToken = asTrimmedString(config?.runtimeAccessToken);
  if (!actorMemberId || !runtimeAccessToken) {
    throw new Error("当前面板缺少成员管理凭据。");
  }
  await fetchJson(
    {
      ...config,
      adminToken: undefined,
      accessToken: undefined,
    },
    `/api/teams/${encodeURIComponent(slug)}/panel/members/${encodeURIComponent(actorMemberId)}/remove/${encodeURIComponent(memberId)}`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${runtimeAccessToken}`,
      },
      body: JSON.stringify({}),
    },
  );
}

function callbackData(action: string, slug?: string): string | null {
  const value = `${INTERACTIVE_NAMESPACE}:${action}${slug ? `:${slug}` : ""}`;
  return Buffer.byteLength(value, "utf8") <= MAX_CALLBACK_BYTES ? value : null;
}

function pushButtonRow(
  rows: TelegramButtons,
  buttons: Array<{ text: string; callback_data: string }>,
) {
  if (buttons.length > 0) {
    rows.push(buttons);
  }
}

function buildTeamsButtons(teams: TeamSummary[]): TelegramButtons {
  const rows: TelegramButtons = [];
  for (const team of teams.slice(0, 8)) {
    const data = callbackData("t", team.profile.slug);
    if (!data) {
      continue;
    }
    rows.push([{ text: team.profile.name.slice(0, 24), callback_data: data }]);
  }
  const refresh = callbackData("h");
  if (refresh) {
    rows.push([{ text: "刷新", callback_data: refresh }]);
  }
  return rows;
}

function renderTeamsPanel(teams: TeamSummary[]) {
  const lines = ["团队面板", ""];
  if (teams.length === 0) {
    lines.push("当前还没有任何团队。");
  } else {
    lines.push(`共 ${teams.length} 个团队：`, "");
    for (const team of teams.slice(0, 8)) {
      lines.push(
        `• ${team.profile.name} (${team.profile.slug})`,
        `  成员 ${team.summary.memberCount} · 待处理邀请 ${team.summary.pendingInvitationCount} · 已发布资产 ${team.summary.assetPublishedCount ?? 0}`,
      );
    }
  }
  lines.push("", "点下面按钮可查看具体团队。");
  return {
    text: lines.join("\n"),
    buttons: buildTeamsButtons(teams),
  };
}

function buildTeamButtons(slug: string, config?: TeamPanelConfig): TelegramButtons {
  const rows: TelegramButtons = [];
  pushButtonRow(
    rows,
    [
      { text: "成员", callback_data: callbackData("m", slug) || "" },
      { text: "邀请", callback_data: callbackData("i", slug) || "" },
    ].filter((entry) => entry.callback_data),
  );
  pushButtonRow(
    rows,
    [
      { text: "资产", callback_data: callbackData("a", slug) || "" },
      ...(isEvolutionTriggerAllowed(config)
        ? [{ text: "进化", callback_data: callbackData("e", slug) || "" }]
        : []),
    ].filter((entry) => entry.callback_data),
  );
  pushButtonRow(
    rows,
    [
      { text: "刷新", callback_data: callbackData("t", slug) || "" },
      { text: "返回", callback_data: callbackData("h") || "" },
    ].filter((entry) => entry.callback_data),
  );
  return rows;
}

function renderTeamPanel(overview: TeamOverview, config?: TeamPanelConfig, note?: string) {
  const { profile, summary, members, invitations, assets } = overview;
  const lines = [
    profile.name,
    `slug: ${profile.slug}`,
    profile.description?.trim() ? profile.description.trim() : "团队控制面板",
    "",
    `成员 ${summary.memberCount} · 待处理邀请 ${summary.pendingInvitationCount}`,
    `资产：草稿 ${summary.assetDraftCount} · 待审批 ${summary.assetPendingApprovalCount} · 已发布 ${summary.assetPublishedCount}`,
    "",
    `最近成员：${
      members
        .slice(0, 3)
        .map((entry) => entry.id)
        .join("、") || "无"
    }`,
    `最近邀请：${
      invitations
        .slice(0, 2)
        .map((entry) => entry.inviteeLabel)
        .join("、") || "无"
    }`,
    `最近资产：${
      assets.records
        .slice(0, 2)
        .map((entry) => entry.title)
        .join("、") || "无"
    }`,
  ];
  if (note) {
    lines.push("", note);
  }
  return {
    text: lines.join("\n"),
    buttons: buildTeamButtons(profile.slug, config),
  };
}

function renderMembersPanel(overview: TeamOverview) {
  const lines = [`${overview.profile.name} · 成员`, ""];
  if (overview.members.length === 0) {
    lines.push("当前没有成员。");
  } else {
    for (const member of overview.members.slice(0, 10)) {
      lines.push(
        `• ${member.id}${member.memberEmail ? ` (${member.memberEmail})` : ""}`,
        `  runtime=${member.hasRuntime ? "yes" : "no"} compose=${member.hasComposeFile ? "yes" : "no"} config=${member.hasConfigFile ? "yes" : "no"}`,
      );
    }
  }
  return {
    text: lines.join("\n"),
    buttons: [
      [
        { text: "返回团队", callback_data: callbackData("t", overview.profile.slug) || "" },
        { text: "返回首页", callback_data: callbackData("h") || "" },
      ].filter((entry) => entry.callback_data),
    ],
  };
}

function renderMembersPanelWithActions(overview: TeamOverview, config?: TeamPanelConfig) {
  const base = renderMembersPanel(overview);
  if (!isMemberRemovalAllowed(config)) {
    return base;
  }
  const rows = [...base.buttons];
  for (const member of overview.members.slice(0, 8)) {
    const data = callbackData("rm", `${overview.profile.slug}:${member.id}`);
    if (!data) {
      continue;
    }
    rows.unshift([{ text: `移除 ${member.id}`.slice(0, 24), callback_data: data }]);
  }
  return {
    text: `${base.text}\n\n点“移除”后还需要二次确认。`,
    buttons: rows,
  };
}

function renderRemoveMemberConfirmPanel(
  overview: TeamOverview,
  memberId: string,
  config?: TeamPanelConfig,
) {
  const member = overview.members.find((entry) => entry.id === memberId);
  const lines = [
    `${overview.profile.name} · 移除成员确认`,
    "",
    member
      ? `你将移除成员 ${member.id}${member.memberEmail ? ` (${member.memberEmail})` : ""}。`
      : `你将移除成员 ${memberId}。`,
    "此操作会停止该成员 runtime、删除成员目录，并从团队状态中移除。",
    "",
    "确认后不可自动恢复。",
  ];

  return {
    text: lines.join("\n"),
    buttons: [
      isMemberRemovalAllowed(config)
        ? [
            {
              text: `确认移除 ${memberId}`.slice(0, 24),
              callback_data:
                callbackData("rmc", `${overview.profile.slug}:${memberId}`) ||
                `vtp:rmc:${overview.profile.slug}:${memberId}`,
            },
          ]
        : [],
      [
        {
          text: "返回成员列表",
          callback_data: callbackData("m", overview.profile.slug) || "vtp:m",
        },
        { text: "返回团队", callback_data: callbackData("t", overview.profile.slug) || "vtp:t" },
      ],
    ],
  };
}

function renderInvitationsPanel(overview: TeamOverview) {
  const lines = [`${overview.profile.name} · 邀请`, ""];
  const pending = overview.invitations.filter((entry) => entry.status === "pending");
  if (pending.length === 0) {
    lines.push("当前没有待处理邀请。");
  } else {
    for (const invitation of pending.slice(0, 8)) {
      lines.push(
        `• ${invitation.inviteeLabel} -> ${invitation.memberId}`,
        `  role=${invitation.role} · code=${invitation.code}`,
      );
    }
  }
  return {
    text: lines.join("\n"),
    buttons: [
      [
        { text: "返回团队", callback_data: callbackData("t", overview.profile.slug) || "" },
        { text: "返回首页", callback_data: callbackData("h") || "" },
      ].filter((entry) => entry.callback_data),
    ],
  };
}

function renderAssetsPanel(overview: TeamOverview) {
  const lines = [`${overview.profile.name} · 资产`, ""];
  if (overview.assets.records.length === 0) {
    lines.push("当前没有共享资产。");
  } else {
    for (const asset of overview.assets.records.slice(0, 8)) {
      lines.push(
        `• [${asset.status}] ${asset.title}`,
        `  ${asset.category} · by ${asset.submittedBy}`,
      );
    }
  }
  return {
    text: lines.join("\n"),
    buttons: [
      [
        { text: "返回团队", callback_data: callbackData("t", overview.profile.slug) || "" },
        { text: "返回首页", callback_data: callbackData("h") || "" },
      ].filter((entry) => entry.callback_data),
    ],
  };
}

async function renderPanelHome(config?: TeamPanelConfig) {
  if (isTeamScopedPanel(config)) {
    return renderTeamPanel(await getTeamOverview(resolveScopedTeamSlug(config), config), config);
  }
  return renderTeamsPanel(await listTeams(config));
}

async function buildPanelReply(action: string, slug: string | undefined, config?: TeamPanelConfig) {
  if (action === "h" || !action) {
    return renderPanelHome(config);
  }

  const effectiveSlug = slug || resolveScopedTeamSlug(config);
  if (!effectiveSlug) {
    return {
      text: "缺少团队标识，已返回团队列表。",
      buttons: (await renderPanelHome(config)).buttons,
    };
  }

  if (action === "e") {
    await triggerEvolution(effectiveSlug, config);
    return renderTeamPanel(
      await getTeamOverview(effectiveSlug, config),
      config,
      "已触发一次团队进化。",
    );
  }

  if (action === "rm") {
    const [teamSlug, memberId] = (slug || "").split(":");
    if (!teamSlug || !memberId) {
      throw new Error("缺少成员移除目标。");
    }
    return renderRemoveMemberConfirmPanel(
      await getTeamOverview(teamSlug, config),
      memberId,
      config,
    );
  }

  if (action === "rmc") {
    const [teamSlug, memberId] = (slug || "").split(":");
    if (!teamSlug || !memberId) {
      throw new Error("缺少成员移除目标。");
    }
    await removeMember(teamSlug, memberId, config);
    return renderTeamPanel(
      await getTeamOverview(teamSlug, config),
      config,
      `已移除成员 ${memberId}。`,
    );
  }

  const overview = await getTeamOverview(effectiveSlug, config);
  if (action === "m") {
    return renderMembersPanelWithActions(overview, config);
  }
  if (action === "i") {
    return renderInvitationsPanel(overview);
  }
  if (action === "a") {
    return renderAssetsPanel(overview);
  }
  return renderTeamPanel(overview, config);
}

export default definePluginEntry({
  id: "team-panel",
  name: "Team Panel",
  description: "Telegram /team panel for Velaclaw team control.",
  register(api) {
    const config = (api.pluginConfig || {}) as TeamPanelConfig;

    api.registerCommand({
      name: "team",
      nativeNames: { telegram: "team" },
      description: "Open the Telegram team panel.",
      acceptsArgs: false,
      handler: async () => {
        try {
          const panel = await buildPanelReply("h", undefined, config);
          return {
            text: panel.text,
            channelData: {
              telegram: {
                buttons: panel.buttons,
              },
            },
          };
        } catch (error) {
          return {
            text: `打开团队面板失败: ${error instanceof Error ? error.message : String(error)}`,
          };
        }
      },
    });

    api.registerInteractiveHandler({
      channel: "telegram",
      namespace: INTERACTIVE_NAMESPACE,
      handler: async (ctx: unknown) => {
        const { callback, respond } = ctx as {
          callback: { payload: string };
          respond: {
            editMessage: (args: { text: string; buttons?: unknown }) => Promise<unknown>;
          };
        };
        try {
          const [action = "h", ...rest] = callback.payload.split(":");
          const panel = await buildPanelReply(action, rest.join(":"), config);
          await respond.editMessage({
            text: panel.text,
            buttons: panel.buttons,
          });
          return { handled: true };
        } catch (error) {
          await respond.editMessage({
            text: `团队面板操作失败: ${error instanceof Error ? error.message : String(error)}`,
            buttons: [[{ text: "返回团队首页", callback_data: callbackData("h") || "vtp:h" }]],
          });
          return { handled: true };
        }
      },
    });
  },
});
