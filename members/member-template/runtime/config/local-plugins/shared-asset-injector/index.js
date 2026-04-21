import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { definePluginEntry } from "velaclaw/plugin-sdk/plugin-entry";

function resolveStateDir() {
  return (
    process.env.VELACLAW_STATE_DIR?.trim() ||
    process.env.VELACLAW_MEMBER_STATE_DIR?.trim() ||
    "/home/node/.velaclaw"
  );
}

const DEFAULT_WORKSPACE_ROOT =
  process.env.VELACLAW_WORKSPACE_DIR?.trim() || `${resolveStateDir()}/workspace`;
const DEFAULT_STATE_PATH =
  process.env.VELACLAW_SHARED_ASSETS_STATE_PATH?.trim() ||
  `${resolveStateDir()}/shared-assets-state.json`;
const DEFAULT_SYNC_TTL_MS = 30000;
const DEFAULT_RESOLVE_LIMIT_PER_KIND = 2;
const DEFAULT_KIND_ORDER = ["memory", "workflows", "docs", "tools", "skills"];
const LEGACY_BOOTSTRAP_PREFIX = "# BOOTSTRAP.md - Hello, World";
const ACTIVE_DOCS_DIR = ["docs", "team-shared", "active"];
const ACTIVE_CONFIG_DIR = ["config", "team-shared", "active"];
const ACTIVE_MOUNTS_DIR = ["team-shared-active"];

function asTrimmedString(value) {
  return typeof value === "string" ? value.trim() : "";
}

async function safeReadJson(filePath, fallback) {
  try {
    return JSON.parse(await fs.readFile(filePath, "utf8"));
  } catch {
    return fallback;
  }
}

async function safeWriteJson(filePath, value) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function slugify(value) {
  return (
    String(value || "")
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 80) || "asset"
  );
}

function wrapSkillDoc(name, description, content) {
  const trimmed = String(content || "").trim();
  if (trimmed.startsWith("---")) {
    return `${trimmed}\n`;
  }
  return `---\nname: ${name}\ndescription: ${description}\n---\n\n${trimmed}\n`;
}

function isCommandOnly(text) {
  return String(text || "")
    .trim()
    .startsWith("/");
}

function flattenMessageText(messageLike) {
  if (!messageLike) {
    return "";
  }
  if (typeof messageLike === "string") {
    return messageLike.trim();
  }

  const nestedMessage = flattenMessageText(messageLike.message);
  if (nestedMessage) {
    return nestedMessage;
  }

  const directText = asTrimmedString(messageLike.text || messageLike.body || messageLike.content);
  if (directText) {
    return directText;
  }

  const content = Array.isArray(messageLike.content) ? messageLike.content : [];
  const parts = content
    .filter((entry) => entry && entry.type === "text" && typeof entry.text === "string")
    .map((entry) => entry.text.trim())
    .filter(Boolean);
  return parts.length ? parts.join("\n") : "";
}

function extractEventText(event) {
  const direct = flattenMessageText(event);
  if (direct) {
    return direct;
  }

  const message = flattenMessageText(event?.message);
  if (message) {
    return message;
  }

  const messages = Array.isArray(event?.messages) ? event.messages : [];
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const candidate = messages[index];
    const role = candidate?.role || candidate?.message?.role;
    if (role && role !== "user") {
      continue;
    }
    const text = flattenMessageText(candidate);
    if (text) {
      return text;
    }
  }
  return "";
}

function normalizeKind(value) {
  return typeof value === "string" ? value.trim() : "";
}

