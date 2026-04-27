import crypto from "node:crypto";
import { resolveGlobalSingleton } from "../shared/global-singleton.js";
import type {
  PersonalTeamMode,
  PersonalTeamRoleAssignment,
  PersonalTeamRolePreset,
  PersonalTeamRiskLevel,
} from "./personal-team-router.js";

export type PersonalTeamChildStatus = "pending" | "accepted" | "completed" | "timeout" | "error";

export type PersonalTeamChildRun = {
  role: Exclude<PersonalTeamRolePreset, "leader">;
  label: string;
  scope: string;
  task: string;
  status: PersonalTeamChildStatus;
  runId?: string;
  childSessionKey?: string;
  startedAt: number;
  endedAt?: number;
  resultText?: string;
  error?: string;
};

export type TaskTeamRun = {
  runId: string;
  leaderSessionKey: string;
  mode: Exclude<PersonalTeamMode, "solo">;
  riskLevel: PersonalTeamRiskLevel;
  roles: PersonalTeamRoleAssignment[];
  children: PersonalTeamChildRun[];
  status: "running" | "completed" | "partial" | "error";
  startedAt: number;
  endedAt?: number;
  summary?: string;
};

type PersonalTeamRunsState = {
  runs: Map<string, TaskTeamRun>;
};

const PERSONAL_TEAM_RUNS_KEY = Symbol.for("velaclaw.personalTeamRuns");
const PERSONAL_TEAM_RUN_TTL_MS = 60 * 60 * 1000;
const PERSONAL_TEAM_RUN_MAX_ENTRIES = 200;

const state = resolveGlobalSingleton<PersonalTeamRunsState>(PERSONAL_TEAM_RUNS_KEY, () => ({
  runs: new Map<string, TaskTeamRun>(),
}));

function pruneTaskTeamRuns(now = Date.now()): void {
  for (const [runId, run] of state.runs.entries()) {
    if (run.endedAt != null && now - run.endedAt > PERSONAL_TEAM_RUN_TTL_MS) {
      state.runs.delete(runId);
    }
  }
  if (state.runs.size <= PERSONAL_TEAM_RUN_MAX_ENTRIES) {
    return;
  }
  const oldestFirst = [...state.runs.values()].toSorted((a, b) => a.startedAt - b.startedAt);
  for (const run of oldestFirst) {
    if (state.runs.size <= PERSONAL_TEAM_RUN_MAX_ENTRIES) {
      return;
    }
    if (run.status !== "running") {
      state.runs.delete(run.runId);
    }
  }
  for (const run of oldestFirst) {
    if (state.runs.size <= PERSONAL_TEAM_RUN_MAX_ENTRIES) {
      return;
    }
    state.runs.delete(run.runId);
  }
}

export function createTaskTeamRun(params: {
  leaderSessionKey: string;
  mode: Exclude<PersonalTeamMode, "solo">;
  riskLevel: PersonalTeamRiskLevel;
  roles: PersonalTeamRoleAssignment[];
}): TaskTeamRun {
  const run: TaskTeamRun = {
    runId: crypto.randomUUID(),
    leaderSessionKey: params.leaderSessionKey,
    mode: params.mode,
    riskLevel: params.riskLevel,
    roles: params.roles,
    children: [],
    status: "running",
    startedAt: Date.now(),
  };
  state.runs.set(run.runId, run);
  pruneTaskTeamRuns(run.startedAt);
  return run;
}

export function updateTaskTeamRun(run: TaskTeamRun): void {
  state.runs.set(run.runId, run);
  pruneTaskTeamRuns(run.endedAt ?? Date.now());
}

export function getTaskTeamRun(runId: string): TaskTeamRun | undefined {
  return state.runs.get(runId);
}

export function listTaskTeamRunsForLeader(leaderSessionKey: string): TaskTeamRun[] {
  return [...state.runs.values()]
    .filter((run) => run.leaderSessionKey === leaderSessionKey)
    .toSorted((a, b) => b.startedAt - a.startedAt);
}

export function resetTaskTeamRunsForTests(): void {
  state.runs.clear();
}
