export async function runFfmpeg(..._args: unknown[]): Promise<string> {
  throw new Error("ffmpeg helpers are unavailable in this Velaclaw build.");
}

export async function runFfprobe(..._args: unknown[]): Promise<string> {
  throw new Error("ffprobe helpers are unavailable in this Velaclaw build.");
}

export function parseFfprobeCodecAndSampleRate(
  _output: string,
): { codec?: string; sampleRate?: number; sampleRateHz?: number } {
  return {};
}

export const MEDIA_FFMPEG_MAX_AUDIO_DURATION_SECS = 600;

export async function unlinkIfExists(_filePath: string | null | undefined): Promise<void> {
  // No-op stub.
}