function resolveManifestKinds(manifest, matches) {
  const kinds = new Set();
  for (const kind of Object.keys(manifest?.counts || {})) {
    if (normalizeKind(kind)) {
      kinds.add(kind);
    }
  }
  for (const item of Array.isArray(manifest?.items) ? manifest.items : []) {
    const kind = normalizeKind(item?.kind);
    if (kind) {
      kinds.add(kind);
    }
  }
  for (const kind of Object.keys(matches || {})) {
    if (normalizeKind(kind)) {
      kinds.add(kind);
    }
  }
  if (!kinds.size) {
    for (const kind of DEFAULT_KIND_ORDER) {
      kinds.add(kind);
    }
  }
  const extras = [...kinds]
    .filter((kind) => !DEFAULT_KIND_ORDER.includes(kind))
    .toSorted((a, b) => a.localeCompare(b));
  return [...DEFAULT_KIND_ORDER.filter((kind) => kinds.has(kind)), ...extras];
}

function getMaterializationTargets(item) {
  return Array.isArray(item?.materializationTargets)
    ? item.materializationTargets.filter((value) => typeof value === "string" && value.trim())
    : [];
}

function shouldMaterializeAsSkill(item) {
  const targets = getMaterializationTargets(item);
  return targets.includes("workspace.skills.active") || item?.kind === "skills";
}

function shouldMaterializeAsConfigOverlay(item) {
  return getMaterializationTargets(item).includes("workspace.config.overlay");
}

function shouldMaterializeAsMount(item) {
  return getMaterializationTargets(item).includes("workspace.mount");
}

function shouldInjectIntoPrompt(item) {
  const targets = getMaterializationTargets(item);
  if (targets.length === 0) {
    return item?.kind === "memory" || item?.kind === "workflows" || item?.kind === "docs";
  }
  return targets.includes("prompt.prepend");
}

function activeDocsRoot(workspaceRoot) {
  return path.join(workspaceRoot, ...ACTIVE_DOCS_DIR);
}

function activeConfigRoot(workspaceRoot) {
  return path.join(workspaceRoot, ...ACTIVE_CONFIG_DIR);
}

function activeMountsRoot(workspaceRoot) {
  return path.join(workspaceRoot, ...ACTIVE_MOUNTS_DIR);
}

function selectionHash(manifestHash, query, matches) {
  const kinds = resolveManifestKinds(undefined, matches);
  return crypto
    .createHash("sha256")
    .update(
      JSON.stringify({
        manifestHash,
        query,
        matches: Object.fromEntries(
          kinds.map((kind) => [
            kind,
            Array.isArray(matches?.[kind]) ? matches[kind].map((item) => item.id) : [],
          ]),
        ),
      }),
    )
    .digest("hex");
}

async function fetchJson(url, token, init = {}) {
  const response = await fetch(url, {
    method: init.method || "GET",
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/json",
      ...(init.body ? { "Content-Type": "application/json" } : {}),
      ...init.headers,
    },
    body: init.body,
    signal: init.signal,
  });

  const text = await response.text();
  let payload;
  try {
    payload = JSON.parse(text);
  } catch {
    payload = text;
  }
  if (!response.ok) {
    throw new Error(typeof payload === "string" ? payload : JSON.stringify(payload));
  }
  return payload;
}

async function ensureDir(dirPath) {
  await fs.mkdir(dirPath, { recursive: true });
}

async function resetPath(dirPath) {
  await fs.rm(dirPath, { recursive: true, force: true });
  await ensureDir(dirPath);
}

function normalizeManifest(manifest) {
  return {
    team: manifest?.team || { slug: "unknown", name: "Unknown Team" },
    generatedAt: manifest?.generatedAt || new Date().toISOString(),
    manifestHash: String(manifest?.manifestHash || ""),
    counts: manifest?.counts || {},
    items: Array.isArray(manifest?.items) ? manifest.items : [],
  };
}

