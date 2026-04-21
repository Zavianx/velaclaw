import { canonicalizeBase64, estimateBase64DecodedBytes } from "./base64.js";
import { detectMime, normalizeMimeType } from "./mime.js";

export { normalizeMimeType } from "./mime.js";

export type InputImageContent = {
  mimeType?: string;
  data?: string;
};

export type InputFileExtractResult = {
  filename: string;
  text?: string;
  images?: InputImageContent[];
};

export type InputPdfLimits = {
  maxPages: number;
  maxPixels: number;
  minTextChars: number;
};

export type InputFileLimits = {
  allowUrl: boolean;
  urlAllowlist?: string[];
  allowedMimes: Set<string>;
  maxBytes: number;
  maxChars: number;
  maxRedirects: number;
  timeoutMs: number;
  pdf: InputPdfLimits;
};

export type InputFileLimitsConfig = {
  allowUrl?: boolean;
  allowedMimes?: string[];
  maxBytes?: number;
  maxChars?: number;
  maxRedirects?: number;
  timeoutMs?: number;
  pdf?: {
    maxPages?: number;
    maxPixels?: number;
    minTextChars?: number;
  };
};

export type InputImageLimits = {
  allowUrl: boolean;
  urlAllowlist?: string[];
  allowedMimes: Set<string>;
  maxBytes: number;
  maxRedirects: number;
  timeoutMs: number;
};

export type InputImageSource =
  | { type: "base64"; data: string; mediaType?: string }
  | { type: "url"; url: string; mediaType?: string };

export type InputFileSource =
  | { type: "base64"; data: string; mediaType?: string; filename?: string }
  | { type: "url"; url: string; mediaType?: string; filename?: string };

export const DEFAULT_INPUT_IMAGE_MIMES = [
  "image/jpeg",
  "image/png",
  "image/gif",
  "image/webp",
  "image/heic",
  "image/heif",
];
export const DEFAULT_INPUT_FILE_MIMES = [
  "text/plain",
  "text/markdown",
  "text/html",
  "text/csv",
  "application/json",
  "application/pdf",
];
export const DEFAULT_INPUT_IMAGE_MAX_BYTES = 10 * 1024 * 1024;
export const DEFAULT_INPUT_FILE_MAX_BYTES = 5 * 1024 * 1024;
export const DEFAULT_INPUT_FILE_MAX_CHARS = 60_000;
export const DEFAULT_INPUT_MAX_REDIRECTS = 3;
export const DEFAULT_INPUT_TIMEOUT_MS = 10_000;
export const DEFAULT_INPUT_PDF_MAX_PAGES = 4;
export const DEFAULT_INPUT_PDF_MAX_PIXELS = 4_000_000;
export const DEFAULT_INPUT_PDF_MIN_TEXT_CHARS = 200;

export function normalizeMimeList(values: string[] | undefined, fallback: string[]): Set<string> {
  const input = values && values.length > 0 ? values : fallback;
  return new Set(input.map((value) => normalizeMimeType(value)).filter(Boolean) as string[]);
}

export function resolveInputFileLimits(config?: InputFileLimitsConfig): InputFileLimits {
  return {
    allowUrl: config?.allowUrl ?? true,
    allowedMimes: normalizeMimeList(config?.allowedMimes, DEFAULT_INPUT_FILE_MIMES),
    maxBytes: config?.maxBytes ?? DEFAULT_INPUT_FILE_MAX_BYTES,
    maxChars: config?.maxChars ?? DEFAULT_INPUT_FILE_MAX_CHARS,
    maxRedirects: config?.maxRedirects ?? DEFAULT_INPUT_MAX_REDIRECTS,
    timeoutMs: config?.timeoutMs ?? DEFAULT_INPUT_TIMEOUT_MS,
    pdf: {
      maxPages: config?.pdf?.maxPages ?? DEFAULT_INPUT_PDF_MAX_PAGES,
      maxPixels: config?.pdf?.maxPixels ?? DEFAULT_INPUT_PDF_MAX_PIXELS,
      minTextChars: config?.pdf?.minTextChars ?? DEFAULT_INPUT_PDF_MIN_TEXT_CHARS,
    },
  };
}

function rejectOversizedBase64Payload(data: string, maxBytes: number, label: string): void {
  const estimated = estimateBase64DecodedBytes(data);
  if (estimated > maxBytes) {
    throw new Error(`${label} too large: ${estimated} bytes (limit: ${maxBytes} bytes)`);
  }
}

export async function extractImageContentFromSource(
  source: InputImageSource,
  limits: InputImageLimits,
): Promise<{
  mimeType: string;
  data: string;
}> {
  if (source.type === "base64") {
    rejectOversizedBase64Payload(source.data, limits.maxBytes, "Image");
    const data = canonicalizeBase64(source.data);
    if (!data) {
      throw new Error("Invalid image base64 payload");
    }
    return {
      mimeType: normalizeMimeType(source.mediaType) ?? "image/jpeg",
      data,
    };
  }

  if (!limits.allowUrl) {
    throw new Error("Remote image URLs are disabled");
  }
  throw new Error("Remote image URLs are not supported in this Velaclaw build");
}

export async function extractFileContentFromSource(
  sourceOrParams: InputFileSource | { source: InputFileSource; limits: InputFileLimits },
  limits?: InputFileLimits,
): Promise<InputFileExtractResult> {
  let source: InputFileSource;
  if ("source" in sourceOrParams && "limits" in sourceOrParams) {
    source = sourceOrParams.source;
    limits = sourceOrParams.limits;
  } else {
    source = sourceOrParams;
  }
  if (!limits) {
    throw new Error("limits are required for extractFileContentFromSource");
  }
  return _extractFileContentFromSourceImpl(source, limits);
}

async function _extractFileContentFromSourceImpl(
  source: InputFileSource,
  limits: InputFileLimits,
): Promise<InputFileExtractResult> {
  if (source.type === "base64") {
    rejectOversizedBase64Payload(source.data, limits.maxBytes, "File");
    const data = canonicalizeBase64(source.data);
    if (!data) {
      throw new Error("Invalid file base64 payload");
    }
    const buffer = Buffer.from(data, "base64");
    const mimeType =
      normalizeMimeType(source.mediaType) ?? detectMime(buffer) ?? "application/octet-stream";
    if (!limits.allowedMimes.has(mimeType)) {
      throw new Error(`Unsupported file mime type: ${mimeType}`);
    }
    const text = buffer.toString("utf8").slice(0, limits.maxChars);
    return {
      filename: source.filename || "input.txt",
      text,
      images: [],
    };
  }

  if (!limits.allowUrl) {
    throw new Error("Remote file URLs are disabled");
  }
  throw new Error("Remote file URLs are not supported in this Velaclaw build");
}

export function normalizeMediaInputFiles<T>(files: T[] | undefined | null): T[] {
  return Array.isArray(files) ? files : [];
}
