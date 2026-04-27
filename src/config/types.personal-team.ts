export type PersonalTeamWriterPolicy = "leader_only";

export type PersonalTeamConfig = {
  /** Enable session-local personal agent teams. Default: true. */
  enabled?: boolean;
  /** Allow the router to auto-enable read-only helper agents for high-confidence complex tasks. Default: false. */
  autoAssist?: boolean;
  /** Phrases that force personal-team mode for the current user turn. */
  explicitTriggers?: string[];
  /** Maximum helper agents to coordinate for a single turn. */
  maxAgents?: number;
  /** Maximum personal-team spawn depth. v1 defaults to 1 so helpers cannot spawn helpers. */
  maxSpawnDepth?: number;
  /** v1 policy: only the leader may write, send, delete, commit, or perform high-risk actions. */
  writerPolicy?: PersonalTeamWriterPolicy;
  /** Minimum classifier confidence required for automatic assist/team mode. */
  confidenceThreshold?: number;
};