async function writeCatalog(manifest, workspaceRoot) {
  const normalized = normalizeManifest(manifest);
  const catalogRoot = path.join(workspaceRoot, "docs", "team-shared", "catalog");
  const catalogSkillRoot = path.join(workspaceRoot, "skills", "team-shared-catalog");

  await resetPath(catalogRoot);
  await resetPath(catalogSkillRoot);
  await safeWriteJson(path.join(catalogRoot, "manifest.json"), normalized);

  const catalogIndexLines = [
    "# Team Shared Asset Catalog",
    "",
    `Team: ${normalized.team.name} (${normalized.team.slug})`,
    `Generated: ${normalized.generatedAt}`,
    `Published assets: ${normalized.items.length}`,
    "",
  ];

  const skillLines = [
    "---",
    "name: team-shared-catalog",
    "description: Browse the shared team asset catalog. Relevant assets for the current task will be materialized into active shared directories.",
    "---",
    "",
    `Team: ${normalized.team.name} (${normalized.team.slug})`,
    "",
    "Use this catalog to discover team-shared assets without loading every asset into context.",
    "Relevant assets for the current task, when selected by the injector, are placed under:",
    `- ${workspaceRoot}/skills/team-shared-active-<skill>`,
    `- ${path.join(workspaceRoot, ...ACTIVE_DOCS_DIR)}`,
    `- ${path.join(workspaceRoot, ...ACTIVE_CONFIG_DIR)}`,
    `- ${path.join(workspaceRoot, ...ACTIVE_MOUNTS_DIR)}`,
    "",
    "Published counts:",
  ];

  const kinds = resolveManifestKinds(normalized);
  for (const kind of kinds) {
    const count = Number(normalized.counts?.[kind] || 0);
    skillLines.push(`- ${kind}: ${count}`);
  }
  skillLines.push("");

  for (const kind of kinds) {
    const items = normalized.items.filter((item) => item.kind === kind);
    if (!items.length) {
      continue;
    }
    catalogIndexLines.push(`## ${kind}`);
    skillLines.push(`${kind.toUpperCase()}:`);
    for (const item of items) {
      const keywords =
        Array.isArray(item.keywords) && item.keywords.length
          ? ` | keywords: ${item.keywords.slice(0, 6).join(", ")}`
          : "";
      catalogIndexLines.push(`- ${item.title}: ${item.summary}${keywords}`);
      skillLines.push(`- ${item.title}: ${item.summary}`);
    }
    catalogIndexLines.push("");
    skillLines.push("");
  }

  await fs.writeFile(
    path.join(catalogRoot, "INDEX.md"),
    `${catalogIndexLines.join("\n")}\n`,
    "utf8",
  );
  await fs.writeFile(path.join(catalogSkillRoot, "SKILL.md"), `${skillLines.join("\n")}\n`, "utf8");
}

async function clearActiveSelection(workspaceRoot) {
  const skillsRoot = path.join(workspaceRoot, "skills");
  await ensureDir(skillsRoot);
  const entries = await fs.readdir(skillsRoot, { withFileTypes: true }).catch(() => []);
  for (const entry of entries) {
    if (entry.isDirectory() && entry.name.startsWith("team-shared-active-")) {
      await fs.rm(path.join(skillsRoot, entry.name), { recursive: true, force: true });
    }
  }
  await resetPath(activeDocsRoot(workspaceRoot));
  await resetPath(activeConfigRoot(workspaceRoot));
  await resetPath(activeMountsRoot(workspaceRoot));
}

async function writeBootstrapContext(workspaceRoot, content) {
  const bootstrapPath = path.join(workspaceRoot, "BOOTSTRAP.md");
  const text = String(content || "").trim();
  if (!text) {
    await fs.rm(bootstrapPath, { force: true });
    return;
  }
  await fs.writeFile(bootstrapPath, `${text}\n`, "utf8");
}

async function readBootstrapContext(workspaceRoot) {
  try {
    const value = await fs.readFile(path.join(workspaceRoot, "BOOTSTRAP.md"), "utf8");
    return (value || "").trim();
  } catch {
    return "";
  }
}

async function clearLegacyBootstrapTemplate(workspaceRoot) {
  const current = await readBootstrapContext(workspaceRoot);
  if (!current.startsWith(LEGACY_BOOTSTRAP_PREFIX)) {
    return;
  }
  await writeBootstrapContext(workspaceRoot, "");
}

