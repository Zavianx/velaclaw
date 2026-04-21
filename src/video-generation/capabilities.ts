// Capability helpers for the slimmed video-generation subsystem.
// The full logic was removed during the main-history cleanup; keep the
// surface area so callers compile against stubs returning provider
// capabilities directly without changing runtime behaviour.

import type {
  VideoGenerationMode,
  VideoGenerationModeCapabilities,
  VideoGenerationProvider,
  VideoGenerationTransformCapabilities,
} from "./types.js";

export function resolveVideoGenerationMode(args: {
  inputImageCount?: number;
  inputVideoCount?: number;
  [key: string]: unknown;
}): VideoGenerationMode {
  if ((args.inputVideoCount ?? 0) > 0) {
    return "videoToVideo";
  }
  if ((args.inputImageCount ?? 0) > 0) {
    return "imageToVideo";
  }
  return "generate";
}

export function resolveVideoGenerationModeCapabilities(args: {
  provider?: VideoGenerationProvider;
  inputImageCount?: number;
  inputVideoCount?: number;
  [key: string]: unknown;
}): {
  capabilities?: VideoGenerationModeCapabilities | VideoGenerationTransformCapabilities;
} {
  const caps = args.provider?.capabilities;
  if (!caps) {
    return {};
  }
  const mode = resolveVideoGenerationMode(args);
  if (mode === "imageToVideo" && caps.imageToVideo) {
    return { capabilities: caps.imageToVideo };
  }
  if (mode === "videoToVideo" && caps.videoToVideo) {
    return { capabilities: caps.videoToVideo };
  }
  return { capabilities: caps.generate ?? caps };
}

export function listSupportedVideoGenerationModes(
  provider?: VideoGenerationProvider,
): VideoGenerationMode[] {
  const modes: VideoGenerationMode[] = ["generate"];
  if (provider?.capabilities?.imageToVideo?.enabled) {
    modes.push("imageToVideo");
  }
  if (provider?.capabilities?.videoToVideo?.enabled) {
    modes.push("videoToVideo");
  }
  return modes;
}
