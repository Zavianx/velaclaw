<p align="center">
  <img src="pic/banner.jpg" alt="VelaClaw" width="100%" />
</p>

<h1 align="center">VelaClaw</h1>

<p align="center">
  <b>A private AI runtime that evolves with your team.</b>
</p>

<p align="center">
  <a href="https://www.npmjs.com/package/velaclaw"><img src="https://img.shields.io/npm/v/velaclaw?style=for-the-badge&color=cb3837&logo=npm&logoColor=white" alt="npm" /></a>
  <img src="https://img.shields.io/badge/node-22%2B-339933?style=for-the-badge&logo=node.js&logoColor=white" alt="Node 22+" />
  <img src="https://img.shields.io/badge/TypeScript-3178C6?style=for-the-badge&logo=typescript&logoColor=white" alt="TypeScript" />
  <img src="https://img.shields.io/badge/license-MIT-22c55e?style=for-the-badge" alt="MIT" />
  <img src="https://img.shields.io/badge/status-beta-f59e0b?style=for-the-badge" alt="Status: Beta" />
</p>

<p align="center">
  <img src="https://img.shields.io/badge/OpenAI-412991?style=flat-square&logo=openai&logoColor=white" />
  <img src="https://img.shields.io/badge/Anthropic-D4A27F?style=flat-square" />
  <img src="https://img.shields.io/badge/Gemini-1A73E8?style=flat-square&logo=google&logoColor=white" />
  <img src="https://img.shields.io/badge/DeepSeek-0066FF?style=flat-square" />
  <img src="https://img.shields.io/badge/Ollama-000000?style=flat-square&logo=ollama&logoColor=white" />
  <img src="https://img.shields.io/badge/OpenRouter-8A2BE2?style=flat-square" />
  <img src="https://img.shields.io/badge/%2B40_providers-6b7280?style=flat-square" />
</p>

<p align="center">
  <a href="#-demo">Demo</a> &nbsp;·&nbsp;
  <a href="#-install">Install</a> &nbsp;·&nbsp;
  <a href="#-evolution-engine">Evolution</a> &nbsp;·&nbsp;
  <a href="#-team-collaboration">Team</a> &nbsp;·&nbsp;
  <a href="#-skills-research-and-clawhub">ClawHub</a> &nbsp;·&nbsp;
  <a href="MANIFESTO.md">Manifesto</a> &nbsp;·&nbsp;
  <a href="README.zh-CN.md">中文</a>
</p>

<br/>

---

<br/>

> Many teams already use AI, but the usage pattern is still highly individual: knowledge stays scattered across private chat histories, workflows are hard to reuse, and collaboration lacks a stable way to retain what works.
>
> VelaClaw is an attempt to address exactly that.
>
> It can run on your own machine, connect to the models you already use, and keep skills, memory, and workflows close to the local working environment. When a team joins, that model does not collapse into one shared pool: each member still keeps an isolated runtime and private memory, while useful experience is curated, reviewed, and gradually added back to the team's shared knowledge base.
>
> It is not another chat window. It is a way to turn AI from a personal tool into a team capability that can compound over time.

<br/>

## ✨ What VelaClaw adds

VelaClaw combines a local AI runtime, a self-evolving knowledge engine, and a governed team collaboration layer in one system.

<br/>

### 🧬 Evolution engine

<p><b>Knowledge that writes itself.</b></p>

VelaClaw adds an evolution pipeline that can draft new shared assets from anonymized team digests and recurring session patterns.

<table>
  <tr>
    <td width="50%" valign="top">
      <h4>📝 Auto-drafts from real work</h4>
      <p>The engine distills new skills, memory entries, and workflows from actual session patterns — not from a blank prompt.</p>
    </td>
    <td width="50%" valign="top">
      <h4>🛡️ Anonymized digests in, reviewed assets out</h4>
      <p>The evolution path works from anonymized topics and summaries. Every draft enters a human review queue before it can be published.</p>
    </td>
  </tr>
  <tr>
    <td width="50%" valign="top">
      <h4>♻️ Incremental, not repetitive</h4>
      <p>Subsequent runs skip what's already generated. The engine grows the knowledge base; it doesn't rewrite it.</p>
    </td>
    <td width="50%" valign="top">
      <h4>📡 Auto-distributed to the team</h4>
      <p>Approved assets flow back to member runtimes through the shared-asset distribution path on subsequent conversations.</p>
    </td>
  </tr>
