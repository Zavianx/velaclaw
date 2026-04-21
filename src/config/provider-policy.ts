import { resolveBundledProviderPolicySurface } from "../plugins/provider-public-artifacts.js";
import type { ModelProviderConfig, VelaclawConfig } from "./types.js";

export function normalizeProviderConfigForConfigDefaults(params: {
  provider: string;
  providerConfig: ModelProviderConfig;
}): ModelProviderConfig {
  const normalized = resolveBundledProviderPolicySurface(params.provider)?.normalizeConfig?.({
    provider: params.provider,
    providerConfig: params.providerConfig,
  });
  return normalized && normalized !== params.providerConfig ? normalized : params.providerConfig;
}

export function applyProviderConfigDefaultsForConfig(params: {
  provider: string;
  config: VelaclawConfig;
  env: NodeJS.ProcessEnv;
}): VelaclawConfig {
  return (
    resolveBundledProviderPolicySurface(params.provider)?.applyConfigDefaults?.({
      provider: params.provider,
      config: params.config,
      env: params.env,
    }) ?? params.config
  );
}
