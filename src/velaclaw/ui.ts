import type { AuditEntry, EvolutionState, TeamInvitation, TeamProfile } from "./types.js";

export function escapeHtml(value: string): string {
  return (value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

export function formatDate(value?: string): string {
  if (!value) {
    return "n/a";
  }
  try {
    return new Date(value).toLocaleString();
  } catch {
    return value;
  }
}

export function pageShell(title: string, body: string): string {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width,initial-scale=1" />
<title>${escapeHtml(title)}</title>
<style>
  :root { color-scheme: dark; --bg:#07131f; --panel:rgba(9,20,36,0.78); --text:#f4f7fb; --muted:#9eb0c4; --accent:#65d3c9; --danger:#ff7b8b; --border:rgba(255,255,255,0.08); }
  * { box-sizing: border-box; }
  body { margin:0; font-family:"IBM Plex Sans",system-ui,sans-serif; background:var(--bg); color:var(--text); min-height:100vh; }
  main { max-width:1180px; margin:0 auto; padding:32px 24px; }
  .nav { display:flex; justify-content:space-between; align-items:center; margin-bottom:24px; }
  .nav a { color:var(--muted); text-decoration:none; margin-right:16px; }
  .nav a:hover { color:var(--accent); }
  .hero { margin-bottom:32px; }
  .hero h1 { margin:0 0 8px; font-size:28px; }
  .hero p { margin:0; color:var(--muted); }
  .panel { background:var(--panel); border:1px solid var(--border); border-radius:16px; padding:24px; margin-bottom:20px; }
  .panel h2 { margin:0 0 12px; font-size:20px; }
  .eyebrow { color:var(--accent); font-size:12px; letter-spacing:1px; text-transform:uppercase; margin-bottom:8px; }
  .list { display:flex; flex-direction:column; gap:12px; }
  .list-item { background:rgba(255,255,255,0.03); border:1px solid var(--border); border-radius:12px; padding:16px; }
  .chips { display:flex; gap:8px; flex-wrap:wrap; margin:8px 0; }
  .chip { background:rgba(101,211,201,0.12); color:var(--accent); padding:4px 10px; border-radius:12px; font-size:12px; }
  .chip.danger { background:rgba(255,123,139,0.12); color:var(--danger); }
  .footer { color:var(--muted); font-size:13px; margin-top:8px; }
  .actions { display:flex; gap:8px; margin-top:12px; flex-wrap:wrap; }
  .button { background:var(--accent); color:#07131f; border:none; padding:8px 16px; border-radius:8px; cursor:pointer; font-weight:600; text-decoration:none; display:inline-block; }
  .button.danger { background:var(--danger); color:white; }
  .button.secondary { background:rgba(255,255,255,0.08); color:var(--text); }
  form.inline { display:inline; }
  .fields { display:flex; flex-direction:column; gap:12px; margin-bottom:16px; }
  .field { display:flex; flex-direction:column; gap:4px; }
  .field .label { font-size:13px; color:var(--muted); }
  .field input, .field select, .field textarea { background:rgba(0,0,0,0.3); color:var(--text); border:1px solid var(--border); border-radius:8px; padding:10px 12px; font:inherit; }
  .flash { padding:12px 16px; border-radius:8px; background:rgba(101,211,201,0.12); color:var(--accent); margin-bottom:16px; }
  .flash.danger { background:rgba(255,123,139,0.12); color:var(--danger); }
  .grid { display:grid; grid-template-columns:repeat(auto-fit,minmax(180px,1fr)); gap:12px; margin:12px 0; }
  .metric { background:rgba(255,255,255,0.03); border:1px solid var(--border); border-radius:12px; padding:16px; }
  .metric .label { color:var(--muted); font-size:12px; margin-bottom:4px; }
  .metric strong { display:block; font-size:20px; }
  code { background:rgba(0,0,0,0.3); padding:2px 6px; border-radius:4px; font-family:"IBM Plex Mono",monospace; }
</style>
</head>
<body><main>${body}</main></body>
</html>`;
}

export function renderHomePage(): string {
  return pageShell(
    "VelaClaw",
    `
    <section class="hero">
      <div class="eyebrow">VelaClaw Control Plane</div>
      <h1>VelaClaw</h1>
      <p>An AI assistant runtime that builds a living knowledge base from how you work.</p>
    </section>
    <div class="panel">
      <h2>Quick links</h2>
      <div class="list">
        <div class="list-item"><a href="/team">All teams</a></div>
        <div class="list-item"><a href="/api/teams">API: list teams</a></div>
        <div class="list-item"><a href="/health">Health check</a></div>
      </div>
    </div>
  `,
  );
}

export function renderLoginPage(error?: string): string {
  return pageShell(
    "VelaClaw — Login",
    `
    <section class="hero" style="max-width:420px;margin:80px auto">
      <h1>VelaClaw</h1>
      <p>Enter the admin token to access the control plane.</p>
      ${error ? `<div class="flash danger">${escapeHtml(error)}</div>` : ""}
      <form method="post" action="/login">
        <div class="fields">
          <label class="field">
            <span class="label">Admin Token</span>
            <input type="password" name="token" required autofocus />
          </label>
        </div>
        <div class="actions">
          <button class="button" type="submit">Login</button>
        </div>
      </form>
    </section>
  `,
  );
}

export function renderErrorPage(title: string, message: string): string {
  return pageShell(
    `Error — ${title}`,
    `
    <section class="hero"><h1>${escapeHtml(title)}</h1></section>
    <div class="panel"><div class="flash danger">${escapeHtml(message)}</div>
      <div class="actions"><a class="button" href="/">Home</a></div>
    </div>
  `,
  );
}

export function renderTeamsIndexPage(
  teams: {
    profile: TeamProfile;
    summary: { memberCount: number; pendingInvitationCount: number };
  }[],
): string {
  return pageShell(
    "Teams — VelaClaw",
    `
    <div class="nav"><div class="eyebrow">/team</div><div><a href="/">Home</a></div></div>
    <section class="hero"><h1>Teams</h1><p>All teams on this control plane.</p></section>
    <div class="panel">
      <h2>Team list</h2>
      <form method="post" action="/team" style="margin-bottom:16px">
        <div class="fields"><label class="field"><span class="label">New team name</span><input name="name" required /></label></div>
        <div class="actions"><button class="button" type="submit">Create team</button></div>
      </form>
      <div class="list">
        ${
          teams.length === 0
            ? `<div class="list-item">No teams yet.</div>`
            : teams
                .map(
                  (t) => `
          <div class="list-item">
            <strong><a href="/team/${encodeURIComponent(t.profile.slug)}">${escapeHtml(t.profile.name)}</a></strong>
            <div class="chips">
              <span class="chip">members: ${t.summary.memberCount}</span>
              <span class="chip">pending: ${t.summary.pendingInvitationCount}</span>
            </div>
            <div class="footer">${escapeHtml(t.profile.description)}</div>
          </div>
        `,
                )
                .join("")
        }
      </div>
    </div>
  `,
  );
}

type MemberLike = { id: string; memberEmail?: string };
type AssetRecordLike = { id: string; title: string; category: string; status: string };
type ListLike<T> = T[] & { items?: T[]; total?: number };
export function renderTeamPage(
  overview: {
    profile: { slug: string; name: string; description: string };
    summary: {
      memberCount: number;
      pendingInvitationCount: number;
      assetPublishedCount: number;
      assetPendingApprovalCount: number;
    };
    members: ListLike<MemberLike>;
    invitations: ListLike<TeamInvitation>;
    assets: { records: ListLike<AssetRecordLike> };
  },
  auditEntries: AuditEntry[],
  evolutionState?: EvolutionState,
): string {
  const slug = overview.profile.slug;
  return pageShell(
    `${overview.profile.name} — VelaClaw`,
    `
    <div class="nav">
      <div class="eyebrow">/team/${escapeHtml(slug)}</div>
      <div><a href="/">Home</a> <a href="/team">Teams</a></div>
    </div>
    <section class="hero"><h1>${escapeHtml(overview.profile.name)}</h1><p>${escapeHtml(overview.profile.description)}</p>
      <div class="grid">
        <div class="metric"><span class="label">Members</span><strong>${overview.members.total ?? overview.summary.memberCount}</strong></div>
        <div class="metric"><span class="label">Pending invites</span><strong>${overview.summary.pendingInvitationCount}</strong></div>
        <div class="metric"><span class="label">Assets published</span><strong>${overview.summary.assetPublishedCount}</strong></div>
        <div class="metric"><span class="label">Pending approval</span><strong>${overview.summary.assetPendingApprovalCount}</strong></div>
      </div>
    </section>

    <div class="panel">
      <div class="eyebrow">Members</div><h2>Team members</h2>
      <div class="list">
        ${
          (overview.members.items ?? overview.members).length === 0
            ? `<div class="list-item">No members yet.</div>`
            : (overview.members.items ?? overview.members)
                .map(
                  (m: MemberLike) => `
            <div class="list-item" data-member-id="${escapeHtml(m.id)}">
              <strong>${escapeHtml(m.memberEmail || m.id)}</strong>
              <div class="chips"><span class="chip">id: ${escapeHtml(m.id)}</span></div>
              <div class="actions">
                <form class="inline" method="post" action="/team/${encodeURIComponent(slug)}/members/${encodeURIComponent(m.id)}/remove">
                  <button class="button danger" type="submit">Remove member</button>
                </form>
              </div>
            </div>
          `,
                )
                .join("")
        }
      </div>
    </div>

    <div class="panel">
      <div class="eyebrow">Invitations</div><h2>Invite a member</h2>
      <form method="post" action="/team/${encodeURIComponent(slug)}/invitations">
        <div class="fields">
          <label class="field"><span class="label">Invitee label</span><input name="inviteeLabel" required /></label>
          <label class="field"><span class="label">Email</span><input name="memberEmail" type="email" required /></label>
          <label class="field"><span class="label">Role</span><select name="role"><option>contributor</option><option>member</option><option>publisher</option><option>manager</option></select></label>
        </div>
        <div class="actions"><button class="button" type="submit">Create invitation</button></div>
      </form>
      <div class="list" style="margin-top:16px">
        ${
          (overview.invitations.items ?? overview.invitations).length === 0
            ? `<div class="list-item">No invitations.</div>`
            : (overview.invitations.items ?? overview.invitations)
                .map(
                  (i: TeamInvitation) => `
            <div class="list-item">
              <strong>${escapeHtml(i.inviteeLabel)}</strong>
              <div class="chips"><span class="chip">${escapeHtml(i.status)}</span><span class="chip">${escapeHtml(i.role)}</span></div>
              <div class="footer mono">/invite/${escapeHtml(i.code)}</div>
            </div>
          `,
                )
                .join("")
        }
      </div>
    </div>

    <div class="panel">
      <div class="eyebrow">Shared Library</div><h2>Assets</h2>
      <div class="list">
        ${
          (overview.assets.records.items ?? overview.assets.records).length === 0
            ? `<div class="list-item">No shared assets yet.</div>`
            : (overview.assets.records.items ?? overview.assets.records)
                .map(
                  (a: AssetRecordLike) => `
            <div class="list-item">
              <strong>${escapeHtml(a.title)}</strong>
              <div class="chips"><span class="chip">${escapeHtml(a.category)}</span><span class="chip">${escapeHtml(a.status)}</span></div>
              ${
                a.status === "pending_approval"
                  ? `
                <div class="actions">
                  <form class="inline" method="post" action="/team/${encodeURIComponent(slug)}/assets/${encodeURIComponent(a.id)}/approve">
                    <button class="button" type="submit">Approve</button>
                  </form>
                  <form class="inline" method="post" action="/team/${encodeURIComponent(slug)}/assets/${encodeURIComponent(a.id)}/reject">
                    <button class="button danger" type="submit">Reject</button>
                  </form>
                </div>
              `
                  : ""
              }
            </div>
          `,
                )
                .join("")
        }
      </div>
    </div>

    ${
      evolutionState
        ? `
    <div class="panel">
      <div class="eyebrow">Team Evolution</div><h2>Self-evolving knowledge</h2>
      <div class="grid">
        <div class="metric"><span class="label">Total runs</span><strong>${evolutionState.totalRuns}</strong></div>
        <div class="metric"><span class="label">Assets generated</span><strong>${evolutionState.totalAssetsGenerated}</strong></div>
        <div class="metric"><span class="label">Last run</span><strong>${evolutionState.lastRunAt ? escapeHtml(formatDate(evolutionState.lastRunAt)) : "Never"}</strong></div>
      </div>
      <div class="actions">
        <form class="inline" method="post" action="/team/${encodeURIComponent(slug)}/evolution/trigger">
          <button class="button" type="submit">Trigger evolution now</button>
        </form>
      </div>
    </div>
    `
        : ""
    }

    ${
      auditEntries.length > 0
        ? `
    <div class="panel">
      <div class="eyebrow">Audit Trail</div><h2>Recent activity</h2>
      <div class="list">
        ${auditEntries
          .map(
            (e) => `
          <div class="list-item">
            <div class="chips">
              <span class="chip">${escapeHtml(formatDate(e.ts))}</span>
              <span class="chip">${escapeHtml(e.event)}</span>
              <span class="chip">${escapeHtml(e.actor)}</span>
            </div>
            <div class="footer">${escapeHtml(e.detail)}</div>
          </div>
        `,
          )
          .join("")}
      </div>
    </div>
    `
        : ""
    }
  `,
  );
}
