import type { VideoGenerationProviderCapabilities, VideoGenerationResolution } from "./types.js";

const DASHSCOPE_DISABLED_MESSAGE = "Dashscope video generation is unavailable in this Velaclaw build.";

export type DashscopeVideoGenerationResponse = Record<string, unknown>;

export const DEFAULT_VIDEO_GENERATION_DURATION_SECONDS = 8;
export const DEFAULT_VIDEO_GENERATION_TIMEOUT_MS = 180_000;
export const DEFAULT_DASHSCOPE_WAN_VIDEO_MODEL = "wanx2.1-t2v-turbo";
export const DASHSCOPE_WAN_VIDEO_MODELS = [DEFAULT_DASHSCOPE_WAN_VIDEO_MODEL] as const;
export const DASHSCOPE_WAN_VIDEO_CAPABILITIES: VideoGenerationProviderCapabilities = {
  supportsAspectRatio: true,
  supportsResolution: true,
  supportsAudio: true,
  supportsWatermark: true,
};
export const DEFAULT_VIDEO_RESOLUTION_TO_SIZE: Record<VideoGenerationResolution, string> = {
  "480P": "854x480",
  "720P": "1280x720",
  "768P": "1366x768",
  "1080P": "1920x1080",
};

function unavailable(): never {
  throw new Error(DASHSCOPE_DISABLED_MESSAGE);
}

export function buildDashscopeVideoGenerationInput(): never {
  unavailable();
}

export function buildDashscopeVideoGenerationParameters(): never {
  unavailable();
}

export async function downloadDashscopeGeneratedVideos(): Promise<never> {
  unavailable();
}

export function extractDashscopeVideoUrls(response: DashscopeVideoGenerationResponse): string[] {
  const urls = response.output;
  if (!urls || typeof urls !== "object" || !Array.isArray((urls as { video_urls?: unknown }).video_urls)) {
    return [];
  }
  return (urls as { video_urls: unknown[] }).video_urls.filter(
    (entry): entry is string => typeof entry === "string" && entry.length > 0,
  );
}

export async function pollDashscopeVideoTaskUntilComplete(): Promise<never> {
  unavailable();
}

export function resolveVideoGenerationReferenceUrls(): never {
  unavailable();
}

export async function runDashscopeVideoGenerationTask(): Promise<never> {
  unavailable();
}
