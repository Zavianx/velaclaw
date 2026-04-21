import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { mediaKindFromMime, type MediaKind } from "./constants.js";
import {
  getDefaultLocalRoots as getDefaultLocalRootsImpl,
  LocalMediaAccessError,
} from "./local-media-access.js";
import { detectMime, normalizeMimeType } from "./mime.js";

export { getDefaultLocalRootsImpl as getDefaultLocalRoots, LocalMediaAccessError };

export type LocalMediaAccessErrorCode = string;

export type WebMediaResult = {
  buffer: Buffer;
  contentType?: string;
  kind: MediaKind | undefined;
  fileName?: string;
};

function resolveLocalMediaPath(input: string): string {
  const trimmed = input.trim();
  if (/^https?:\/\//i.test(trimmed)) {
    throw new LocalMediaAccessError(
      "remote_url_disabled",
      "Remote media URLs are unavailable in this Velaclaw build.",
    );
  }
  if (/^file:\/\//i.test(trimmed)) {
    return fileURLToPath(trimmed);
  }
  return trimmed;
}

function resolveContentType(filePath: string, buffer: Buffer): string {
  const byContent = normalizeMimeType(detectMime(buffer));
  if (byContent) {
    return byContent;
  }
  const ext = path.extname(filePath).toLowerCase();
  switch (ext) {
    case ".png":
      return "image/png";
    case ".jpg":
    case ".jpeg":
      return "image/jpeg";
    case ".webp":
      return "image/webp";
    case ".gif":
      return "image/gif";
    case ".mp3":
      return "audio/mpeg";
    case ".wav":
      return "audio/wav";
    case ".mp4":
      return "video/mp4";
    case ".pdf":
      return "application/pdf";
    default:
      return "application/octet-stream";
  }
}

export async function loadWebMediaRaw(
  input: string,
  options:
    | {
        readFile?: (filePath: string) => Promise<Buffer>;
        maxBytes?: number;
        optimizeImages?: boolean;
        localRoots?: readonly string[];
        sandboxValidated?: boolean;
        access?: unknown;
        allowRemote?: boolean;
        hostReadCapability?: boolean;
        [key: string]: unknown;
      }
    | number = {},
): Promise<WebMediaResult> {
  const resolved = typeof options === "number" ? {} : options;
  const filePath = resolveLocalMediaPath(input);
  const buffer = resolved.readFile
    ? await resolved.readFile(filePath)
    : await fs.readFile(filePath);
  const contentType = resolveContentType(filePath, buffer);
  return {
    buffer,
    contentType,
    kind: mediaKindFromMime(contentType),
    fileName: path.basename(filePath),
  };
}

export async function loadWebMedia(
  input: string,
  options:
    | {
        maxBytes?: number;
        localRoots?: readonly string[] | string;
        sandboxValidated?: boolean;
        readFile?: (filePath: string) => Promise<Buffer>;
        access?: unknown;
        allowRemote?: boolean;
        hostReadCapability?: boolean;
        [key: string]: unknown;
      }
    | number = {},
  _extraOptions?: {
    maxBytes?: number;
    localRoots?: readonly string[] | string;
    sandboxValidated?: boolean;
    readFile?: (filePath: string) => Promise<Buffer>;
    access?: unknown;
    allowRemote?: boolean;
    hostReadCapability?: boolean;
    [key: string]: unknown;
  },
): Promise<WebMediaResult> {
  const resolved = typeof options === "number" ? (_extraOptions ?? {}) : options;
  return await loadWebMediaRaw(input, { readFile: resolved.readFile });
}

export async function optimizeImageToJpeg(
  buffer: Buffer | Uint8Array,
  _maxBytes?: number,
): Promise<{
  buffer: Buffer;
  contentType: string;
  kind: "image";
  optimizedSize: number;
}> {
  const normalized = Buffer.isBuffer(buffer) ? buffer : Buffer.from(buffer);
  return {
    buffer: normalized,
    contentType: "image/jpeg",
    kind: "image",
    optimizedSize: normalized.length,
  };
}

export async function optimizeImageToPng(
  buffer: Buffer | Uint8Array,
  _maxBytes?: number,
): Promise<{
  buffer: Buffer;
  contentType: string;
  kind: "image";
  optimizedSize: number;
}> {
  const normalized = Buffer.isBuffer(buffer) ? buffer : Buffer.from(buffer);
  return {
    buffer: normalized,
    contentType: "image/png",
    kind: "image",
    optimizedSize: normalized.length,
  };
}
