import { ensureModelAllowlistEntry } from "velaclaw/plugin-sdk/provider-onboard";
import {
  applyAgentDefaultModelPrimary,
  type VelaclawConfig,
} from "velaclaw/plugin-sdk/provider-onboard";

export const OPENAI_DEFAULT_MODEL = "openai/gpt-5.4";
export const OPENAI_CODEX_DEFAULT_MODEL = "openai-codex/gpt-5.4";
export const OPENAI_DEFAULT_IMAGE_MODEL = "gpt-image-1";
export const OPENAI_DEFAULT_TTS_MODEL = "gpt-4o-mini-tts";
export const OPENAI_DEFAULT_TTS_VOICE = "alloy";
export const OPENAI_DEFAULT_AUDIO_TRANSCRIPTION_MODEL = "gpt-4o-transcribe";
export const OPENAI_DEFAULT_EMBEDDING_MODEL = "text-embedding-3-small";

export function applyOpenAIProviderConfig(cfg: VelaclawConfig): VelaclawConfig {
  const next = ensureModelAllowlistEntry({
    cfg,
    modelRef: OPENAI_DEFAULT_MODEL,
  });
  const models = { ...next.agents?.defaults?.models };
  models[OPENAI_DEFAULT_MODEL] = {
    ...models[OPENAI_DEFAULT_MODEL],
    alias: models[OPENAI_DEFAULT_MODEL]?.alias ?? "GPT",
  };

  return {
    ...next,
    agents: {
      ...next.agents,
      defaults: {
        ...next.agents?.defaults,
        models,
      },
    },
  };
}

export function applyOpenAIConfig(cfg: VelaclawConfig): VelaclawConfig {
  return applyAgentDefaultModelPrimary(applyOpenAIProviderConfig(cfg), OPENAI_DEFAULT_MODEL);
}
