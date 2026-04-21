// Zalo plugin setup stub — the extension was removed during the main
// history cleanup. Keep the exported surface so the group-policy contract
// tests continue to compile; the stub always returns a "not configured"
// result, which matches runtime behaviour.

export type ZaloGroupAccessEvaluation = {
  allowed: boolean;
  groupPolicy: string;
  reason: string;
};

export function evaluateZaloGroupAccess(_params: {
  groupId?: string;
  groupAllowFrom?: readonly string[];
  [key: string]: unknown;
}): ZaloGroupAccessEvaluation {
  return {
    allowed: false,
    groupPolicy: "none",
    reason: "zalo_extension_unavailable",
  };
}
