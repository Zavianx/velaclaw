import {
  resolveAgentModelFallbackValues,
  resolveAgentModelPrimaryValue,
} from "../config/model-input.js";
import type { AgentModelConfig } from "../config/types.agents-shared.js";
import type { VelaclawConfig } from "../config/types.velaclaw.js";
import { normalizeOptionalString } from "../shared/string-coerce.js";
import type {
  MediaGenerationNormalizationMetadataInput,
  MediaNormalizationEntry,
  MediaNormalizationValue,
} from "./normalization.types.js";

export type ParsedProviderModelRef = {
  provider: string;
  model: string;
};

export type {
  MediaGenerationNormalizationMetadataInput,
  MediaNormalizationEntry,
  MediaNormalizationValue,
};

type CapabilityProviderCandidate = {
  id: string;
  defaultModel?: string | null;
};

export function resolveCapabilityModelCandidates(params: {
  cfg: VelaclawConfig;
  modelConfig: unknown;
  modelOverride?: string;
  parseModelRef: (raw: string | undefined) => ParsedProviderModelRef | null;
  listProviders?: (cfg?: VelaclawConfig) => CapabilityProviderCandidate[];
  autoProviderFallback?: boolean;
}): ParsedProviderModelRef[] {
  const candidates: ParsedProviderModelRef[] = [];
  const seen = new Set<string>();
  const add = (raw: string | undefined) => {
    const parsed = params.parseModelRef(raw);
    if (!parsed) {
      return;
    }
    const key = `${parsed.provider}/${parsed.model}`;
    if (seen.has(key)) {
      return;
    }
    seen.add(key);
    candidates.push(parsed);
  };

  add(params.modelOverride);
  add(resolveAgentModelPrimaryValue(params.modelConfig as AgentModelConfig | undefined));
  for (const fallback of resolveAgentModelFallbackValues(params.modelConfig as AgentModelConfig | undefined)) {
    add(fallback);
  }

  if (params.autoProviderFallback !== false && params.listProviders) {
    for (const provider of params.listProviders(params.cfg)) {
      const defaultModel = normalizeOptionalString(provider.defaultModel);
      if (!defaultModel) {
        continue;
      }
      add(`${provider.id}/${defaultModel}`);
    }
  }

  return candidates;
}

export function buildNoCapabilityModelConfiguredMessage(params: {
  capability: string;
  modelOverride?: string;
  availableProviders?:
    | readonly string[]
    | readonly { id: string; defaultModel?: string | null }[];
}): string {
  const capability = normalizeOptionalString(params.capability) ?? "media generation";
  const override = normalizeOptionalString(params.modelOverride);
  const providers = (params.availableProviders ?? []).map((entry) =>
    typeof entry === "string" ? entry : entry.id,
  );
  const providerHint = providers.length > 0 ? ` Available providers: ${providers.join(", ")}.` : "";
  if (override) {
    return `No compatible ${capability} provider is available for model override "${override}".${providerHint}`;
  }
  return `No compatible ${capability} provider is configured.${providerHint}`;
}

export function throwCapabilityGenerationFailure(params: {
  capability: string;
  message?: string;
  modelOverride?: string;
  attempts?: Array<{
    provider?: string;
    model?: string;
    error?: unknown;
  }>;
  availableProviders?:
    | readonly string[]
    | readonly { id: string; defaultModel?: string | null }[];
}): never {
  const baseMessage =
    normalizeOptionalString(params.message) ??
    buildNoCapabilityModelConfiguredMessage({
      capability: params.capability,
      modelOverride: params.modelOverride,
      availableProviders: params.availableProviders,
    });
  const lastAttempt = params.attempts?.[params.attempts.length - 1];
  const lastError =
    lastAttempt?.error instanceof Error
      ? lastAttempt.error.message
      : normalizeOptionalString(
          typeof lastAttempt?.error === "string" ? lastAttempt.error : undefined,
        );
  if (lastError) {
    throw new Error(`${baseMessage} Last error: ${lastError}`);
  }
  throw new Error(baseMessage);
}
