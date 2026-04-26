import { Type } from "@sinclair/typebox";
import type { VelaclawConfig } from "../../config/types.velaclaw.js";
import type { LookupFn } from "../../infra/net/ssrf.js";
import type {
  RuntimeWebFetchMetadata,
  RuntimeWebSearchMetadata,
} from "../../secrets/runtime-web-tools.types.js";
import {
  normalizeLowercaseStringOrEmpty,
  normalizeOptionalString,
} from "../../shared/string-coerce.js";
import { isRecord } from "../../utils.js";
import { stringEnum } from "../schema/typebox.js";
import type { AnyAgentTool } from "./common.js";
import { jsonResult, readNumberParam, readStringArrayParam, readStringParam } from "./common.js";
import { createWebFetchTool } from "./web-fetch.js";
import { createWebSearchTool } from "./web-search.js";

const RESEARCH_MODES = [
  "general",
  "official_announcement",
  "market_driver",
  "technical_docs",
] as const;
const RESEARCH_FRESHNESS = ["current", "today", "week", "any"] as const;
const SOURCE_STATUSES = ["used", "no_relevant_update", "blocked", "error"] as const;

type ResearchMode = (typeof RESEARCH_MODES)[number];
type ResearchFreshness = (typeof RESEARCH_FRESHNESS)[number];
type SourceStatus = (typeof SOURCE_STATUSES)[number];
type SourceType = "primary" | "discovery" | "secondary" | "provided";

type SourceCandidate = {
  url: string;
  name?: string;
  sourceType: SourceType;
  reason: string;
  evidence?: string;
  publishedAt?: string;
};

type ResearchSource = SourceCandidate & {
  status: SourceStatus;
  finalUrl?: string;
  fetchedAt?: string;
  httpStatus?: number;
  title?: string;
  evidence: string;
  error?: string;
  provider?: string;
};

const DEFAULT_MAX_SOURCES = 8;
const MAX_SOURCE_CAP = 12;
const DEFAULT_MAX_CHARS_PER_SOURCE = 4_000;
const MAX_CHARS_PER_SOURCE_CAP = 12_000;
const SEARCH_RESULT_FETCH_LIMIT = 4;

const ResearchTaskSchema = Type.Object(
  {
    query: Type.String({
      description: "Research question to answer with fresh web evidence.",
    }),
    mode: Type.Optional(
      stringEnum(RESEARCH_MODES, {
        description:
          'Research strategy. Use "official_announcement" for company/newsroom claims and "market_driver" for why-price-moved questions.',
        default: "general",
      }),
    ),
    freshness: Type.Optional(
      stringEnum(RESEARCH_FRESHNESS, {
        description: 'Freshness target: "today", "week", "current", or "any".',
        default: "current",
      }),
    ),
    urls: Type.Optional(
      Type.Array(Type.String({ description: "Known URLs to fetch as provided sources." })),
    ),
    officialDomains: Type.Optional(
      Type.Array(
        Type.String({
          description:
            "Official domains to bias discovery toward, e.g. a company newsroom, investor relations site, docs site, or status page.",
        }),
      ),
    ),
    discoveryQueries: Type.Optional(
      Type.Array(Type.String({ description: "Additional web_search queries for second-pass discovery." })),
    ),
    maxSources: Type.Optional(
      Type.Number({
        description: "Maximum source candidates to fetch or report.",
        minimum: 1,
        maximum: MAX_SOURCE_CAP,
        default: DEFAULT_MAX_SOURCES,
      }),
    ),
    maxCharsPerSource: Type.Optional(
      Type.Number({
        description: "Maximum characters to fetch per source.",
        minimum: 500,
        maximum: MAX_CHARS_PER_SOURCE_CAP,
        default: DEFAULT_MAX_CHARS_PER_SOURCE,
      }),
    ),
  },
  { additionalProperties: false },
);

function clampInteger(value: number | undefined, fallback: number, min: number, max: number): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return fallback;
  }
  return Math.max(min, Math.min(max, Math.floor(value)));
}

