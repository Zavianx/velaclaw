import type {
  GenerateImageParams,
  GenerateImageRuntimeResult,
  ListRuntimeImageGenerationProvidersParams,
  RuntimeImageGenerationProvider,
} from "./runtime-types.js";
import { listImageGenerationProviders } from "./provider-registry.js";

export async function generateImage(_params: GenerateImageParams): Promise<GenerateImageRuntimeResult> {
  throw new Error("image generation is unavailable in this Velaclaw build.");
}

export function listRuntimeImageGenerationProviders(
  params: ListRuntimeImageGenerationProvidersParams = {},
): RuntimeImageGenerationProvider[] {
  return listImageGenerationProviders(params.config);
}
