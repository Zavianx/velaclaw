export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
export const DEFAULT_INPUT_IMAGE_MAX_BYTES = MAX_IMAGE_BYTES;
export const MAX_AUDIO_BYTES = 16 * 1024 * 1024;
export const MAX_VIDEO_BYTES = 16 * 1024 * 1024;
export const MAX_DOCUMENT_BYTES = 100 * 1024 * 1024;

export type MediaKind = "image" | "audio" | "video" | "document" | "file";

export function mediaKindFromMime(mimeType?: string): MediaKind | undefined {
  const value = (mimeType || "").toLowerCase();
  if (value.startsWith("image/")) {
    return "image";
  }
  if (value.startsWith("audio/")) {
    return "audio";
  }
  if (value.startsWith("video/")) {
    return "video";
  }
  if (
    value === "application/pdf" ||
    value.startsWith("text/") ||
    value.startsWith("application/")
  ) {
    return "document";
  }
  return value ? "file" : undefined;
}

export function isGifMedia(
  mimeTypeOrParams?: string | { contentType?: string; fileName?: string },
): boolean {
  const mime =
    typeof mimeTypeOrParams === "object" ? mimeTypeOrParams?.contentType : mimeTypeOrParams;
  return (mime || "").toLowerCase() === "image/gif";
}

export function maxBytesForKind(kind: MediaKind): number {
  switch (kind) {
    case "image":
      return MAX_IMAGE_BYTES;
    case "audio":
      return MAX_AUDIO_BYTES;
    case "video":
      return MAX_VIDEO_BYTES;
    case "document":
      return MAX_DOCUMENT_BYTES;
    default:
      return MAX_DOCUMENT_BYTES;
  }
}