function normalizeMode(value: string | undefined, query: string): ResearchMode {
  const normalized = normalizeLowercaseStringOrEmpty(value);
  if (RESEARCH_MODES.includes(normalized as ResearchMode)) {
    return normalized as ResearchMode;
  }
  const queryLower = normalizeLowercaseStringOrEmpty(query);
  if (
    queryLower.includes("公告") ||
    queryLower.includes("宣布") ||
    queryLower.includes("announcement") ||
    queryLower.includes("press release") ||
    queryLower.includes("newsroom")
  ) {
    return "official_announcement";
  }
  if (
    queryLower.includes("股价") ||
    queryLower.includes("上涨") ||
    queryLower.includes("下跌") ||
    queryLower.includes("why is") ||
    queryLower.includes("stock") ||
    queryLower.includes("market") ||
    queryLower.includes("driver")
  ) {
    return "market_driver";
  }
  if (
    queryLower.includes("api") ||
    queryLower.includes("docs") ||
    queryLower.includes("文档") ||
    queryLower.includes("release notes")
  ) {
    return "technical_docs";
  }
  return "general";
}

function normalizeFreshness(value: string | undefined, query: string): ResearchFreshness {
  const normalized = normalizeLowercaseStringOrEmpty(value);
  if (RESEARCH_FRESHNESS.includes(normalized as ResearchFreshness)) {
    return normalized as ResearchFreshness;
  }
  const queryLower = normalizeLowercaseStringOrEmpty(query);
  if (queryLower.includes("今天") || queryLower.includes("today")) {
    return "today";
  }
  if (queryLower.includes("最近") || queryLower.includes("latest") || queryLower.includes("current")) {
    return "current";
  }
  return "current";
}

function safeUrl(value: string): string | undefined {
  const trimmed = value.trim();
  if (!trimmed) {
    return undefined;
  }
  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      return undefined;
    }
    return parsed.toString();
  } catch {
    return undefined;
  }
}

function urlFromDomain(value: string): string | undefined {
  const trimmed = value.trim();
  if (!trimmed) {
    return undefined;
  }
  const withProtocol = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  return safeUrl(withProtocol);
}

function sourceNameFromUrl(url: string): string {
  try {
    const parsed = new URL(url);
    const host = parsed.hostname.replace(/^www\./i, "");
    const path = parsed.pathname.replace(/\/$/, "");
    if (!path || path === "/") {
      return host;
    }
    const lastSegment = path.split("/").findLast(Boolean);
    return lastSegment ? `${host}/${lastSegment}` : host;
  } catch {
    return url;
  }
}

function addCandidate(
  target: SourceCandidate[],
  seen: Set<string>,
  candidate: SourceCandidate,
): void {
  const url = safeUrl(candidate.url);
  if (!url || seen.has(url)) {
    return;
  }
  seen.add(url);
  target.push({
    ...candidate,
    url,
    name: candidate.name || sourceNameFromUrl(url),
  });
}

function buildMarketCatalystDiscoveryQueries(query: string): string[] {
  const trimmed = query.trim();
  if (!trimmed) {
    return [];
  }
  const queryLower = normalizeLowercaseStringOrEmpty(trimmed);
  const subject = trimmed;
  const values = [
    `${subject} market driver industry news customer demand competitor news`,
    `${subject} stock catalyst customer launch product cycle supply chain capex sector rotation`,
  ];
  if (
    queryLower.includes("ai") ||
    queryLower.includes("人工智能") ||
    queryLower.includes("模型") ||
    queryLower.includes("算力") ||
    queryLower.includes("芯片") ||
    queryLower.includes("semiconductor") ||
    queryLower.includes("gpu")
  ) {
    values.push(
      `${subject} AI model releases compute demand stock catalyst`,
      `${subject} AI chip demand customer launches competitor model efficiency`,
    );
  }
  return Array.from(new Set(values));
}

function buildGoogleNewsRssUrl(query: string, freshness: ResearchFreshness): string {
  const freshnessHint =
    freshness === "today" ? "when:1d" : freshness === "week" || freshness === "current" ? "when:7d" : "";
  const search = [query, freshnessHint].filter(Boolean).join(" ");
  return `https://news.google.com/rss/search?q=${encodeURIComponent(search)}&hl=en-US&gl=US&ceid=US%3Aen`;
}

