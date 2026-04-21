import type { ModelProviderConfig } from "velaclaw/plugin-sdk/provider-model-types";
import { normalizeGoogleProviderConfig } from "./provider-policy.js";

export function normalizeConfig(params: { provider: string; providerConfig: ModelProviderConfig }) {
  return normalizeGoogleProviderConfig(params.provider, params.providerConfig);
}
