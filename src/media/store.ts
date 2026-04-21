import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { resolveStateDir } from "../config/paths.js";

export type SavedMedia = {
  id: string;
  path: string;
  size: number;
  mimeType?: string;
  contentType?: string;
  [key: string]: unknown;
};

export const MEDIA_MAX_BYTES = 50 * 1024 * 1024;

function sanitizeExtension(mimeType?: string): string {
  if (!mimeType) {
    return ".bin";
  }
  if (mimeType.includes("png")) {
    return ".png";
  }
  if (mimeType.includes("jpeg") || mimeType.includes("jpg")) {
    return ".jpg";
  }
  if (mimeType.includes("gif")) {
    return ".gif";
  }
  if (mimeType.includes("webp")) {
    return ".webp";
  }
  if (mimeType.includes("mp3") || mimeType.includes("mpeg")) {
    return ".mp3";
  }
  if (mimeType.includes("wav")) {
    return ".wav";
  }
  if (mimeType.includes("ogg")) {
    return ".ogg";
  }
  if (mimeType.includes("mp4")) {
    return ".mp4";
  }
  return ".bin";
}

function resolveMediaRoot(kind = "misc", env: NodeJS.ProcessEnv = process.env): string {
  return path.join(resolveStateDir(env), "media", kind);
}

export function extractOriginalFilename(filePath: string): string {
  return path.basename(filePath);
}

export function getMediaDir(kind = "misc", env: NodeJS.ProcessEnv = process.env): string {
  return resolveMediaRoot(kind, env);
}

export async function ensureMediaDir(
  kind = "misc",
  env: NodeJS.ProcessEnv = process.env,
): Promise<string> {
  const dir = resolveMediaRoot(kind, env);
  await fs.mkdir(dir, { recursive: true });
  return dir;
}

export async function cleanOldMedia(
  _ttlMs = 2 * 60_000,
  _options?: { recursive?: boolean; pruneEmptyDirs?: boolean },
): Promise<void> {
  // No-op in the slimmed build.
}

export async function saveMediaBuffer(
  data: Buffer | Uint8Array,
  mimeType?: string,
  kind: string = "misc",
  ..._extra: unknown[]
): Promise<SavedMedia> {
  const env: NodeJS.ProcessEnv =
    typeof _extra[0] === "object" && _extra[0] !== null && !Array.isArray(_extra[0])
      ? (_extra[0] as NodeJS.ProcessEnv)
      : process.env;
  const dir = await ensureMediaDir(kind, env);
  const id = crypto.randomUUID().replace(/-/g, "");
  const filePath = path.join(dir, `${id}${sanitizeExtension(mimeType)}`);
  const buffer = Buffer.isBuffer(data) ? data : Buffer.from(data);
  await fs.writeFile(filePath, buffer);
  return {
    id,
    path: filePath,
    size: buffer.byteLength,
    mimeType,
  };
}

export async function deleteMediaBuffer(
  media: string | { path?: string } | null | undefined,
  ..._extra: unknown[]
): Promise<void> {
  const filePath = typeof media === "string" ? media : media?.path;
  if (!filePath) {
    return;
  }
  await fs.rm(filePath, { force: true });
}

export function resolveMediaBufferPath(
  id: string,
  kind = "misc",
  env: NodeJS.ProcessEnv = process.env,
): string {
  return path.join(resolveMediaRoot(kind, env), id);
}
