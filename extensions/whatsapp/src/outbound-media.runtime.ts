import { loadWebMedia } from "velaclaw/plugin-sdk/web-media";

export async function loadOutboundMediaFromUrl(
  mediaUrl: string,
  options: {
    maxBytes?: number;
    mediaAccess?: unknown;
    mediaLocalRoots?: readonly string[];
    mediaReadFile?: (filePath: string) => Promise<Buffer>;
  } = {},
) {
  const access =
    typeof options.mediaAccess === "object" && options.mediaAccess !== null
      ? (options.mediaAccess as {
          localRoots?: readonly string[];
          readFile?: (filePath: string) => Promise<Buffer>;
        })
      : undefined;
  const readFile = access?.readFile ?? options.mediaReadFile;
  const localRoots =
    access?.localRoots?.length && access.localRoots.length > 0
      ? access.localRoots
      : options.mediaLocalRoots && options.mediaLocalRoots.length > 0
        ? options.mediaLocalRoots
        : undefined;
  return await loadWebMedia(
    mediaUrl,
    readFile
      ? {
          ...(options.maxBytes !== undefined ? { maxBytes: options.maxBytes } : {}),
          localRoots: "any",
          readFile,
          hostReadCapability: true,
        }
      : {
          ...(options.maxBytes !== undefined ? { maxBytes: options.maxBytes } : {}),
          ...(localRoots ? { localRoots } : {}),
        },
  );
}