</table>

<p>The result is a shared knowledge base that can grow over time without forcing the team to hand-curate every asset.</p>

<br/>

### 👥 Team collaboration

<p><b>Multi-user without giving up privacy.</b></p>

VelaClaw is designed so knowledge can be shared while member runtimes remain isolated by container boundaries, policy, and explicit publication flow.

<table>
  <tr>
    <td width="50%" valign="top">
      <h4>📦 Isolated per-member runtimes</h4>
      <p>One Docker sandbox per teammate: <code>cap_drop: ALL</code>, read-only FS, no host socket, no shared memory. The control plane coordinates members through generated state, APIs, and published assets rather than relying on direct raw-chat access.</p>
    </td>
    <td width="50%" valign="top">
      <h4>🚦 Governed publication flow</h4>
      <p><b>Draft → review → approve → publish → distribute.</b> Nothing reaches the shared pool without human approval.</p>
    </td>
  </tr>
  <tr>
    <td width="50%" valign="top">
      <h4>🎭 7 roles + dedicated evolution role</h4>
      <p><code>viewer</code> · <code>member</code> · <code>contributor</code> · <code>publisher</code> · <code>manager</code> · <code>owner</code>, plus <code>system-evolution</code> for the engine itself.</p>
    </td>
    <td width="50%" valign="top">
      <h4>🔍 15-event audit trail</h4>
      <p>Every proposal, approval, publish, membership change, and quota update is logged and queryable.</p>
    </td>
  </tr>
  <tr>
    <td width="50%" valign="top">
      <h4>💓 Heartbeat & quota</h4>
      <p>Members report health and daily-message usage. Stale nodes surface in the UI; quotas are enforced per member.</p>
    </td>
    <td width="50%" valign="top">
      <h4>💾 One-command backup & restore</h4>
      <p><code>velaclaw team backup &lt;slug&gt;</code> packs the full team state — members, assets, audit log — into a single tar.gz.</p>
    </td>
  </tr>
</table>

<br/>

### 📊 Positioning

<p>VelaClaw is a local-first runtime for teams: isolated member runtimes, governed shared knowledge, backup and restore, and an evolution engine that drafts reusable assets from anonymized digests.</p>

<br/>

## 🎬 Demo

