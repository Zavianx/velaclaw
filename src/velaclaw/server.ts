import express from "express";
import { safeEqualSecret } from "../security/secret-equal.js";
import {
  acceptInvitationByCode,
  approveTeamAssetProposal,
  assetChangeEmitter,
  batchMemberRuntimeAction,
  createTeam,
  createInvitationForTeam,
  createTeamAssetProposal,
  createTeamBackup,
  getEvolutionState,
  getInvitationByCode,
  getMemberHeartbeat,
  getTeamHeartbeats,
  getTeamAssetCapabilityRegistryBySlug,
  getTeamAssetServerBundleBySlug,
  getTeamAssetServerItemById,
  getTeamAssetServerManifestBySlug,
  getTeamOverviewBySlug,
  getTeamsCatalog,
  HttpError,
  promoteTeamAsset,
  primeTeamsStateForRuntime,
  readAuditLog,
  receiveMemberHeartbeat,
  rejectTeamAssetProposal,
  resolveTeamAssetServerMatchesBySlug,
  resolveTeamModelGatewayUpstream,
  restoreTeamBackup,
  removeMemberForTeam,
  revokeInvitationForTeam,
  runMemberRuntimeActionForTeam,
  runTeamEvolution,
  updateMemberQuotaForTeam,
  updateTeamEvolutionConfig,
  validateMemberRuntimeAccessTokenForTeam,
} from "./data.js";
import type {
  AssetChangeEvent,
  AuditEventType,
  MemberRuntimeAction,
  EvolutionConfig,
  TeamModelGateway,
} from "./types.js";
import {
  renderErrorPage,
  renderHomePage,
  renderLoginPage,
  renderTeamPage,
  renderTeamsIndexPage,
} from "./ui.js";

const port = Number(process.env.PORT || 4318);
const DEFAULT_EVOLUTION_SCHEDULER_TICK_MS = 60_000;
let evolutionSchedulerInterval: NodeJS.Timeout | null = null;
let evolutionSchedulerTickInFlight = false;
const evolutionSchedulerTeamsInFlight = new Set<string>();

type TeamOverview = Awaited<ReturnType<typeof getTeamOverviewBySlug>>;
type PanelOverview = Omit<TeamOverview, "modelGateway"> & {
  modelGateway: Pick<
    TeamModelGateway,
    "enabled" | "providerId" | "defaultModelId" | "allowedModelIds"
  >;
};

function sanitizeTeamOverviewForPanel(overview: TeamOverview): PanelOverview {
  return {
    ...overview,
    modelGateway: {
      enabled: overview.modelGateway.enabled,
      providerId: overview.modelGateway.providerId,
      defaultModelId: overview.modelGateway.defaultModelId,
      allowedModelIds: [...overview.modelGateway.allowedModelIds],
    },
  };
}

function resolveTeamPanelToken(
  overview: Awaited<ReturnType<typeof getTeamOverviewBySlug>>,
): string {
  return typeof overview.modelGateway.panelToken === "string" &&
    overview.modelGateway.panelToken.trim()
    ? overview.modelGateway.panelToken
    : overview.modelGateway.token;
}

function resolveTeamAssetServerToken(
  overview: Awaited<ReturnType<typeof getTeamOverviewBySlug>>,
): string {
  return typeof overview.modelGateway.assetServerToken === "string" &&
    overview.modelGateway.assetServerToken.trim()
    ? overview.modelGateway.assetServerToken
    : overview.modelGateway.token;
}

function parseOptionalInt(value: unknown): number | undefined {
  if (value == null || value === "") {
    return undefined;
  }
  const n = Number(value);
  return Number.isFinite(n) ? n : undefined;
}

function getBearerToken(req: express.Request): string {
  const authHeader = req.headers.authorization ?? "";
  return authHeader.startsWith("Bearer ") ? authHeader.slice(7).trim() : "";
}

function isTeamScopedServicePath(requestPath: string): boolean {
  return /^\/api\/teams\/[^/]+\/(?:asset-server|model-gateway|panel)\b/.test(requestPath);
}

function isMemberScopedServicePath(requestPath: string): boolean {
  return /^\/api\/teams\/[^/]+\/members\/[^/]+\/(?:runtime\/(?:start|stop|restart)|heartbeat)\b/.test(
    requestPath,
  );
}

