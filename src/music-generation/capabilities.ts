// Capability helpers for the slimmed music-generation subsystem.
// The concrete capability logic was removed during the main-history cleanup;
// keep the surface area so callers compile against stubs that return
// generous / defensive defaults without changing runtime behaviour.

import type {
  MusicGenerationMode,
  MusicGenerationModeCapabilities,
  MusicGenerationProvider,
} from "./types.js";

export type MusicGenerationModeResolution = {
  mode: MusicGenerationMode;
  capabilities?: MusicGenerationModeCapabilities;
};

export function resolveMusicGenerationMode(_args?: {
  inputAudioCount?: number;
  [key: string]: unknown;
}): MusicGenerationMode {
  return "generate";
}

export function resolveMusicGenerationModeCapabilities(args: {
  provider?: MusicGenerationProvider;
  [key: string]: unknown;
}): { capabilities?: MusicGenerationModeCapabilities } {
  return {
    capabilities: args.provider?.capabilities,
  };
}

export function listSupportedMusicGenerationModes(
  _provider?: MusicGenerationProvider,
): MusicGenerationMode[] {
  return ["generate"];
}
