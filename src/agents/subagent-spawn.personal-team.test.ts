import { afterEach, describe, expect, it, vi } from "vitest";
import type { VelaclawConfig } from "../config/types.velaclaw.js";
import { __testing, spawnSubagentDirect } from "./subagent-spawn.js";

afterEach(() => {
  __testing.setDepsForTest();
  vi.restoreAllMocks();
});

describe("spawnSubagentDirect personal team depth override", () => {
  it("does not allow a caller maxSpawnDepth override to exceed the global limit", async () => {
    const cfg = {
      agents: {
        defaults: {
          subagents: {
            maxSpawnDepth: 1,
          },
        },
      },
    } as VelaclawConfig;
    __testing.setDepsForTest({
      loadConfig: () => cfg,
    });

    const result = await spawnSubagentDirect(
      {
        task: "review safely",
        label: "personal-verifier",
        maxSpawnDepth: 5,
      },
      {
        agentSessionKey: "agent:main:main:subagent:child",
        requesterAgentIdOverride: "main",
      },
    );

    expect(result.status).toBe("forbidden");
    expect(result.error).toContain("max: 1");
  });
});
