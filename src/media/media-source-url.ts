export function resolveMediaSourceUrl(url: string): string {
  return url;
}

export function isPassThroughRemoteMediaSource(value: unknown): boolean {
  if (typeof value !== "string") {
    return false;
  }
  return /^https?:\/\//i.test(value) || value.startsWith("data:");
}
