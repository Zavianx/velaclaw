export const VELACLAW_OWNER_ONLY_CORE_TOOL_NAMES = ["cron", "gateway", "nodes"] as const;

const VELACLAW_OWNER_ONLY_CORE_TOOL_NAME_SET: ReadonlySet<string> = new Set(
  VELACLAW_OWNER_ONLY_CORE_TOOL_NAMES,
);

export function isVelaclawOwnerOnlyCoreToolName(toolName: string): boolean {
  return VELACLAW_OWNER_ONLY_CORE_TOOL_NAME_SET.has(toolName);
}
