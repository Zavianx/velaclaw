import type {
  GenerateMusicParams,
  GenerateMusicRuntimeResult,
  ListRuntimeMusicGenerationProvidersParams,
  RuntimeMusicGenerationProvider,
} from "./runtime-types.js";
import { listMusicGenerationProviders } from "./provider-registry.js";

export async function generateMusic(_params: GenerateMusicParams): Promise<GenerateMusicRuntimeResult> {
  throw new Error("music generation is unavailable in this Velaclaw build.");
}

export function listRuntimeMusicGenerationProviders(
  params: ListRuntimeMusicGenerationProvidersParams = {},
): RuntimeMusicGenerationProvider[] {
  return listMusicGenerationProviders(params.config);
}