function buildSeedCandidates(params: {
  query: string;
  mode: ResearchMode;
  freshness: ResearchFreshness;
  urls?: string[];
  officialDomains?: string[];
}): SourceCandidate[] {
  const candidates: SourceCandidate[] = [];
  const seen = new Set<string>();
  for (const url of params.urls ?? []) {
    addCandidate(candidates, seen, {
      url,
      sourceType: "provided",
      reason: "User-provided URL.",
    });
  }

  for (const domain of params.officialDomains ?? []) {
    const url = urlFromDomain(domain);
    if (!url) {
      continue;
    }
    addCandidate(candidates, seen, {
      url,
      sourceType: "primary",
      reason: "User-provided official domain.",
    });
  }

  if (params.mode === "market_driver") {
    for (const [index, query] of buildMarketCatalystDiscoveryQueries(params.query).entries()) {
      addCandidate(candidates, seen, {
        url: buildGoogleNewsRssUrl(query, params.freshness),
        name: `Google News RSS: adjacent catalyst ${index + 1}`,
        sourceType: "discovery",
        reason:
          "Adjacent industry catalyst discovery for customer demand, product cycles, competitors, supply chain, capex, or sector rotation.",
      });
    }
  }

  if (params.mode !== "technical_docs") {
    addCandidate(candidates, seen, {
      url: buildGoogleNewsRssUrl(params.query, params.freshness),
      name: "Google News RSS discovery",
      sourceType: "discovery",
      reason: "Key-free news RSS discovery for broader coverage when web_search is unavailable.",
    });
  }

  if (params.mode === "technical_docs") {
    for (const domain of params.officialDomains ?? []) {
      const url = urlFromDomain(domain);
      if (!url) {
        continue;
      }
      addCandidate(candidates, seen, {
        url,
        sourceType: "primary",
        reason: "Official documentation domain.",
      });
    }
  }

  return candidates;
}

function buildSearchQueries(params: {
  query: string;
  mode: ResearchMode;
  freshness: ResearchFreshness;
  discoveryQueries?: string[];
  officialDomains?: string[];
}): string[] {
  const values: string[] = [];
  const push = (value: string | undefined) => {
    const normalized = value?.trim();
    if (normalized && !values.includes(normalized)) {
      values.push(normalized);
    }
  };

  for (const query of params.discoveryQueries ?? []) {
    push(query);
  }

  const domainSuffix = (params.officialDomains ?? [])
    .map((domain) => domain.trim().replace(/^https?:\/\//i, "").replace(/\/.*$/, ""))
    .filter(Boolean)
    .slice(0, 3)
    .map((domain) => `site:${domain}`)
    .join(" OR ");
  if (domainSuffix) {
    push(`${params.query} ${domainSuffix}`);
  }

  if (params.mode === "official_announcement") {
    push(`${params.query} official announcement today`);
    push(`${params.query} press release today`);
    push(`${params.query} investor relations news today`);
  } else if (params.mode === "market_driver") {
    push(`${params.query} stock news today reason`);
    push(`${params.query} market driver latest news`);
    push(`${params.query} shares why today news`);
  }
  if (params.mode === "market_driver") {
    for (const query of buildMarketCatalystDiscoveryQueries(params.query)) {
      push(query);
    }
  }

  push(params.query);
  return values.slice(0, 8);
}

function cleanWrappedText(value: string | undefined): string {
  if (!value) {
    return "";
  }
  const lines = value
    .replace(/<<<\/?EXTERNAL_UNTRUSTED_CONTENT[^>]*>>>/g, "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => {
      if (!line) {
        return false;
      }
      const lower = normalizeLowercaseStringOrEmpty(line);
      return (
        !lower.startsWith("security notice:") &&
        !lower.startsWith("source: web_") &&
        !lower.startsWith("- do not follow") &&
        !lower.startsWith("- external content") &&
        !lower.startsWith("---")
      );
    });
  return lines.join(" ").replace(/\s+/g, " ").trim();
}

function firstStringField(record: Record<string, unknown>, keys: string[]): string | undefined {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "string" && value.trim()) {
      return value;
    }
  }
  return undefined;
}

