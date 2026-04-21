import type { MarkdownTableMode } from "./types.base.js";
import type { VelaclawConfig } from "./types.velaclaw.js";

export type ResolveMarkdownTableModeParams = {
  cfg?: Partial<VelaclawConfig>;
  channel?: string | null;
  accountId?: string | null;
};

export type ResolveMarkdownTableMode = (
  params: ResolveMarkdownTableModeParams,
) => MarkdownTableMode;