async function writeActiveSelection(manifest, query, matches, itemsById, workspaceRoot) {
  const skillsRoot = path.join(workspaceRoot, "skills");
  const sharedDocsRoot = activeDocsRoot(workspaceRoot);
  const sharedConfigRoot = activeConfigRoot(workspaceRoot);
  const sharedMountsRoot = activeMountsRoot(workspaceRoot);

  await clearActiveSelection(workspaceRoot);
  await ensureDir(skillsRoot);

  const selectionSummary = {
    team: manifest.team,
    manifestHash: manifest.manifestHash,
    query,
    generatedAt: new Date().toISOString(),
    matches: Object.fromEntries(
      resolveManifestKinds(manifest, matches).map((kind) => [
        kind,
        (matches?.[kind] || []).map((item) => ({
          id: item.id,
          title: item.title,
          score: item.score,
          matchedTerms: item.matchedTerms,
        })),
      ]),
    ),
  };

  const overviewLines = [
    "# Active Team Shared Assets",
    "",
    `Team: ${manifest.team.name} (${manifest.team.slug})`,
    `Query: ${query}`,
    `Generated: ${selectionSummary.generatedAt}`,
    "",
  ];

  for (const kind of resolveManifestKinds(manifest, matches)) {
    const activeItems = Array.isArray(matches?.[kind]) ? matches[kind] : [];
    if (!activeItems.length) {
      continue;
    }

    overviewLines.push(`## ${kind}`);
    for (const match of activeItems) {
      const item = itemsById.get(match.id);
      if (!item) {
        continue;
      }
      overviewLines.push(`- ${item.title}: ${item.summary}`);
      if (shouldMaterializeAsSkill(item)) {
        const skillDir = path.join(skillsRoot, `team-shared-active-${slugify(item.title)}`);
        await ensureDir(skillDir);
        await fs.writeFile(
          path.join(skillDir, "SKILL.md"),
          wrapSkillDoc(slugify(item.title), item.summary || item.title, item.content),
          "utf8",
        );
      } else if (shouldMaterializeAsConfigOverlay(item)) {
        const targetDir = path.join(sharedConfigRoot, kind || "other");
        await ensureDir(targetDir);
        await fs.writeFile(
          path.join(targetDir, item.filename),
          `${String(item.content || "").trim()}\n`,
          "utf8",
        );
      } else if (shouldMaterializeAsMount(item)) {
        const targetDir = path.join(sharedMountsRoot, kind || "other");
        await ensureDir(targetDir);
        await fs.writeFile(
          path.join(targetDir, item.filename),
          `${String(item.content || "").trim()}\n`,
          "utf8",
        );
      } else {
        const targetDir = path.join(sharedDocsRoot, kind || "other");
        await ensureDir(targetDir);
        await fs.writeFile(
          path.join(targetDir, item.filename),
          `${String(item.content || "").trim()}\n`,
          "utf8",
        );
      }
    }
    overviewLines.push("");
  }

  await safeWriteJson(path.join(sharedDocsRoot, "selection.json"), selectionSummary);
  await fs.writeFile(
    path.join(sharedDocsRoot, "README.md"),
    `${overviewLines.join("\n")}\n`,
    "utf8",
  );
}

