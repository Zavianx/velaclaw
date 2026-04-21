export async function encodePng(input: Buffer | Uint8Array): Promise<Buffer> {
  return Buffer.from(input);
}

export function encodePngRgba(rgba: Buffer | Uint8Array, _width: number, _height: number): Buffer {
  return Buffer.from(rgba);
}

export function fillPixel(
  buffer: Buffer | Uint8Array,
  x: number,
  y: number,
  width: number,
  r: number,
  g: number,
  b: number,
  a: number,
): void {
  const offset = (y * width + x) * 4;
  if (offset + 3 >= buffer.byteLength) {
    return;
  }
  buffer[offset] = r;
  buffer[offset + 1] = g;
  buffer[offset + 2] = b;
  buffer[offset + 3] = a;
}
