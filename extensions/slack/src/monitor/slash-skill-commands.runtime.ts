import { listSkillCommandsForAgents as listSkillCommandsForAgentsImpl } from "velaclaw/plugin-sdk/command-auth";

type ListSkillCommandsForAgents =
  typeof import("velaclaw/plugin-sdk/command-auth").listSkillCommandsForAgents;

export function listSkillCommandsForAgents(
  ...args: Parameters<ListSkillCommandsForAgents>
): ReturnType<ListSkillCommandsForAgents> {
  return listSkillCommandsForAgentsImpl(...args);
}