function buildPromptAdditionFromSelection(selection, itemsById) {
  if (!selection?.query) {
    return "";
  }

  const lines = [
    "<team_shared_active_context>",
    "Use the following shared team context only when it is relevant to the user's current task.",
    "If a workflow block matches the task, follow its required structure exactly.",
    "If a memory block contains a team preference, required phrase, or standing rule that matches the task, honor it exactly.",
    "If active config overlays or mounted artifacts are listed below, inspect those paths before improvising local equivalents.",
    `Current task query: ${selection.query}`,
    "",
  ];

  const orderedKinds = resolveManifestKinds(undefined, selection?.matches);
  for (const kind of orderedKinds) {
    const items = Array.isArray(selection?.matches?.[kind]) ? selection.matches[kind] : [];
    if (!items.length) {
      continue;
    }
    const promptItems = items
      .map((match) => ({ match, item: itemsById.get(match.id) }))
      .filter(({ item }) => item && shouldInjectIntoPrompt(item));
    if (!promptItems.length) {
      continue;
    }
    lines.push(`${kind.toUpperCase()}:`);
    for (const { item } of promptItems) {
      lines.push(`- ${item.title}: ${item.summary}`);
      if (kind === "memory" || kind === "workflows") {
        const excerpt = String(item.content || "")
          .trim()
          .split("\n")
          .slice(0, 24)
          .join("\n");
        if (excerpt) {
          lines.push(
            kind === "memory" ? "  Required memory content:" : "  Required workflow content:",
          );
          lines.push(...excerpt.split("\n").map((line) => `    ${line}`));
        }
      }
    }
    lines.push("");
  }

  for (const kind of orderedKinds) {
    const items = Array.isArray(selection?.matches?.[kind]) ? selection.matches[kind] : [];
    if (!items.length) {
      continue;
    }
    const configItems = items
      .map((match) => itemsById.get(match.id))
      .filter((item) => item && shouldMaterializeAsConfigOverlay(item));
    if (configItems.length > 0) {
      lines.push(`ACTIVE CONFIG OVERLAYS (${kind.toUpperCase()}):`);
      for (const item of configItems) {
        lines.push(
          `- ${item.title}: ${item.summary} (path: config/team-shared/active/${kind || "other"}/${item.filename})`,
        );
      }
      lines.push("");
    }
    const mountItems = items
      .map((match) => itemsById.get(match.id))
      .filter((item) => item && shouldMaterializeAsMount(item));
    if (mountItems.length > 0) {
      lines.push(`ACTIVE MOUNTED ASSETS (${kind.toUpperCase()}):`);
      for (const item of mountItems) {
        lines.push(
          `- ${item.title}: ${item.summary} (path: team-shared-active/${kind || "other"}/${item.filename})`,
        );
      }
      lines.push("");
    }
  }

  if (lines.length <= 3) {
    return "";
  }
  lines.push("</team_shared_active_context>");
  return `${lines.join("\n").trim()}\n`;
}

async function ensureManifestSynced(config) {
  const assetServerBaseUrl = config?.assetServerBaseUrl;
  const assetServerToken = config?.assetServerToken;
  if (!assetServerBaseUrl || !assetServerToken) {
    return null;
  }

  const workspaceRoot = config?.workspaceRoot || DEFAULT_WORKSPACE_ROOT;
  const statePath = config?.statePath || DEFAULT_STATE_PATH;
  const syncTtlMs = Number(config?.syncTtlMs ?? DEFAULT_SYNC_TTL_MS);
  const now = Date.now();
  const state = await safeReadJson(statePath, {
    manifestHash: null,
    manifest: null,
    lastCheckedAt: 0,
    lastAppliedAt: null,
    activeSelectionHash: null,
    activeSelectionQuery: null,
    activeSelectionAt: null,
  });

  if (
    state.manifest &&
    Number(state.lastCheckedAt || 0) > 0 &&
    now - Number(state.lastCheckedAt) < syncTtlMs
  ) {
    return {
      workspaceRoot,
      statePath,
      state,
      manifest: normalizeManifest(state.manifest),
    };
  }

  const manifest = normalizeManifest(
    await fetchJson(`${assetServerBaseUrl}/manifest`, assetServerToken),
  );
  state.lastCheckedAt = now;

  if (state.manifestHash !== manifest.manifestHash) {
    await writeCatalog(manifest, workspaceRoot);
    state.manifestHash = manifest.manifestHash;
    state.manifest = manifest;
    state.lastAppliedAt = new Date().toISOString();
    state.activeSelectionHash = null;
  } else if (!state.manifest) {
    state.manifest = manifest;
  }

  await safeWriteJson(statePath, state);
  return { workspaceRoot, statePath, state, manifest };
}

