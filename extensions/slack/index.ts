import {
  defineBundledChannelEntry,
  loadBundledEntryExportSync,
} from "velaclaw/plugin-sdk/channel-entry-contract";
import type { VelaclawPluginApi } from "velaclaw/plugin-sdk/channel-entry-contract";

function registerSlackPluginHttpRoutes(api: VelaclawPluginApi): void {
  const register = loadBundledEntryExportSync<(api: VelaclawPluginApi) => void>(import.meta.url, {
    specifier: "./runtime-api.js",
    exportName: "registerSlackPluginHttpRoutes",
  });
  register(api);
}

export default defineBundledChannelEntry({
  id: "slack",
  name: "Slack",
  description: "Slack channel plugin",
  importMetaUrl: import.meta.url,
  plugin: {
    specifier: "./channel-plugin-api.js",
    exportName: "slackPlugin",
  },
  secrets: {
    specifier: "./secret-contract-api.js",
    exportName: "channelSecrets",
  },
  runtime: {
    specifier: "./runtime-api.js",
    exportName: "setSlackRuntime",
  },
  registerFull: registerSlackPluginHttpRoutes,
});
