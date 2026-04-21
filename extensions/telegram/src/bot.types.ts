import type { VelaclawConfig, ReplyToMode } from "velaclaw/plugin-sdk/config-runtime";
import type { RuntimeEnv } from "velaclaw/plugin-sdk/runtime-env";
import type { TelegramBotDeps } from "./bot-deps.js";
import type { TelegramTransport } from "./fetch.js";

export type TelegramBotOptions = {
  token: string;
  accountId?: string;
  runtime?: RuntimeEnv;
  requireMention?: boolean;
  allowFrom?: Array<string | number>;
  groupAllowFrom?: Array<string | number>;
  mediaMaxMb?: number;
  replyToMode?: ReplyToMode;
  proxyFetch?: typeof fetch;
  config?: VelaclawConfig;
  /** Signal to abort in-flight Telegram API fetch requests (e.g. getUpdates) on shutdown. */
  fetchAbortSignal?: AbortSignal;
  updateOffset?: {
    lastUpdateId?: number | null;
    onUpdateId?: (updateId: number) => void | Promise<void>;
  };
  testTimings?: {
    mediaGroupFlushMs?: number;
    textFragmentGapMs?: number;
  };
  /** Pre-resolved Telegram transport to reuse across bot instances. If not provided, creates a new one. */
  telegramTransport?: TelegramTransport;
  telegramDeps?: TelegramBotDeps;
};