async function syncSharedAssetsForEvent(config, eventText) {
  const synced = await ensureManifestSynced(config);
  if (!synced) {
    return null;
  }

  const { workspaceRoot, statePath, state, manifest } = synced;
  const assetServerBaseUrl = config?.assetServerBaseUrl;
  const assetServerToken = config?.assetServerToken;
  const query = String(eventText || "").trim();

  if (!query || isCommandOnly(query)) {
    await writeBootstrapContext(workspaceRoot, "");
    return { manifest, selection: null, promptAddition: "" };
  }

  const resolveLimitPerKind = Math.max(
    1,
    Math.min(6, Number(config?.resolveLimitPerKind ?? DEFAULT_RESOLVE_LIMIT_PER_KIND)),
  );
  const resolveResult = await fetchJson(`${assetServerBaseUrl}/resolve`, assetServerToken, {
    method: "POST",
    body: JSON.stringify({ query, limitPerKind: resolveLimitPerKind }),
  });

  const nextSelectionHash = selectionHash(manifest.manifestHash, query, resolveResult.matches);
  if (state.activeSelectionHash === nextSelectionHash) {
    return {
      manifest,
      selection: resolveResult,
      promptAddition: await readBootstrapContext(workspaceRoot),
    };
  }

  const selectedIds = Array.from(
    new Set(
      resolveManifestKinds(manifest, resolveResult.matches).flatMap((kind) =>
        Array.isArray(resolveResult?.matches?.[kind])
          ? resolveResult.matches[kind].map((item) => item.id)
          : [],
      ),
    ),
  );

  const itemsById = new Map();
  for (const itemId of selectedIds) {
    const item = await fetchJson(
      `${assetServerBaseUrl}/items/${encodeURIComponent(itemId)}`,
      assetServerToken,
    );
    itemsById.set(itemId, item);
  }

  await writeActiveSelection(manifest, query, resolveResult.matches, itemsById, workspaceRoot);
  await writeBootstrapContext(
    workspaceRoot,
    buildPromptAdditionFromSelection({ query, matches: resolveResult.matches }, itemsById),
  );
  state.activeSelectionHash = nextSelectionHash;
  state.activeSelectionQuery = query;
  state.activeSelectionAt = new Date().toISOString();
  await safeWriteJson(statePath, state);

  return {
    manifest,
    selection: resolveResult,
    itemsById,
    promptAddition: await readBootstrapContext(workspaceRoot),
  };
}

export default definePluginEntry({
  id: "shared-asset-injector",
  name: "Shared Asset Injector",
  description:
    "Sync the shared team asset catalog and materialize task-relevant assets into the member workspace.",
  register(api) {
    async function syncCatalogOnly() {
      try {
        const cfg = api.pluginConfig || {};
        const workspaceRoot = cfg.workspaceRoot || DEFAULT_WORKSPACE_ROOT;
        await clearLegacyBootstrapTemplate(workspaceRoot);
        await ensureManifestSynced(cfg);
      } catch (error) {
        console.error(
          "[shared-asset-injector] catalog sync failed:",
          error instanceof Error ? error.message : String(error),
        );
      }
    }

    async function syncForEvent(event) {
      try {
        const eventText = extractEventText(event);
        if (!eventText) {
          return;
        }
        await syncSharedAssetsForEvent(api.pluginConfig || {}, eventText);
      } catch (error) {
        console.error(
          "[shared-asset-injector] event sync failed:",
          error instanceof Error ? error.message : String(error),
        );
      }
    }

    api.on("session_start", async () => {
      await syncCatalogOnly();
    });

    api.on("before_dispatch", async (event) => {
      await syncForEvent(event);
    });

    api.on("before_prompt_build", async (event) => {
      const text =
        typeof event.prompt === "string" && event.prompt.trim()
          ? event.prompt
          : extractEventText(event);
      const result = await syncSharedAssetsForEvent(api.pluginConfig || {}, text);
      const prependContext = (result?.promptAddition || "").trim();
      return prependContext ? { prependContext } : {};
    });
  },
});
