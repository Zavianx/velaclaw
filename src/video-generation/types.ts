import type { AuthProfileStore } from "../agents/auth-profiles/types.js";
import type { VelaclawConfig } from "../config/types.velaclaw.js";
import type { MediaNormalizationEntry } from "../media-generation/normalization.types.js";

export type GeneratedVideoAsset = {
  buffer?: Buffer;
  url?: string;
  mimeType: string;
  fileName?: string;
  metadata?: Record<string, unknown>;
};

export type VideoGenerationResolution = "480P" | "720P" | "768P" | "1080P";

export type VideoGenerationAssetRole =
  | "first_frame"
  | "last_frame"
  | "reference_image"
  | "reference_video"
  | "reference_audio";

export type VideoGenerationSourceAsset = {
  url?: string;
  buffer?: Buffer;
  mimeType?: string;
  fileName?: string;
  role?: VideoGenerationAssetRole | (string & {});
  metadata?: Record<string, unknown>;
};

export type VideoGenerationProviderConfiguredContext = {
  cfg?: VelaclawConfig;
  agentDir?: string;
};

export type VideoGenerationRequest = {
  provider: string;
  model: string;
  prompt: string;
  cfg: VelaclawConfig;
  agentDir?: string;
  authStore?: AuthProfileStore;
  timeoutMs?: number;
  size?: string;
  aspectRatio?: string;
  resolution?: VideoGenerationResolution;
  durationSeconds?: number;
  audio?: boolean;
  watermark?: boolean;
  inputImages?: VideoGenerationSourceAsset[];
  inputVideos?: VideoGenerationSourceAsset[];
  inputAudios?: VideoGenerationSourceAsset[];
  providerOptions?: Record<string, unknown>;
};

export type VideoGenerationResult = {
  videos: GeneratedVideoAsset[];
  model?: string;
  metadata?: Record<string, unknown>;
};

export type VideoGenerationIgnoredOverride = {
  key: "size" | "aspectRatio" | "resolution" | "audio" | "watermark";
  value: string | boolean;
};

export type VideoGenerationMode = "generate" | "imageToVideo" | "videoToVideo";

export type VideoGenerationProviderOptionType = "number" | "boolean" | "string";

export type VideoGenerationModeCapabilities = {
  maxVideos?: number;
  maxInputImages?: number;
  maxInputVideos?: number;
  maxInputAudios?: number;
  maxDurationSeconds?: number;
  supportedDurationSeconds?: readonly number[];
  supportedDurationSecondsByModel?: Readonly<Record<string, readonly number[]>>;
  sizes?: readonly string[];
  aspectRatios?: readonly string[];
  resolutions?: readonly VideoGenerationResolution[];
  supportsSize?: boolean;
  supportsAspectRatio?: boolean;
  supportsResolution?: boolean;
  supportsAudio?: boolean;
  supportsWatermark?: boolean;
  providerOptions?: Readonly<Record<string, VideoGenerationProviderOptionType>>;
};

export type VideoGenerationTransformCapabilities = VideoGenerationModeCapabilities & {
  enabled: boolean;
};

export type VideoGenerationProviderCapabilities = VideoGenerationModeCapabilities & {
  generate?: VideoGenerationModeCapabilities;
  imageToVideo?: VideoGenerationTransformCapabilities;
  videoToVideo?: VideoGenerationTransformCapabilities;
};

export type VideoGenerationNormalization = {
  size?: MediaNormalizationEntry<string>;
  aspectRatio?: MediaNormalizationEntry<string>;
  resolution?: MediaNormalizationEntry<VideoGenerationResolution>;
  durationSeconds?: MediaNormalizationEntry<number>;
};

export type VideoGenerationProvider = {
  id: string;
  aliases?: string[];
  label?: string;
  defaultModel?: string;
  models?: string[];
  capabilities: VideoGenerationProviderCapabilities;
  isConfigured?: (ctx: VideoGenerationProviderConfiguredContext) => boolean;
  generateVideo: (req: VideoGenerationRequest) => Promise<VideoGenerationResult>;
};
