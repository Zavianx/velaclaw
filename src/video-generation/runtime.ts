import type {
  GenerateVideoParams,
  GenerateVideoRuntimeResult,
  ListRuntimeVideoGenerationProvidersParams,
  RuntimeVideoGenerationProvider,
} from "./runtime-types.js";
import { listVideoGenerationProviders } from "./provider-registry.js";

export async function generateVideo(_params: GenerateVideoParams): Promise<GenerateVideoRuntimeResult> {
  throw new Error("video generation is unavailable in this Velaclaw build.");
}

export function listRuntimeVideoGenerationProviders(
  params: ListRuntimeVideoGenerationProvidersParams = {},
): RuntimeVideoGenerationProvider[] {
  return listVideoGenerationProviders(params.config);
}