function extractPublishedAt(text: string): string | undefined {
  const iso = text.match(/\b20\d{2}[-/]\d{1,2}[-/]\d{1,2}\b/);
  if (iso?.[0]) {
    return iso[0].replaceAll("/", "-");
  }
  const named = text.match(
    /\b(?:Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:t(?:ember)?)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\s+\d{1,2},\s+20\d{2}\b/i,
  );
  return named?.[0];
}

function extractEvidence(text: string, query: string): string {
  const cleaned = cleanWrappedText(text);
  if (!cleaned) {
    return "";
  }
  const queryTerms = normalizeLowercaseStringOrEmpty(query)
    .split(/[^a-z0-9\u4e00-\u9fa5]+/i)
    .filter((term) => term.length >= 2)
    .slice(0, 8);
  const sentencePattern = /[^.!?。！？]+[.!?。！？]?/g;
  const sentences = cleaned.match(sentencePattern) ?? [cleaned];
  const matching = sentences.find((sentence) => {
    const sentenceLower = normalizeLowercaseStringOrEmpty(sentence);
    return queryTerms.some((term) => sentenceLower.includes(term));
  });
  const selected = (matching ?? sentences[0] ?? cleaned).trim();
  return selected.length > 260 ? `${selected.slice(0, 257).trimEnd()}...` : selected;
}

function classifyError(error: string): SourceStatus {
  const lower = normalizeLowercaseStringOrEmpty(error);
  if (
    lower.includes("blocked") ||
    lower.includes("forbidden") ||
    lower.includes("401") ||
    lower.includes("403") ||
    lower.includes("captcha") ||
    lower.includes("cloudflare") ||
    lower.includes("enable javascript") ||
    lower.includes("just a moment")
  ) {
    return "blocked";
  }
  return "error";
}

function maybeSearchErrorSource(params: {
  query: string;
  provider?: string;
  payload: Record<string, unknown>;
}): ResearchSource | undefined {
  const error = firstStringField(params.payload, ["error", "code"]);
  if (!error) {
    return undefined;
  }
  const message = firstStringField(params.payload, ["message", "detail"]) ?? error;
  return {
    url: "web_search://provider",
    name: `web_search${params.provider ? ` (${params.provider})` : ""}`,
    sourceType: "discovery",
    reason: `Discovery query failed: ${params.query}`,
    status: classifyError(message),
    evidence: message,
    error,
    provider: params.provider,
  };
}

function searchResultCandidates(params: {
  payload: Record<string, unknown>;
  query: string;
  provider?: string;
}): SourceCandidate[] {
  const candidates: SourceCandidate[] = [];
  const rawResults = Array.isArray(params.payload.results) ? params.payload.results : [];
  for (const result of rawResults.slice(0, SEARCH_RESULT_FETCH_LIMIT)) {
    if (!isRecord(result)) {
      continue;
    }
    const url = normalizeOptionalString(result.url);
    if (!url) {
      continue;
    }
    const title = cleanWrappedText(firstStringField(result, ["title"]) ?? "");
    const snippet = cleanWrappedText(
      firstStringField(result, ["snippet", "description", "content"]) ??
        (Array.isArray(result.snippets)
          ? result.snippets.filter((entry) => typeof entry === "string").join(" ")
          : ""),
    );
    candidates.push({
      url,
      name: title || undefined,
      sourceType: "discovery",
      reason: `Discovered by web_search${params.provider ? ` (${params.provider})` : ""}: ${params.query}`,
      evidence: snippet || title || undefined,
      publishedAt: firstStringField(result, ["published", "publishedAt", "date"]),
    });
  }

  const citations = Array.isArray(params.payload.citations) ? params.payload.citations : [];
  for (const citation of citations.slice(0, SEARCH_RESULT_FETCH_LIMIT)) {
    if (!isRecord(citation)) {
      continue;
    }
    const url = normalizeOptionalString(citation.url);
    if (!url) {
      continue;
    }
    candidates.push({
      url,
      name: cleanWrappedText(firstStringField(citation, ["title"]) ?? "") || undefined,
      sourceType: "discovery",
      reason: `Citation discovered by web_search${params.provider ? ` (${params.provider})` : ""}: ${params.query}`,
    });
  }
  return candidates;
}

