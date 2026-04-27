import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import type { VelaclawConfig } from "../config/types.velaclaw.js";
import {
  filterToolsByPolicy,
  resolveSubagentToolPolicy,
  resolveSubagentToolPolicyForSession,
} from "./pi-tools.policy.js";
import type { AnyAgentTool } from "./pi-tools.types.js";

describe("personal-team subagent tool policy defaults", () => {
  it("does not make ordinary subagents read-only by default", () => {
    const policy = resolveSubagentToolPolicy({} as VelaclawConfig, 1);

    expect(policy.deny).toEqual(
      expect.arrayContaining(["session_status", "sessions_send", "sessions_spawn", "subagents"]),
    );
    expect(policy.deny).not.toContain("exec");
    expect(policy.deny).not.toContain("write");
    expect(policy.deny).not.toContain("apply_patch");
  });

  it("keeps personal team helpers read-only while allowing status lookups", async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "velaclaw-personal-team-policy-"));
    const storePath = path.join(dir, "sessions.json");
    const sessionKey = "agent:main:subagent:helper";
    await fs.writeFile(
      storePath,
      JSON.stringify({
        [sessionKey]: {
          sessionId: sessionKey,
          spawnDepth: 1,
          subagentRole: "leaf",
          subagentControlScope: "none",
          subagentToolPolicy: "read_only",
        },
      }),
    );
    const cfg = {
      session: {
        store: storePath,
      },
      tools: {
        subagents: {
          tools: {
            alsoAllow: ["exec", "session_status"],
          },
        },
      },
    } as VelaclawConfig;

    const policy = resolveSubagentToolPolicyForSession(cfg, sessionKey);

    expect(policy.allow).toEqual([
      "read",
      "web_search",
      "web_fetch",
      "research_task",
      "session_status",
      "pdf",
    ]);
    expect(policy.allow).not.toContain("exec");
    expect(policy.deny).toEqual(
      expect.arrayContaining([
        "exec",
        "process",
        "write",
        "edit",
        "apply_patch",
        "message",
        "sessions_send",
        "sessions_spawn",
        "subagents",
      ]),
    );
    expect(policy.deny).not.toContain("session_status");
    const filtered = filterToolsByPolicy(
      [
        { name: "read" },
        { name: "web_search" },
        { name: "session_status" },
        { name: "exec" },
        { name: "plugin_mutate_record" },
        { name: "lsp_definition_ts" },
      ] as AnyAgentTool[],
      policy,
    ).map((tool) => tool.name);

    expect(filtered).toEqual(["read", "web_search", "session_status"]);
    await fs.rm(dir, { recursive: true, force: true });
  });
});