function isInvitationSelfServicePath(requestPath: string): boolean {
  return /^\/api\/team\/invitations\/[^/]+(?:\/accept)?\b/.test(requestPath);
}

export function isLoopbackRemoteAddress(address: string | undefined | null): boolean {
  if (typeof address !== "string") {
    return false;
  }
  const normalized = address
    .trim()
    .toLowerCase()
    .replace(/^::ffff:/, "");
  return normalized === "127.0.0.1" || normalized === "::1";
}

function isLoopbackRequest(req: express.Request): boolean {
  return isLoopbackRemoteAddress(req.socket.remoteAddress);
}

function resolveEvolutionSchedulerEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  const disabled = env.VELACLAW_DISABLE_EVOLUTION_SCHEDULER?.trim().toLowerCase();
  if (disabled === "1" || disabled === "true" || env.VELACLAW_TEST_FAST === "1") {
    return false;
  }
  return true;
}

function resolveEvolutionSchedulerTickMs(env: NodeJS.ProcessEnv = process.env): number {
  const raw = Number(env.VELACLAW_EVOLUTION_TICK_MS ?? DEFAULT_EVOLUTION_SCHEDULER_TICK_MS);
  return Number.isFinite(raw) && raw > 0 ? raw : DEFAULT_EVOLUTION_SCHEDULER_TICK_MS;
}

