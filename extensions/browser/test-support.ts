export {
  createCliRuntimeCapture,
  type CliMockOutputRuntime,
  type CliRuntimeCapture,
  type VelaclawConfig,
} from "velaclaw/plugin-sdk/testing";

export function withFetchPreconnect(
  fetchMock: (input: unknown, init?: RequestInit) => Promise<Response>,
): typeof fetch {
  return ((input: RequestInfo | URL, init?: RequestInit) => fetchMock(input, init)) as typeof fetch;
}
