export class MediaFetchError extends Error {
  code: string;

  constructor(code: string, message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "MediaFetchError";
    this.code = code;
  }
}

export type FetchLike = (
  input: string | URL | Request,
  init?: RequestInit & { dispatcher?: unknown },
) => Promise<Response>;

export async function fetchRemoteMedia(params: {
  url: string;
  fetchImpl?: typeof fetch | FetchLike;
  maxBytes?: number;
  requestInit?: RequestInit;
  filePathHint?: string;
  ssrfPolicy?: unknown;
  [key: string]: unknown;
}) {
  const fetchFn = (params.fetchImpl ?? fetch) as typeof fetch;
  const response = await fetchFn(params.url, params.requestInit);
  if (!response.ok) {
    throw new MediaFetchError("http_error", `remote media fetch failed: ${response.status}`);
  }
  const arrayBuffer = await response.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);
  if (
    typeof params.maxBytes === "number" &&
    params.maxBytes > 0 &&
    buffer.byteLength > params.maxBytes
  ) {
    throw new MediaFetchError("max_bytes", `remote media exceeds maxBytes (${params.maxBytes})`);
  }
  const mimeType = response.headers.get("content-type") || "application/octet-stream";
  return {
    buffer,
    mimeType,
    contentType: mimeType,
    byteLength: buffer.byteLength,
    fileName: undefined as string | undefined,
  };
}
