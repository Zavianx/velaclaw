import { describe, expect, it } from "vitest";
import type { VelaclawConfig } from "../config/types.velaclaw.js";
import { __testing, routePersonalTeam } from "./personal-team-router.js";

const baseCfg: VelaclawConfig = {
  personalTeam: {
    enabled: true,
    autoAssist: true,
    maxAgents: 3,
    maxSpawnDepth: 1,
    writerPolicy: "leader_only",
    confidenceThreshold: 0.72,
  },
};

describe("routePersonalTeam", () => {
  it("defaults to explicit-only routing for complex requests", async () => {
    const decision = await routePersonalTeam({
      cfg: {},
      userMessage: "帮我调研两个迁移方案，分析取舍，并验证主要风险和测试缺口",
      sessionKey: "agent:main:main",
    });

    expect(decision.mode).toBe("solo");
    expect(decision.reason).toBe("auto_assist_disabled");
  });

  it("honors manual-only config for complex requests without explicit triggers", async () => {
    const decision = await routePersonalTeam({
      cfg: {
        personalTeam: {
          enabled: true,
          autoAssist: false,
        },
      },
      userMessage: "帮我调研两个迁移方案，分析取舍，并验证主要风险和测试缺口",
      sessionKey: "agent:main:main",
    });

    expect(decision.mode).toBe("solo");
    expect(decision.reason).toBe("auto_assist_disabled");
    expect(decision.explicit).toBe(false);
  });

  it("still honors explicit team triggers with default config", async () => {
    const decision = await routePersonalTeam({
      cfg: {},
      userMessage: "开团队帮我调研两个迁移方案，分析取舍，并验证主要风险",
      sessionKey: "agent:main:main",
    });

    expect(decision.mode).toBe("team");
    expect(decision.explicit).toBe(true);
  });

  it("does not treat architecture noun phrases as explicit team triggers", async () => {
    const decision = await routePersonalTeam({
      cfg: {},
      userMessage: "请审查 personal team multi-agent architecture 的实现是否合理",
      sessionKey: "agent:main:main",
    });

    expect(decision.mode).toBe("solo");
    expect(decision.reason).toBe("auto_assist_disabled");
    expect(decision.explicit).toBe(false);
  });

  it("keeps simple questions solo", async () => {
    const decision = await routePersonalTeam({
      cfg: baseCfg,
      userMessage: "what is TypeScript?",
      sessionKey: "agent:main:main",
    });

    expect(decision.mode).toBe("solo");
    expect(decision.reason).toBe("classifier_below_threshold");
  });

  it("uses team mode for explicit multi-agent triggers", async () => {
    const decision = await routePersonalTeam({
      cfg: baseCfg,
      userMessage: "开多 agent 帮我比较两个方案并验证风险",
      sessionKey: "agent:main:main",
    });

    expect(decision.mode).toBe("team");
    expect(decision.explicit).toBe(true);
    expect(decision.roles.map((role) => role.role)).toEqual(["researcher", "analyst", "verifier"]);
  });

  it("honors action-oriented English explicit team triggers", async () => {
    const decision = await routePersonalTeam({
      cfg: baseCfg,
      userMessage: "use multiple agents to compare the options and verify the risks",
      sessionKey: "agent:main:main",
    });

    expect(decision.mode).toBe("team");
    expect(decision.explicit).toBe(true);
  });

  it("auto-assists complex research, analysis, and verification requests", async () => {
    const decision = await routePersonalTeam({
      cfg: baseCfg,
      userMessage: "帮我调研两个迁移方案，分析取舍，并验证主要风险和测试缺口",
      sessionKey: "agent:main:main",
    });

    expect(["assist", "team"]).toContain(decision.mode);
    expect(decision.confidence).toBeGreaterThanOrEqual(0.72);
    expect(decision.roles.length).toBeGreaterThan(0);
  });

  it("uses the LLM classifier for time-bounded research and analysis", async () => {
    const decision = await routePersonalTeam({
      cfg: baseCfg,
      userMessage: "我需要你搜集华胜天成近一个月的股票资料，并且你给我分析一下",
      sessionKey: "agent:main:main",
      agentId: "main",
      classifier: async (input) => {
        expect(input.userMessage).toBe(
          "我需要你搜集华胜天成近一个月的股票资料，并且你给我分析一下",
        );
        return {
          mode: "team",
          confidence: 0.88,
          reason: "research_plus_analysis_needs_independent_helpers",
          riskLevel: "low",
          requiresUserConfirmation: false,
          roles: [
            { role: "researcher", scope: "Collect recent source material and price context." },
            { role: "analyst", scope: "Analyze trend, drivers, and implications." },
            { role: "verifier", scope: "Check for stale data, gaps, and unsupported claims." },
          ],
        };
      },
    });

    expect(decision.mode).toBe("team");
    expect(decision.roles.map((role) => role.role)).toEqual(["researcher", "analyst", "verifier"]);
  });

  it("does not let the classifier clear confirmation for high-risk decisions", async () => {
    const decision = await routePersonalTeam({
      cfg: baseCfg,
      userMessage: "分析两个方案并验证主要风险",
      sessionKey: "agent:main:main",
      agentId: "main",
      classifier: async () => ({
        mode: "solo",
        confidence: 0.92,
        reason: "classifier_detected_high_risk",
        riskLevel: "high",
        requiresUserConfirmation: false,
      }),
    });

    expect(decision.mode).toBe("solo");
    expect(decision.riskLevel).toBe("high");
    expect(decision.requiresUserConfirmation).toBe(true);
  });

  it("falls back when the classifier throws", async () => {
    const decision = await routePersonalTeam({
      cfg: baseCfg,
      userMessage: "帮我调研两个迁移方案，分析取舍，并验证主要风险和测试缺口",
      sessionKey: "agent:main:main",
      agentId: "main",
      classifier: async () => {
        throw new Error("classifier unavailable");
      },
    });

    expect(["assist", "team"]).toContain(decision.mode);
    expect(decision.confidence).toBeGreaterThanOrEqual(0.72);
  });

  it("parses the first valid JSON object from classifier text", () => {
    const parsed = __testing.parseClassifierOutput(
      'note {not json} {"mode":"assist","confidence":0.8,"reason":"ok","roles":["researcher"],"riskLevel":"low","requiresUserConfirmation":false}',
    );

    expect(parsed?.mode).toBe("assist");
    expect(parsed?.roles).toEqual(["researcher"]);
  });

  it("falls back to solo when classifier confidence is low", async () => {
    const decision = await routePersonalTeam({
      cfg: baseCfg,
      userMessage: "explain this term briefly",
      sessionKey: "agent:main:main",
    });

    expect(decision.mode).toBe("solo");
    expect(decision.confidence).toBeLessThan(0.72);
  });

  it("does not auto-enable helpers for high-risk write tasks", async () => {
    const decision = await routePersonalTeam({
      cfg: baseCfg,
      userMessage: "analyze the deployment options and then deploy the best one",
      sessionKey: "agent:main:main",
    });

    expect(decision.mode).toBe("solo");
    expect(decision.riskLevel).toBe("high");
    expect(decision.requiresUserConfirmation).toBe(true);
  });
});
