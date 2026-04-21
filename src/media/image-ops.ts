export const IMAGE_REDUCE_QUALITY_STEPS = [85, 70, 55, 40] as const;

export function buildImageResizeSideGrid(maxDimensionPx = 2048, sideStart?: number): number[] {
  const start =
    typeof sideStart === "number" && sideStart > 0 ? Math.floor(sideStart) : maxDimensionPx;
  const values = [start];
  for (const ratio of [0.85, 0.7, 0.55, 0.4]) {
    const next = Math.max(256, Math.floor(maxDimensionPx * ratio));
    if (!values.includes(next)) {
      values.push(next);
    }
  }
  return values;
}

export async function getImageMetadata(_input: string | Buffer | Uint8Array): Promise<{
  width?: number | undefined;
  height?: number | undefined;
  format?: string | undefined;
}> {
  return {};
}

export async function resizeToJpeg(
  input:
    | Buffer
    | Uint8Array
    | {
        buffer: Buffer | Uint8Array;
        maxSide?: number;
        quality?: number;
        withoutEnlargement?: boolean;
      },
): Promise<Buffer> {
  const buf = input instanceof Uint8Array || Buffer.isBuffer(input) ? input : input.buffer;
  return Buffer.isBuffer(buf) ? buf : Buffer.from(buf);
}