async function runSearchPass(params: {
  webSearchTool: AnyAgentTool | null;
  query: string;
  queries: string[];
}): Promise<{ candidates: SourceCandidate[]; sources: ResearchSource[]; providers: string[] }> {
  const candidates: SourceCandidate[] = [];
  const sources: ResearchSource[] = [];
  const providers: string[] = [];
  if (!params.webSearchTool?.execute) {
    return { candidates, sources, providers };
  }

  for (const query of params.queries) {
    try {
      const result = await params.webSearchTool.execute(`research_task:web_search:${query}`, {
        query,
        count: SEARCH_RESULT_FETCH_LIMIT,
      });
      const payload = isRecord(result.details) ? result.details : {};
      const provider = normalizeOptionalString(payload.provider);
      if (provider) {
        providers.push(provider);
      }
      const errorSource = maybeSearchErrorSource({ query, provider, payload });
      if (errorSource) {
        sources.push(errorSource);
        continue;
      }
      candidates.push(...searchResultCandidates({ payload, query, provider }));
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      sources.push({
        url: "web_search://provider",
        name: "web_search",
        sourceType: "discovery",
        reason: `Discovery query failed: ${query}`,
        status: classifyError(message),
        evidence: message,
        error: message,
      });
    }
  }

  return { candidates, sources, providers: Array.from(new Set(providers)) };
}

async function fetchCandidate(params: {
  webFetchTool: AnyAgentTool | null;
  candidate: SourceCandidate;
  query: string;
  maxCharsPerSource: number;
  index: number;
}): Promise<ResearchSource> {
  if (!params.webFetchTool?.execute) {
    return {
      ...params.candidate,
      status: params.candidate.evidence ? "used" : "error",
      evidence: params.candidate.evidence ?? "web_fetch is unavailable; using search metadata only.",
      error: params.candidate.evidence ? undefined : "web_fetch unavailable",
    };
  }

  try {
    const result = await params.webFetchTool.execute(`research_task:web_fetch:${params.index}`, {
      url: params.candidate.url,
      extractMode: "markdown",
      maxChars: params.maxCharsPerSource,
    });
    const payload = isRecord(result.details) ? result.details : {};
    const text = firstStringField(payload, ["text"]) ?? "";
    const evidence = extractEvidence(text || params.candidate.evidence || "", params.query);
    const httpStatus =
      typeof payload.status === "number" && Number.isFinite(payload.status)
        ? Math.floor(payload.status)
        : undefined;
    const title = cleanWrappedText(firstStringField(payload, ["title"]) ?? "") || undefined;
    const finalUrl = normalizeOptionalString(payload.finalUrl);
    const fetchedAt = normalizeOptionalString(payload.fetchedAt);
    const publishedAt = params.candidate.publishedAt ?? extractPublishedAt(`${title ?? ""} ${text}`);
    const status: SourceStatus = evidence ? "used" : "no_relevant_update";
    return {
      ...params.candidate,
      finalUrl,
      fetchedAt,
      httpStatus,
      title,
      publishedAt,
      status,
      evidence: evidence || "Fetched successfully but no concise relevant evidence was extracted.",
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      ...params.candidate,
      status: classifyError(message),
      evidence: params.candidate.evidence ?? message,
      error: message,
    };
  }
}

function summarizeSources(sources: ResearchSource[]): Record<string, unknown> {
  const countByStatus: Record<SourceStatus, number> = {
    used: 0,
    no_relevant_update: 0,
    blocked: 0,
    error: 0,
  };
  const countByType: Record<SourceType, number> = {
    primary: 0,
    discovery: 0,
    secondary: 0,
    provided: 0,
  };
  for (const source of sources) {
    countByStatus[source.status] += 1;
    countByType[source.sourceType] += 1;
  }
  return {
    attemptedSources: sources.length,
    usedSources: countByStatus.used,
    blockedSources: countByStatus.blocked,
    errorSources: countByStatus.error,
    noRelevantUpdateSources: countByStatus.no_relevant_update,
    bySourceType: countByType,
  };
}

function padDatePart(value: number): string {
  return String(value).padStart(2, "0");
}