| Demo                                           | What it shows                                   | Start here when                                   |
| :--------------------------------------------- | :---------------------------------------------- | :------------------------------------------------ |
| [Demo 1](#demo-1-local-gateway-dashboard)      | Local gateway, browser dashboard, first chat    | You want to verify VelaClaw runs locally          |
| [Demo 2](#demo-2-team-workspace-member-invite) | Team workspace, member invite, control-plane UI | You want to see the team runtime model            |
| [Demo 3](#demo-3-shared-asset-review-publish)  | Propose → review → publish shared knowledge     | You want to understand the governance loop        |
| [Demo 4](#demo-4-evolution-engine)             | Session digests → generated shared assets       | You want to see how knowledge compounds over time |

<br/>

<a id="demo-1-local-gateway-dashboard"></a>

<details>
<summary><b>Demo 1: Local gateway and dashboard</b> — local gateway, browser dashboard, first chat</summary>

<br/>

This demo takes you from a clean install to the browser Control UI. It is the fastest way to verify that VelaClaw can run locally, connect to a model provider, and keep a usable chat session through the gateway.

```bash
npm uninstall -g velaclaw
npm install -g velaclaw
velaclaw setup --wizard
```

Start the gateway in one terminal:

```bash
velaclaw gateway run
```

Open the dashboard from another terminal:

```bash
velaclaw dashboard
```

If the browser does not open automatically, open **http://127.0.0.1:18789**.

After the dashboard connects, it should look like this:

<p align="center">
  <img src="docs/assets/demo/local-gateway-dashboard.png" alt="VelaClaw Control UI dashboard showing the local gateway chat screen" width="100%" />
</p>

Try this first prompt in the Chat tab:

```text
Summarize what VelaClaw can do in three bullets, then show one safe next step.
```

You should see the assistant response stream into the dashboard. When tools run, the Control UI shows live tool output cards, and the session remains available through the gateway after refresh.

</details>

<a id="demo-2-team-workspace-member-invite"></a>

<details>
<summary><b>Demo 2: Team workspace and member invite</b> — team workspace, member invite, control-plane UI</summary>

<br/>

This demo shows the team control plane: a manager creates a workspace, opens the team UI, invites a contributor, and verifies that the member is provisioned without sharing private chat history.

Start the team control plane in one terminal:

```bash
velaclaw init team-demo
cd team-demo
velaclaw start
```

The control plane listens on **http://127.0.0.1:4318** by default.

From another terminal in the same `team-demo` directory:

```bash
velaclaw team create \
  --name "Product Team" \
  --slug product-team \
  --manager-label "Team Lead"

velaclaw team invitations create product-team \
  --invitee-label "Alice" \
  --member-email alice@example.com \
  --role contributor

velaclaw team invitations accept <invite-code> --identity-name "Alice"
velaclaw team show product-team
velaclaw team members list product-team
```

Expected result:

```text
Created team: product-team (Product Team)
Invitation created: code=<invite-code> (alice-example-com-...)
Accepted: memberId=alice-example-com-... port=18800
Team: Product Team (product-team)
Members: 1
Pending invitations: 0
```

Open **http://127.0.0.1:4318/team/product-team** to inspect members, invitations, shared assets, evolution state, and the audit trail:

<p align="center">
  <img src="docs/assets/demo/team-workspace-dashboard.png" alt="VelaClaw team workspace dashboard showing a product team with one invited member" width="100%" />
</p>

This is the handoff point from solo usage to governed team usage: every member gets an isolated runtime, while team-visible assets and actions go through the control plane.

</details>

<a id="demo-3-shared-asset-review-publish"></a>

<details>
<summary><b>Demo 3: Shared asset review and publish</b> — propose, review, and publish shared knowledge</summary>

<br/>

This demo shows how reusable team knowledge moves through the governed shared-asset path. A contributor proposes a checklist, a manager approves it, and the asset becomes published team knowledge.

Start from the `product-team` workspace created in Demo 2. First get the member id:

```bash
velaclaw team members list product-team
```

Then propose a shared skill as that member:

```bash
velaclaw team assets propose product-team \
  --category shared-skills \
  --title "PR Review Checklist" \
  --submitted-by-member-id <member-id> \
  --content "Review pull requests by checking tests, migrations, auth boundaries, rollout risk, and rollback plan."
```

Check the review queue, approve the proposal, and verify that it is published:

```bash
velaclaw team assets list product-team
velaclaw team assets approve product-team <asset-id> --approved-by-member-id manager
velaclaw team assets list product-team
velaclaw team show product-team
```

Expected result:

```text
Asset <asset-id> → pending_approval
<short-id> shared-skills [pending_approval] PR Review Checklist
Approved: <asset-id> → published
<short-id> shared-skills [published] PR Review Checklist
Assets — drafts: 0, pending: 0, published: 1
```

The team page now shows the asset in the shared library and records both the proposal and approval in the audit trail:

<p align="center">
  <img src="docs/assets/demo/shared-assets-lifecycle.png" alt="VelaClaw shared asset lifecycle showing a published PR Review Checklist and audit events" width="100%" />
</p>

This is the core governance loop: useful work can become shared team capability, but it passes through explicit review before it reaches the published library.

</details>

<a id="demo-4-evolution-engine"></a>

<details>
<summary><b>Demo 4: Evolution engine</b> — turn recurring session patterns into shared assets</summary>

<br/>

This demo shows the self-evolving knowledge path. VelaClaw collects anonymized member-session digests, asks the configured model to extract reusable knowledge, and publishes generated memory or skill assets back into the team shared library.

Prerequisites:

- A team workspace with member runtimes, as in Demo 2.
- Enough recent member sessions for the digest, or a forced run for testing.
- A configured model provider for the team control plane.

Trigger evolution from the team page with **Trigger evolution now**, or call the local control-plane API:

```bash
curl -X POST http://127.0.0.1:4318/api/teams/product-team/evolution/trigger
velaclaw team assets list product-team
```

The GIF below uses a seeded local demo workspace with two anonymized session patterns: incident rollback order and release retrospective structure. After evolution runs, VelaClaw publishes one shared memory and one shared skill:

<p align="center">
  <img src="docs/assets/demo/evolution-engine.gif" alt="VelaClaw evolution engine GIF showing shared assets generated from session digests" width="100%" />
</p>

The important contract is that raw private chats are not copied into the shared pool. The evolution engine works from topics and summaries, writes generated assets as system-authored proposals, and records the run in the team audit trail.

</details>

<br/>

## 🚀 Install

```bash
npm uninstall -g velaclaw
npm install -g velaclaw
velaclaw setup --wizard
velaclaw gateway run
```

Then open **http://127.0.0.1:18789**.

<br/>

The wizard guides you through the full setup and covers every decision you'd otherwise have to make by hand:

| Step                             | What it does                                                                                                                                                                        |
| :------------------------------- | :---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **1. Security check**            | One-time confirmation of the trust model (personal-by-default; tools + DMs share delegated authority unless you harden it).                                                         |
| **2. Flow**                      | _QuickStart_ keeps safe defaults (loopback, token auth, port `18789`); _Manual_ walks every option.                                                                                 |
| **3. Mode**                      | Local gateway on this machine, or connect to a remote one.                                                                                                                          |
| **4. Gateway**                   | Port, bind (loopback / LAN / Tailnet / custom), token or password auth. Tokens are generated for you.                                                                               |
| **5. Provider**                  | Bring your own API key (OpenAI, Anthropic, DeepSeek, Gemini, OpenRouter, LiteLLM, or any OpenAI-compatible endpoint), or reuse an existing CLI login (`claude`, `codex`, `gemini`). |
| **6. Channels, skills, plugins** | Optional. Skippable. Configurable later.                                                                                                                                            |
| **7. Health probe**              | The wizard connects to the gateway you just configured and confirms it is reachable before exiting.                                                                                 |

Everything lands in your active Velaclaw config path. Set `VELACLAW_CONFIG_PATH` when you want an explicit location; otherwise the CLI uses its default local config path. Re-running the wizard is safe — keep existing values, update specific sections, or reset. Run `velaclaw configure` any time to adjust credentials, channels, gateway, or agent defaults.

<details>
<summary><b>Non-interactive setup</b> (CI or scripts)</summary>

<br/>

```bash
velaclaw onboard --non-interactive --accept-risk \
  --mode local \
  --auth-choice openai-api-key --openai-api-key sk-... \
  --gateway-bind loopback --gateway-port 18789
```

See `velaclaw onboard --help` for the full flag list, including Codex CLI, Anthropic CLI, Ollama, and custom-provider flows.

</details>

<details>
<summary><b>Build from source</b></summary>

<br/>

```bash
git clone https://github.com/Zavianx/velaclaw.git
cd velaclaw
pnpm install && pnpm build && pnpm link --global
```

Requires Node.js 22+ and pnpm 9+.

</details>

<br/>

## 🧩 Skills, research, and ClawHub

VelaClaw can load local skills, install registry skills from [ClawHub](https://clawhub.ai), and expose curated skills as team shared assets.

```bash
velaclaw skills search "financial research"
velaclaw skills install <skill-slug>
velaclaw skills update --all
```

For teams, the control plane can bridge ClawHub into the same shared-asset system used by `shared-skills`. Members receive materialized skill files in their isolated workspace; they do **not** receive the ClawHub token.

```bash
VELACLAW_TEAM_CLAWHUB_SKILLS_ENABLED=1
VELACLAW_CLAWHUB_TOKEN=clh_...
```

Current research workflows are handled through `research_task`, `web_search`, and `web_fetch`. In Docker, TUN, or fake-IP proxy environments, enable `tools.web.fetch.useEnvProxy` and pass trusted proxy environment variables to the member runtime so external site fetches go through the operator-controlled proxy instead of local DNS pinning.

See [ClawHub](docs/tools/clawhub.md), [Skills](docs/tools/skills.md), and [Web Fetch](docs/tools/web-fetch.md) for detailed configuration.

<br/>

## 👥 Team setup

<sub>Stand up a team in four commands. Capability details live in <a href="#-team-collaboration">Team collaboration</a> above.</sub>

```bash
# 1. Build the member runtime image
docker build -t velaclaw-member-runtime:local .

# 2. Initialize a team workspace and start the control plane
velaclaw init my-workspace && cd my-workspace
velaclaw start                                   # control plane on :4318

# 3. Create a team
velaclaw team create --name "My Team"

# 4. Invite a member, then accept on their side
velaclaw team invitations create my-team \
  --invitee-label "Alice" --member-email alice@example.com --role contributor
velaclaw team invitations accept <invite-code>
```

For a production-style team, keep these defaults aligned:

- Run one explicit team control plane and point members at it with `VELACLAW_TEAM_CONTROL_BASE_URL`.
- Keep upstream model/API credentials on the control plane side; member runtimes should use the team model gateway, not direct provider keys.
- Build or publish a stable member runtime image before accepting members.
- If members need public web fetching from Docker, pass trusted `HTTP_PROXY` / `HTTPS_PROXY` env vars and set `tools.web.fetch.useEnvProxy: true`.
- If you use ClawHub shared skills, set `VELACLAW_TEAM_CLAWHUB_SKILLS_ENABLED=1` and keep `VELACLAW_CLAWHUB_TOKEN` only on the control plane.
- Use `velaclaw team members remove <slug> <memberId>` to remove a member, stop its runtime, and delete its workspace.

<br/>

## 📚 Reference

<details>
<summary><b>Environment variables</b></summary>

<br/>

| Variable                                | Description                                      | Default           |
| :-------------------------------------- | :----------------------------------------------- | :---------------- |
| `VELACLAW_ROOT`                         | Workspace root                                   | auto-detected     |
| `VELACLAW_CONFIG_PATH`                  | Override the active config file                  | CLI default       |
| `VELACLAW_ADMIN_TOKEN`                  | Control plane auth token                         | open on localhost |
| `VELACLAW_TEAM_CONTROL_BASE_URL`        | Base URL members use to reach the control plane  | auto-generated    |
| `VELACLAW_TEAM_CLAWHUB_SKILLS_ENABLED`  | Expose ClawHub skills through team shared assets | disabled          |
| `VELACLAW_CLAWHUB_TOKEN`                | ClawHub token used by the control plane          | —                 |
| `VELACLAW_MEMBER_INHERIT_PROXY`         | Bake trusted proxy env vars into member runtime  | disabled          |
| `HTTP_PROXY` / `HTTPS_PROXY`            | Trusted proxy for web fetching                   | —                 |
| `OPENAI_API_KEY`                        | OpenAI                                           | —                 |
| `ANTHROPIC_API_KEY`                     | Anthropic                                        | —                 |
| `BRAVE_API_KEY`                         | Brave Search provider for `web_search`           | —                 |
| `FIRECRAWL_API_KEY`                     | Optional `web_fetch` fallback provider           | —                 |
| `PORT`                                  | Control plane port                               | `4318`            |

</details>

<details>
<summary><b>CLI reference</b></summary>

<br/>

```bash
# Gateway (solo use)
velaclaw gateway run [--bind loopback|lan] [--port 18789]

# Control plane (team use)
velaclaw init <dir>
velaclaw start [--port 4318]

# Teams
velaclaw team list
velaclaw team create --name "Name"
velaclaw team show <slug>
velaclaw team backup <slug>
velaclaw team restore <archive>

# Members
velaclaw team members list <slug>
velaclaw team members quota <slug> <id> [--daily-messages N] [--status active|paused]
velaclaw team members remove <slug> <id>

# Invitations
velaclaw team invitations create <slug> --invitee-label "Name" --member-email email
velaclaw team invitations accept <code>

# Shared assets
velaclaw team assets list <slug>
velaclaw team assets propose <slug> --category shared-skills --title "Title" --content "..."
velaclaw team assets approve <slug> <id>
```

</details>

<details>
<summary><b>Project docs</b></summary>

<br/>

- [MANIFESTO.md](MANIFESTO.md) — why VelaClaw exists
- [CONTRIBUTING.md](CONTRIBUTING.md) — how to contribute
- [SECURITY.md](SECURITY.md) — reporting vulnerabilities
- [CHANGELOG.md](CHANGELOG.md) — release notes

</details>

<br/>

---

<p align="center">
  <sub>Released under the <a href="LICENSE">MIT License</a> &nbsp;·&nbsp; Built on the shoulders of the <b>OpenClaw</b> project.</sub>
</p>
<p align="center">
  <sub>If VelaClaw is useful to you, consider giving it a ⭐ on <a href="https://github.com/Zavianx/velaclaw">GitHub</a>.</sub>
</p>
