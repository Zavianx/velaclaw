export function decodeBase64ToBuffer(input: string): Buffer {
  return Buffer.from(input, "base64");
}

export function encodeBufferToBase64(input: Buffer | Uint8Array): string {
  return Buffer.from(input).toString("base64");
}

export function canonicalizeBase64(input: string): string {
  return (input || "").replace(/\s+/g, "");
}

export function estimateBase64DecodedBytes(input: string): number {
  const normalized = canonicalizeBase64(input);
  if (!normalized) {
    return 0;
  }
  const padding = normalized.endsWith("==") ? 2 : normalized.endsWith("=") ? 1 : 0;
  return Math.max(0, Math.floor((normalized.length * 3) / 4) - padding);
}
