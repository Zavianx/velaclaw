import type { ChannelRuntimeSurface } from "velaclaw/plugin-sdk/channel-contract";
import type { VelaclawConfig } from "velaclaw/plugin-sdk/config-runtime";
import type { RuntimeEnv } from "velaclaw/plugin-sdk/runtime-env";

export type MonitorTelegramOpts = {
  token?: string;
  accountId?: string;
  config?: VelaclawConfig;
  runtime?: RuntimeEnv;
  channelRuntime?: ChannelRuntimeSurface;
  abortSignal?: AbortSignal;
  useWebhook?: boolean;
  webhookPath?: string;
  webhookPort?: number;
  webhookSecret?: string;
  webhookHost?: string;
  proxyFetch?: typeof fetch;
  webhookUrl?: string;
  webhookCertPath?: string;
};

export type TelegramMonitorFn = (opts?: MonitorTelegramOpts) => Promise<void>;
