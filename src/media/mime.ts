export function detectMime(
  _input: string | Buffer | Uint8Array | { buffer?: Buffer | Uint8Array; filePath?: string },
): string {
  return "application/octet-stream";
}

export function imageMimeFromFormat(format?: string): string | undefined {
  const normalized = (format || "").trim().toLowerCase();
  if (!normalized) {
    return undefined;
  }
  if (normalized === "png") {
    return "image/png";
  }
  if (normalized === "jpg" || normalized === "jpeg") {
    return "image/jpeg";
  }
  if (normalized === "webp") {
    return "image/webp";
  }
  if (normalized === "gif") {
    return "image/gif";
  }
  return undefined;
}

export function normalizeMimeType(value?: string): string | undefined {
  const normalized = (value || "").trim().toLowerCase();
  return normalized || undefined;
}

export function kindFromMime(
  value?: string,
): "image" | "audio" | "video" | "document" | "file" | undefined {
  const mime = normalizeMimeType(value);
  if (!mime) {
    return undefined;
  }
  if (mime.startsWith("image/")) {
    return "image";
  }
  if (mime.startsWith("audio/")) {
    return "audio";
  }
  if (mime.startsWith("video/")) {
    return "video";
  }
  if (mime === "application/pdf" || mime.startsWith("text/") || mime.startsWith("application/")) {
    return "document";
  }
  return "file";
}

export function extensionForMime(value?: string): string | undefined {
  const mime = normalizeMimeType(value);
  if (!mime) {
    return undefined;
  }
  if (mime === "image/png") {
    return ".png";
  }
  if (mime === "image/jpeg") {
    return ".jpg";
  }
  if (mime === "image/webp") {
    return ".webp";
  }
  if (mime === "image/gif") {
    return ".gif";
  }
  if (mime === "audio/mpeg") {
    return ".mp3";
  }
  if (mime === "audio/wav") {
    return ".wav";
  }
  if (mime === "video/mp4") {
    return ".mp4";
  }
  return ".bin";
}

export function getFileExtension(filePath?: string | null): string {
  if (!filePath) {
    return "";
  }
  const index = filePath.lastIndexOf(".");
  return index === -1 ? "" : filePath.slice(index).toLowerCase();
}

export function isAudioFileName(fileName?: string | null): boolean {
  const ext = fileName ? getFileExtension(fileName) : "";
  return [".aac", ".caf", ".flac", ".m4a", ".mp3", ".oga", ".ogg", ".opus", ".wav"].includes(ext);
}