function buildTodayLabels(now = new Date()): { iso: string; labels: string[] } {
  const iso = `${now.getFullYear()}-${padDatePart(now.getMonth() + 1)}-${padDatePart(now.getDate())}`;
  const enLong = new Intl.DateTimeFormat("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  }).format(now);
  const enShort = new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(now);
  return {
    iso,
    labels: [iso, iso.replaceAll("-", "/"), enLong, enShort],
  };
}

function sourceMentionsAnyDateLabel(source: ResearchSource, labels: string[]): boolean {
  const haystack = normalizeLowercaseStringOrEmpty(
    [source.publishedAt, source.title, source.evidence].filter(Boolean).join(" "),
  );
  return labels.some((label) => haystack.includes(normalizeLowercaseStringOrEmpty(label)));
}

function hasTodayPrimaryEvidence(params: {
  freshness: ResearchFreshness;
  mode: ResearchMode;
  sources: ResearchSource[];
  todayLabels: string[];
}): boolean {
  if (params.freshness !== "today" || params.mode !== "official_announcement") {
    return true;
  }
  return params.sources.some(
    (source) =>
      source.status === "used" &&
      source.sourceType === "primary" &&
      sourceMentionsAnyDateLabel(source, params.todayLabels),
  );
}

function buildGaps(params: {
  mode: ResearchMode;
  freshness: ResearchFreshness;
  sources: ResearchSource[];
  todayLabels: string[];
  webSearchTool: AnyAgentTool | null;
  webFetchTool: AnyAgentTool | null;
}): string[] {
  const gaps: string[] = [];
  if (!params.webSearchTool) {
    gaps.push("web_search unavailable; second-pass discovery was limited to known URLs.");
  }
  if (!params.webFetchTool) {
    gaps.push("web_fetch unavailable; evidence may rely on search snippets only.");
  }
  const used = params.sources.filter((source) => source.status === "used");
  if (used.length === 0) {
    gaps.push("No source produced usable evidence; do not answer as confirmed.");
  }
  if (
    params.mode === "official_announcement" &&
    !used.some((source) => source.sourceType === "primary")
  ) {
    gaps.push("No primary/official source produced usable evidence.");
  }
  if (
    params.freshness === "today" &&
    params.mode === "official_announcement" &&
    !hasTodayPrimaryEvidence({
      freshness: params.freshness,
      mode: params.mode,
      sources: params.sources,
      todayLabels: params.todayLabels,
    })
  ) {
    gaps.push(
      `No used primary source mentioned today's date (${params.todayLabels[0]}); do not answer "yes" to a same-day announcement question.`,
    );
  }
  if (
    params.mode === "market_driver" &&
    used.length > 0 &&
    used.every((source) => source.sourceType === "secondary" && /quote|market-activity/i.test(source.url))
  ) {
    gaps.push("Only quote/headline pages were usable; do not infer causality without article evidence.");
  }
  return gaps;
}

function buildClaims(params: {
  mode: ResearchMode;
  freshness: ResearchFreshness;
  sources: ResearchSource[];
  todayLabels: string[];
}): string[] {
  const used = params.sources.filter((source) => source.status === "used");
  if (used.length === 0) {
    return ["Fresh lookup attempted, but evidence is insufficient for a confirmed answer."];
  }
  if (params.mode === "official_announcement") {
    if (
      params.freshness === "today" &&
      !hasTodayPrimaryEvidence({
        freshness: params.freshness,
        mode: params.mode,
        sources: params.sources,
        todayLabels: params.todayLabels,
      })
    ) {
      return [
        `Fresh lookup did not find primary evidence of a same-day announcement dated ${params.todayLabels[0]}. Answer as "not confirmed/no evidence found", not as "yes".`,
      ];
    }
    const primaryCount = used.filter((source) => source.sourceType === "primary").length;
    return [
      primaryCount > 0
        ? `Fresh lookup found usable evidence from ${primaryCount} primary source(s).`
        : "Fresh lookup found usable evidence only from non-primary sources.",
    ];
  }
  if (params.mode === "market_driver") {
    return [
      "Fresh lookup collected market/news sources; separate observed price facts from causal explanations in the final answer.",
    ];
  }
  return [`Fresh lookup found ${used.length} usable source(s).`];
}

export function createResearchTaskTool(options?: {
  config?: VelaclawConfig;
  sandboxed?: boolean;
  runtimeWebFetch?: RuntimeWebFetchMetadata;
  runtimeWebSearch?: RuntimeWebSearchMetadata;
  lookupFn?: LookupFn;
}): AnyAgentTool | null {
  const webSearchTool = createWebSearchTool({
    config: options?.config,
    sandboxed: options?.sandboxed,
    runtimeWebSearch: options?.runtimeWebSearch,
  });
  const webFetchTool = createWebFetchTool({
    config: options?.config,
    sandboxed: options?.sandboxed,
    runtimeWebFetch: options?.runtimeWebFetch,
    lookupFn: options?.lookupFn,
  });
  if (!webSearchTool && !webFetchTool) {
    return null;
  }

  return {
    label: "Research Task",
    name: "research_task",
    description:
      "Run structured two-pass web research. It prioritizes official sources, expands discovery when needed, and returns a source ledger with statuses and evidence.",
    parameters: ResearchTaskSchema,
    execute: async (_toolCallId, args) => {
      const params = isRecord(args) ? args : {};
      const query = readStringParam(params, "query", { required: true });
      const mode = normalizeMode(readStringParam(params, "mode"), query);
      const freshness = normalizeFreshness(readStringParam(params, "freshness"), query);
      const urls = readStringArrayParam(params, "urls") ?? [];
      const officialDomains = readStringArrayParam(params, "officialDomains") ?? [];
      const discoveryQueries = readStringArrayParam(params, "discoveryQueries") ?? [];
      const maxSources = clampInteger(
        readNumberParam(params, "maxSources", { integer: true }),
        DEFAULT_MAX_SOURCES,
        1,
        MAX_SOURCE_CAP,
      );
      const maxCharsPerSource = clampInteger(
        readNumberParam(params, "maxCharsPerSource", { integer: true }),
        DEFAULT_MAX_CHARS_PER_SOURCE,
        500,
        MAX_CHARS_PER_SOURCE_CAP,
      );
      const today = buildTodayLabels();

      const seedCandidates = buildSeedCandidates({
        query,
        mode,
        freshness,
        urls,
        officialDomains,
      });
      const searchQueries = buildSearchQueries({
        query,
        mode,
        freshness,
        discoveryQueries,
        officialDomains,
      });
      const searchPass = await runSearchPass({
        webSearchTool,
        query,
        queries: searchQueries,
      });

      const candidates: SourceCandidate[] = [];
      const seen = new Set<string>();
      for (const candidate of [...seedCandidates, ...searchPass.candidates]) {
        addCandidate(candidates, seen, candidate);
      }
      const fetchTargets = candidates.slice(0, maxSources);
      const fetchedSources: ResearchSource[] = [];
      for (let index = 0; index < fetchTargets.length; index += 1) {
        const candidate = fetchTargets[index];
        if (!candidate) {
          continue;
        }
        fetchedSources.push(
          await fetchCandidate({
            webFetchTool,
            candidate,
            query,
            maxCharsPerSource,
            index,
          }),
        );
      }

      const sources = [...fetchedSources, ...searchPass.sources].slice(0, maxSources + 5);
      const payload = {
        query,
        mode,
        freshness,
        freshnessTarget:
          freshness === "today"
            ? {
                date: today.iso,
                acceptedDateLabels: today.labels,
              }
            : undefined,
        ranAt: new Date().toISOString(),
        strategy: {
          passes: [
            {
              name: "primary_seed_fetch",
              description: "Fetch provided URLs, official domains, and built-in primary seeds.",
              candidates: seedCandidates.length,
            },
            {
              name: "broader_discovery",
              description: "Run web_search queries and fetch discovered URLs when available.",
              queries: searchQueries,
              discoveredCandidates: searchPass.candidates.length,
              providers: searchPass.providers,
            },
          ],
        },
        summary: summarizeSources(sources),
        claims: buildClaims({ mode, freshness, sources, todayLabels: today.labels }),
        gaps: buildGaps({
          mode,
          freshness,
          sources,
          todayLabels: today.labels,
          webSearchTool,
          webFetchTool,
        }),
        sources,
        guidance:
          'Use the source ledger to answer. Do not treat blocked/error sources as evidence. For same-day questions, do not answer "yes" unless a used source contains same-day primary evidence; say not confirmed/no evidence found instead.',
      };
      return jsonResult(payload);
    },
  };
}