async function runEvolutionSchedulerTick(
  deps: {
    getTeams: typeof getTeamsCatalog;
    runEvolution: typeof runTeamEvolution;
  } = {
    getTeams: getTeamsCatalog,
    runEvolution: runTeamEvolution,
  },
): Promise<void> {
  if (evolutionSchedulerTickInFlight) {
    return;
  }
  evolutionSchedulerTickInFlight = true;
  try {
    const teams = await deps.getTeams();
    for (const team of teams) {
      const slug = team.profile.slug;
      if (!slug || evolutionSchedulerTeamsInFlight.has(slug)) {
        continue;
      }
      evolutionSchedulerTeamsInFlight.add(slug);
      try {
        await deps.runEvolution(slug);
      } catch (error) {
        console.error(
          `[velaclaw evolution] scheduled run failed for ${slug}: ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
      } finally {
        evolutionSchedulerTeamsInFlight.delete(slug);
      }
    }
  } finally {
    evolutionSchedulerTickInFlight = false;
  }
}

function ensureEvolutionSchedulerStarted(env: NodeJS.ProcessEnv = process.env): void {
  if (evolutionSchedulerInterval || !resolveEvolutionSchedulerEnabled(env)) {
    return;
  }
  const tickMs = resolveEvolutionSchedulerTickMs(env);
  const run = () => {
    void runEvolutionSchedulerTick().catch((error) => {
      console.error(
        `[velaclaw evolution] scheduler tick failed: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    });
  };
  evolutionSchedulerInterval = setInterval(run, tickMs);
  evolutionSchedulerInterval.unref?.();
  const initialDelay = Math.min(5_000, tickMs);
  const bootstrapTimer = setTimeout(run, initialDelay);
  bootstrapTimer.unref?.();
}

function hasAdminCredential(req: express.Request, adminToken: string): boolean {
  if (!adminToken) {
    return false;
  }
  const sessionCookie = req.headers.cookie
    ?.split(";")
    .map((c) => c.trim())
    .find((c) => c.startsWith("velaclaw_session="));
  const cookieToken = sessionCookie?.split("=")[1] ?? "";
  if (safeEqualSecret(cookieToken, adminToken)) {
    return true;
  }
  return safeEqualSecret(getBearerToken(req), adminToken);
}

function isAdminAuthorizedRequest(req: express.Request, adminToken: string): boolean {
  if (adminToken) {
    return hasAdminCredential(req, adminToken);
  }
  return isLoopbackRequest(req);
}

export function createVelaclawApp() {
  const app = express();
  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));
  void primeTeamsStateForRuntime().catch(() => {});
  ensureEvolutionSchedulerStarted();

  // ============ Admin auth middleware ============
  const adminToken = process.env.VELACLAW_ADMIN_TOKEN?.trim() || "";

  app.use((req, res, next) => {
    if (req.path === "/health" || req.path === "/healthz") {
      return next();
    }
    if (isTeamScopedServicePath(req.path)) {
      return next();
    }
    if (isMemberScopedServicePath(req.path)) {
      return next();
    }
    if (isInvitationSelfServicePath(req.path)) {
      return next();
    }
    if (isAdminAuthorizedRequest(req, adminToken)) {
      return next();
    }

    if (req.path === "/login" && req.method === "GET") {
      if (!adminToken) {
        return res
          .status(403)
          .type("html")
          .send(
            renderErrorPage(
              "VelaClaw Error",
              "Control-plane admin routes are loopback-only unless VELACLAW_ADMIN_TOKEN is set.",
            ),
          );
      }
      return res.type("html").send(renderLoginPage());
    }
    if (req.path === "/login" && req.method === "POST") {
      if (!adminToken) {
        return res
          .status(403)
          .type("html")
          .send(
            renderErrorPage(
              "VelaClaw Error",
              "Control-plane admin routes are loopback-only unless VELACLAW_ADMIN_TOKEN is set.",
            ),
          );
      }
      const submitted = String(req.body?.token ?? "").trim();
      if (safeEqualSecret(submitted, adminToken)) {
        res.setHeader(
          "Set-Cookie",
          `velaclaw_session=${adminToken}; Path=/; HttpOnly; SameSite=Strict; Max-Age=86400`,
        );
        return res.redirect("/");
      }
      return res.type("html").send(renderLoginPage("Invalid token"));
    }

    if (req.path.startsWith("/api/")) {
      return res.status(adminToken ? 401 : 403).json({
        ok: false,
        error: adminToken
          ? "unauthorized"
          : "control plane admin routes require loopback or VELACLAW_ADMIN_TOKEN",
      });
    }
    if (!adminToken) {
      return res
        .status(403)
        .type("html")
        .send(
          renderErrorPage(
            "VelaClaw Error",
            "Control-plane admin routes are loopback-only unless VELACLAW_ADMIN_TOKEN is set.",
          ),
        );
    }
    return res.redirect("/login");
  });

  // ============ Health ============
  app.get("/health", (_req, res) =>
    res.json({ ok: true, service: "velaclaw-control-plane", version: "0.3.0" }),
  );
  app.get("/healthz", (_req, res) => res.json({ ok: true }));

  // ============ Home + Teams UI ============
  app.get("/", (_req, res) => res.type("html").send(renderHomePage()));

  app.get("/team", async (_req, res, next) => {
    try {
      const teams = await getTeamsCatalog();
      res.type("html").send(renderTeamsIndexPage(teams));
    } catch (e) {
      next(e);
    }
  });

  app.post("/team", async (req, res, next) => {
    try {
      const profile = await createTeam({
        name: req.body?.name ?? "",
        slug: req.body?.slug,
        description: req.body?.description,
        managerLabel: req.body?.managerLabel,
      });
      res.redirect(`/team/${profile.slug}?created=team`);
    } catch (e) {
      next(e);
    }
  });

  app.get("/team/:slug", async (req, res, next) => {
    try {
      const [overview, auditPage, evoState] = await Promise.all([
        getTeamOverviewBySlug(req.params.slug),
        readAuditLog(req.params.slug, { limit: 20 }),
        getEvolutionState(req.params.slug),
      ]);
      res.type("html").send(renderTeamPage(overview, auditPage.entries, evoState));
    } catch (e) {
      next(e);
    }
  });

  // Team invitations (HTML form)
  app.post("/team/:slug/invitations", async (req, res, next) => {
    try {
      await createInvitationForTeam(req.params.slug, {
        inviteeLabel: req.body?.inviteeLabel ?? "",
        memberId: req.body?.memberId ?? "",
        memberEmail: req.body?.memberEmail,
        role: req.body?.role,
      });
      res.redirect(`/team/${encodeURIComponent(req.params.slug)}?invite=created`);
    } catch (e) {
      next(e);
    }
  });

  app.post("/team/:slug/members/:id/remove", async (req, res, next) => {
    try {
      await removeMemberForTeam(req.params.slug, req.params.id);
      res.redirect(`/team/${encodeURIComponent(req.params.slug)}?member=removed`);
    } catch (e) {
      next(e);
    }
  });

  // Asset approval actions (HTML)
  app.post("/team/:slug/assets/:id/approve", async (req, res, next) => {
    try {
      await approveTeamAssetProposal({
        teamSlug: req.params.slug,
        assetId: req.params.id,
        approvedByMemberId: "manager",
      });
      res.redirect(`/team/${encodeURIComponent(req.params.slug)}?asset=approved`);
    } catch (e) {
      next(e);
    }
  });

  app.post("/team/:slug/assets/:id/reject", async (req, res, next) => {
    try {
      await rejectTeamAssetProposal({
        teamSlug: req.params.slug,
        assetId: req.params.id,
        rejectedByMemberId: "manager",
        reason: req.body?.reason,
      });
      res.redirect(`/team/${encodeURIComponent(req.params.slug)}?asset=rejected`);
    } catch (e) {
      next(e);
    }
  });

  app.post("/team/:slug/evolution/trigger", async (req, res, next) => {
    try {
      await runTeamEvolution(req.params.slug, { force: true });
      res.redirect(`/team/${encodeURIComponent(req.params.slug)}?evolution=triggered`);
    } catch (e) {
      next(e);
    }
  });

  // ============ JSON APIs ============
  app.get("/api/teams", async (_req, res, next) => {
    try {
      res.json({ teams: await getTeamsCatalog() });
    } catch (e) {
      next(e);
    }
  });

  app.post("/api/teams", async (req, res, next) => {
    try {
      const profile = await createTeam({
        name: req.body?.name,
        slug: req.body?.slug,
        description: req.body?.description,
      });
      res.status(201).json({ ok: true, profile });
    } catch (e) {
      next(e);
    }
  });

  app.get("/api/teams/:slug", async (req, res, next) => {
    try {
      res.json(await getTeamOverviewBySlug(req.params.slug));
    } catch (e) {
      next(e);
    }
  });

  app.post("/api/teams/:slug/invitations", async (req, res, next) => {
    try {
      const invitation = await createInvitationForTeam(req.params.slug, req.body || {});
      res.status(201).json({ ok: true, invitation });
    } catch (e) {
      next(e);
    }
  });

  app.post("/api/teams/:slug/invitations/:id/revoke", async (req, res, next) => {
    try {
      const invitation = await revokeInvitationForTeam(req.params.slug, req.params.id);
      res.json({ ok: true, invitation });
    } catch (e) {
      next(e);
    }
  });

  app.post("/api/team/invitations/:code/accept", async (req, res, next) => {
    try {
      const result = await acceptInvitationByCode(req.params.code, req.body || {});
      res.json({ ok: true, ...result });
    } catch (e) {
      next(e);
    }
  });

  app.get("/api/team/invitations/:code", async (req, res, next) => {
    try {
      const invitation = await getInvitationByCode(req.params.code);
      if (!invitation) {
        throw new HttpError(404, "invitation not found");
      }
      res.json({ ok: true, invitation });
    } catch (e) {
      next(e);
    }
  });

  app.post("/api/teams/:slug/assets/proposals", async (req, res, next) => {
    try {
      const result = await createTeamAssetProposal({ ...req.body, teamSlug: req.params.slug });
      res.status(201).json({ ok: true, ...result });
    } catch (e) {
      next(e);
    }
  });

  app.post("/api/teams/:slug/assets/:id/approve", async (req, res, next) => {
    try {
      const result = await approveTeamAssetProposal({
        teamSlug: req.params.slug,
        assetId: req.params.id,
        approvedByMemberId: req.body?.approvedByMemberId ?? "manager",
      });
      res.json({ ok: true, ...result });
    } catch (e) {
      next(e);
    }
  });

  app.post("/api/teams/:slug/assets/:id/reject", async (req, res, next) => {
    try {
      const result = await rejectTeamAssetProposal({
        teamSlug: req.params.slug,
        assetId: req.params.id,
        rejectedByMemberId: req.body?.rejectedByMemberId ?? "manager",
        reason: req.body?.reason,
      });
      res.json({ ok: true, ...result });
    } catch (e) {
      next(e);
    }
  });

  app.post("/api/teams/:slug/assets/:id/promote", async (req, res, next) => {
    try {
      const result = await promoteTeamAsset(
        req.params.slug,
        req.params.id,
        req.body?.actorId ?? "manager",
      );
      res.json({ ok: true, ...result });
    } catch (e) {
      next(e);
    }
  });

  app.post("/api/teams/:slug/members/:id/quota", async (req, res, next) => {
    try {
      const policy = await updateMemberQuotaForTeam(req.params.slug, req.params.id, req.body || {});
      res.json({ ok: true, policy });
    } catch (e) {
      next(e);
    }
  });

  const handleRemoveMember = async (
    req: express.Request,
    res: express.Response,
    next: express.NextFunction,
  ) => {
    try {
      const slugParam = Array.isArray(req.params.slug)
        ? (req.params.slug[0] ?? "")
        : req.params.slug;
      const memberIdParam = Array.isArray(req.params.id) ? (req.params.id[0] ?? "") : req.params.id;
      const result = await removeMemberForTeam(slugParam, memberIdParam);
      res.json({ ok: true, ...result });
    } catch (e) {
      next(e);
    }
  };

  app.post("/api/teams/:slug/members/:id/remove", handleRemoveMember);
  app.delete("/api/teams/:slug/members/:id", handleRemoveMember);

  // Audit
  app.get("/api/teams/:slug/audit", async (req, res, next) => {
    try {
      const offset = parseOptionalInt(req.query.offset) ?? 0;
      const limit = parseOptionalInt(req.query.limit) ?? 50;
      const event =
        typeof req.query.event === "string" ? (req.query.event as AuditEventType) : undefined;
      res.json({ ok: true, ...(await readAuditLog(req.params.slug, { offset, limit, event })) });
    } catch (e) {
      next(e);
    }
  });

  // Heartbeat
  app.post("/api/teams/:slug/members/:id/heartbeat", async (req, res, next) => {
    try {
      if (!(await requireMemberRuntimeAccess(req, req.params.slug, req.params.id))) {
        res.status(401).json({ ok: false, error: "invalid member runtime token" });
        return;
      }
      res.json({
        ok: true,
        heartbeat: receiveMemberHeartbeat(req.params.slug, req.params.id, req.body || {}),
      });
    } catch (e) {
      next(e);
    }
  });
  app.get("/api/teams/:slug/members/:id/heartbeat", async (req, res, next) => {
    try {
      if (!(await requireMemberRuntimeAccess(req, req.params.slug, req.params.id))) {
        res.status(401).json({ ok: false, error: "invalid member runtime token" });
        return;
      }
      res.json({ ok: true, heartbeat: getMemberHeartbeat(req.params.slug, req.params.id) });
    } catch (e) {
      next(e);
    }
  });
  app.get("/api/teams/:slug/heartbeats", (req, res) => {
    res.json({ ok: true, heartbeats: getTeamHeartbeats(req.params.slug) });
  });

  // Batch runtime
  app.post("/api/teams/:slug/members/batch/:action", async (req, res, next) => {
    try {
      const action = req.params.action as MemberRuntimeAction;
      if (!["start", "stop", "restart"].includes(action)) {
        throw new HttpError(400, `invalid action: ${action}`);
      }
      res.json({ ok: true, results: await batchMemberRuntimeAction(req.params.slug, action) });
    } catch (e) {
      next(e);
    }
  });
  app.post("/api/teams/:slug/members/:id/runtime/:action", async (req, res, next) => {
    try {
      if (!(await requireMemberRuntimeAccess(req, req.params.slug, req.params.id))) {
        res.status(401).json({ ok: false, error: "invalid member runtime token" });
        return;
      }
      const action = req.params.action as MemberRuntimeAction;
      if (!["start", "stop", "restart"].includes(action)) {
        throw new HttpError(400, `invalid action`);
      }
      res.json({
        ok: true,
        result: await runMemberRuntimeActionForTeam(req.params.slug, req.params.id, action),
      });
    } catch (e) {
      next(e);
    }
  });

  // Evolution
  app.post("/api/teams/:slug/evolution/trigger", async (req, res, next) => {
    try {
      res.json({ ok: true, ...(await runTeamEvolution(req.params.slug, { force: true })) });
    } catch (e) {
      next(e);
    }
  });
  app.get("/api/teams/:slug/evolution/state", async (req, res, next) => {
    try {
      res.json({ ok: true, ...(await getEvolutionState(req.params.slug)) });
    } catch (e) {
      next(e);
    }
  });
  app.post("/api/teams/:slug/evolution/config", async (req, res, next) => {
    try {
      const input: Partial<EvolutionConfig> = {};
      if (req.body?.enabled != null) {
        input.enabled = req.body.enabled === true || req.body.enabled === "true";
      }
      if (req.body?.intervalMs != null) {
        input.intervalMs = Number(req.body.intervalMs);
      }
      if (req.body?.minSessionsToTrigger != null) {
        input.minSessionsToTrigger = Number(req.body.minSessionsToTrigger);
      }
      res.json({ ok: true, config: await updateTeamEvolutionConfig(req.params.slug, input) });
    } catch (e) {
      next(e);
    }
  });

  // Backup
  app.post("/api/teams/:slug/backup", async (req, res, next) => {
    try {
      res.json({ ok: true, ...(await createTeamBackup(req.params.slug, req.body?.output)) });
    } catch (e) {
      next(e);
    }
  });
  app.post("/api/teams/:slug/restore", async (req, res, next) => {
    try {
      const archivePath = req.body?.archive;
      if (!archivePath) {
        throw new HttpError(400, "archive path required");
      }
      res.json({
        ok: true,
        ...(await restoreTeamBackup(archivePath, { force: Boolean(req.body?.force) })),
      });
    } catch (e) {
      next(e);
    }
  });

  // ============ Team Model Gateway (team token auth) ============
  async function requireTeamModelGatewayToken(
    req: express.Request,
    teamSlug: string,
  ): Promise<boolean> {
    const token = getBearerToken(req);
    if (!token) {
      return false;
    }
    try {
      const overview = await getTeamOverviewBySlug(teamSlug);
      return safeEqualSecret(token, overview.modelGateway.token);
    } catch {
      return false;
    }
  }

  async function requireTeamPanelToken(req: express.Request, teamSlug: string): Promise<boolean> {
    const token = getBearerToken(req);
    if (!token) {
      return false;
    }
    try {
      const overview = await getTeamOverviewBySlug(teamSlug);
      return safeEqualSecret(token, resolveTeamPanelToken(overview));
    } catch {
      return false;
    }
  }

  async function requireMemberRuntimeAccess(
    req: express.Request,
    teamSlug: string,
    memberId: string,
  ): Promise<boolean> {
    if (isAdminAuthorizedRequest(req, adminToken)) {
      return true;
    }
    return await validateMemberRuntimeAccessTokenForTeam(teamSlug, memberId, getBearerToken(req));
  }

  async function proxyTeamModelGatewayJson(
    req: express.Request,
    res: express.Response,
    next: express.NextFunction,
    upstreamPath: string,
  ) {
    try {
      const slugParam = Array.isArray(req.params.slug)
        ? (req.params.slug[0] ?? "")
        : req.params.slug;
      if (!(await requireTeamModelGatewayToken(req, slugParam))) {
        res.status(401).json({ ok: false, error: "invalid model gateway token" });
        return;
      }

      const overview = await getTeamOverviewBySlug(slugParam);
      const gateway = overview.modelGateway;
      if (!gateway.enabled) {
        res.status(503).json({ ok: false, error: "team model gateway disabled" });
        return;
      }

      let requestBody = req.body;
      if (
        req.method !== "GET" &&
        requestBody &&
        typeof requestBody === "object" &&
        !Array.isArray(requestBody)
      ) {
        const requestedModel =
          typeof requestBody.model === "string" && requestBody.model.trim()
            ? requestBody.model.trim()
            : gateway.defaultModelId;
        if (!gateway.allowedModelIds.includes(requestedModel)) {
          res.status(403).json({ ok: false, error: `model not allowed: ${requestedModel}` });
          return;
        }
        const upstreamConfig = await resolveTeamModelGatewayUpstream(gateway);
        requestBody = {
          ...requestBody,
          model: upstreamConfig.mapRequestedModel?.(requestedModel) ?? requestedModel,
        };

        const upstream = await fetch(
          `${upstreamConfig.baseUrl.replace(/\/+$/, "")}/${upstreamPath}`,
          {
            method: req.method,
            headers: {
              Accept:
                typeof req.headers.accept === "string" && req.headers.accept.trim()
                  ? req.headers.accept
                  : "application/json",
              ...(req.method === "GET" ? {} : { "Content-Type": "application/json" }),
              ...upstreamConfig.headers,
            },
            body: req.method === "GET" ? undefined : JSON.stringify(requestBody ?? {}),
          },
        );

        const contentType = upstream.headers.get("content-type");
        const cacheControl = upstream.headers.get("cache-control");
        if (contentType) {
          res.setHeader("Content-Type", contentType);
        }
        if (cacheControl) {
          res.setHeader("Cache-Control", cacheControl);
        }

        res.status(upstream.status).send(await upstream.text());
        return;
      }

      const upstreamConfig = await resolveTeamModelGatewayUpstream(gateway);
      const upstream = await fetch(
        `${upstreamConfig.baseUrl.replace(/\/+$/, "")}/${upstreamPath}`,
        {
          method: req.method,
          headers: {
            Accept:
              typeof req.headers.accept === "string" && req.headers.accept.trim()
                ? req.headers.accept
                : "application/json",
            ...(req.method === "GET" ? {} : { "Content-Type": "application/json" }),
            ...upstreamConfig.headers,
          },
          body: req.method === "GET" ? undefined : JSON.stringify(requestBody ?? {}),
        },
      );

      const contentType = upstream.headers.get("content-type");
      const cacheControl = upstream.headers.get("cache-control");
      if (contentType) {
        res.setHeader("Content-Type", contentType);
      }
      if (cacheControl) {
        res.setHeader("Cache-Control", cacheControl);
      }

      res.status(upstream.status).send(await upstream.text());
    } catch (e) {
      next(e);
    }
  }

  app.get("/api/teams/:slug/model-gateway/v1/models", async (req, res, next) => {
    try {
      if (!(await requireTeamModelGatewayToken(req, req.params.slug))) {
        res.status(401).json({ ok: false, error: "invalid model gateway token" });
        return;
      }
      const overview = await getTeamOverviewBySlug(req.params.slug);
      const gateway = overview.modelGateway;
      res.json({
        object: "list",
        data: gateway.allowedModelIds.map((id) => ({
          id,
          object: "model",
          created: 0,
          owned_by: gateway.providerId,
        })),
      });
    } catch (e) {
      next(e);
    }
  });

  app.post("/api/teams/:slug/model-gateway/v1/chat/completions", async (req, res, next) => {
    await proxyTeamModelGatewayJson(req, res, next, "chat/completions");
  });

  app.post("/api/teams/:slug/model-gateway/v1/responses", async (req, res, next) => {
    await proxyTeamModelGatewayJson(req, res, next, "responses");
  });

  app.get("/api/teams/:slug/model-gateway/v1/responses/:responseId", async (req, res, next) => {
    await proxyTeamModelGatewayJson(
      req,
      res,
      next,
      `responses/${encodeURIComponent(req.params.responseId)}`,
    );
  });

  // ============ Team Panel (team token auth) ============
  app.get("/api/teams/:slug/panel/overview", async (req, res, next) => {
    try {
      if (!(await requireTeamPanelToken(req, req.params.slug))) {
        res.status(401).json({ ok: false, error: "invalid team panel token" });
        return;
      }
      res.json(sanitizeTeamOverviewForPanel(await getTeamOverviewBySlug(req.params.slug)));
    } catch (e) {
      next(e);
    }
  });

  app.post("/api/teams/:slug/panel/evolution/trigger", async (req, res, next) => {
    try {
      if (!(await requireTeamPanelToken(req, req.params.slug))) {
        res.status(401).json({ ok: false, error: "invalid team panel token" });
        return;
      }
      res.json({ ok: true, result: await runTeamEvolution(req.params.slug, { force: true }) });
    } catch (e) {
      next(e);
    }
  });

  app.post("/api/teams/:slug/panel/members/:actorId/remove/:memberId", async (req, res, next) => {
    try {
      if (!(await requireMemberRuntimeAccess(req, req.params.slug, req.params.actorId))) {
        res.status(401).json({ ok: false, error: "invalid member runtime token" });
        return;
      }
      const result = await removeMemberForTeam(
        req.params.slug,
        req.params.memberId,
        req.params.actorId,
      );
      res.json({ ok: true, ...result });
    } catch (e) {
      next(e);
    }
  });

  // ============ Asset Server (token auth) ============
  async function requireAssetServerToken(req: express.Request, teamSlug: string): Promise<boolean> {
    const token = getBearerToken(req);
    if (!token) {
      return false;
    }
    try {
      const overview = await getTeamOverviewBySlug(teamSlug);
      return safeEqualSecret(token, resolveTeamAssetServerToken(overview));
    } catch {
      return false;
    }
  }

  app.get("/api/teams/:slug/asset-server/manifest", async (req, res, next) => {
    try {
      if (!(await requireAssetServerToken(req, req.params.slug))) {
        res.status(401).json({ ok: false, error: "invalid asset server token" });
        return;
      }
      res.json(await getTeamAssetServerManifestBySlug(req.params.slug));
    } catch (e) {
      next(e);
    }
  });

  app.get("/api/teams/:slug/asset-server/bundle", async (req, res, next) => {
    try {
      if (!(await requireAssetServerToken(req, req.params.slug))) {
        res.status(401).json({ ok: false, error: "invalid" });
        return;
      }
      res.json(await getTeamAssetServerBundleBySlug(req.params.slug));
    } catch (e) {
      next(e);
    }
  });

  app.get("/api/teams/:slug/asset-server/registry", async (req, res, next) => {
    try {
      if (!(await requireAssetServerToken(req, req.params.slug))) {
        res.status(401).json({ ok: false, error: "invalid" });
        return;
      }
      res.json(await getTeamAssetCapabilityRegistryBySlug(req.params.slug));
    } catch (e) {
      next(e);
    }
  });

  app.get("/api/teams/:slug/asset-server/items/:id", async (req, res, next) => {
    try {
      if (!(await requireAssetServerToken(req, req.params.slug))) {
        res.status(401).json({ ok: false, error: "invalid" });
        return;
      }
      const item = await getTeamAssetServerItemById(req.params.slug, req.params.id);
      if (!item) {
        res.status(404).json({ ok: false, error: "not found" });
        return;
      }
      res.json(item);
    } catch (e) {
      next(e);
    }
  });

  app.post("/api/teams/:slug/asset-server/resolve", async (req, res, next) => {
    try {
      if (!(await requireAssetServerToken(req, req.params.slug))) {
        res.status(401).json({ ok: false, error: "invalid" });
        return;
      }
      res.json(
        await resolveTeamAssetServerMatchesBySlug(req.params.slug, {
          query: req.body?.query ?? "",
          kinds: req.body?.kinds,
          limitPerKind: req.body?.limitPerKind,
        }),
      );
    } catch (e) {
      next(e);
    }
  });

  // SSE for asset changes
  app.get("/api/teams/:slug/asset-server/events", async (req, res) => {
    const teamSlug = req.params.slug;
    if (!(await requireAssetServerToken(req, teamSlug))) {
      res.status(401).json({ ok: false, error: "invalid" });
      return;
    }
    res.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    });
    res.write("event: connected\ndata: {}\n\n");

    const onChange = (event: AssetChangeEvent) => {
      if (event.teamSlug === teamSlug) {
        res.write(`event: asset_change\ndata: ${JSON.stringify(event)}\n\n`);
      }
    };
    assetChangeEmitter.on("change", onChange);
    const keepalive = setInterval(() => res.write(":keepalive\n\n"), 30_000);

    req.on("close", () => {
      assetChangeEmitter.off("change", onChange);
      clearInterval(keepalive);
    });
  });

  // ============ Error handler ============
  app.use(
    (err: unknown, req: express.Request, res: express.Response, _next: express.NextFunction) => {
      const status =
        typeof err === "object" && err !== null && "status" in err && typeof err.status === "number"
          ? err.status
          : 500;
      const message = err instanceof Error ? err.message : "Unknown error";
      if (!req.path.startsWith("/api/") && req.accepts("html")) {
        res.status(status).type("html").send(renderErrorPage("VelaClaw Error", message));
        return;
      }
      res.status(status).json({ ok: false, error: message });
    },
  );

  return app;
}

const isMain = import.meta.url === `file://${process.argv[1]}`;
if (isMain) {
  const app = createVelaclawApp();
  app.listen(port, () =>
    console.log(`Velaclaw control plane listening on http://127.0.0.1:${port}`),
  );
}
