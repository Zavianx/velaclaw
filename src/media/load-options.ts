export type OutboundMediaAccessMode = "read" | "copy" | "stream";

export type OutboundMediaAccess =
  | OutboundMediaAccessMode
  | {
      mode?: OutboundMediaAccessMode;
      localRoots?: readonly string[];
      readFile?: OutboundMediaReadFile;
      hostReadCapability?: boolean;
    };

export type OutboundMediaReadFile = (filePath: string) => Promise<Buffer>;

export function buildOutboundMediaLoadOptions(params?: {
  maxBytes?: number;
  mediaAccess?: OutboundMediaAccess;
  mediaLocalRoots?: readonly string[] | "any";
  mediaReadFile?: OutboundMediaReadFile;
  optimizeImages?: boolean;
}): {
  access: OutboundMediaAccess;
  allowRemote: boolean;
  maxBytes?: number;
  localRoots?: readonly string[];
  readFile?: OutboundMediaReadFile;
} {
  const access = params?.mediaAccess ?? "read";
  const localRoots =
    typeof access === "object" && access.localRoots
      ? access.localRoots
      : params?.mediaLocalRoots && params.mediaLocalRoots !== "any"
        ? params.mediaLocalRoots
        : undefined;
  const readFile =
    typeof access === "object" && access.readFile
      ? access.readFile
      : params?.mediaReadFile;
  return {
    access,
    allowRemote: true,
    ...(params?.maxBytes !== undefined ? { maxBytes: params.maxBytes } : {}),
    ...(localRoots ? { localRoots } : {}),
    ...(readFile ? { readFile } : {}),
  };
}

export function resolveOutboundMediaAccess(params?: {
  mediaAccess?: OutboundMediaAccess;
  mediaLocalRoots?: readonly string[];
  mediaReadFile?: OutboundMediaReadFile;
}): OutboundMediaAccess {
  return params?.mediaAccess ?? "read";
}

export function resolveOutboundMediaLocalRoots(
  roots?: readonly string[] | string[] | "any" | null,
): string[] {
  if (roots === "any" || !Array.isArray(roots)) {
    return [];
  }
  return roots.filter((entry): entry is string => typeof entry === "string" && entry.trim() !== "");
}

/** Extract localRoots from an OutboundMediaAccess if it is an object variant. */
export function getOutboundMediaAccessLocalRoots(
  access?: OutboundMediaAccess,
): readonly string[] | undefined {
  return typeof access === "object" && access !== null ? access.localRoots : undefined;
}

/** Extract readFile from an OutboundMediaAccess if it is an object variant. */
export function getOutboundMediaAccessReadFile(
  access?: OutboundMediaAccess,
): OutboundMediaReadFile | undefined {
  return typeof access === "object" && access !== null ? access.readFile : undefined;
}
