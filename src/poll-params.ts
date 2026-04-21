export const POLL_CREATION_PARAM_DEFS: Record<
  string,
  { kind: "string" | "stringArray" | "number" | "boolean" }
> = {};
export const SHARED_POLL_CREATION_PARAM_NAMES: string[] = [];

export function hasPollCreationParams(params: Record<string, unknown>): boolean {
  if (!params || typeof params !== "object") {
    return false;
  }
  return typeof params.question === "string" && params.question.trim().length > 0;
}
