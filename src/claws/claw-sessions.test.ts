import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import type { MsgContext } from "../auto-reply/templating.js";
import {
  applyActiveClawToContext,
  createClawProfile,
  listClawProfiles,
  resolveClawScopeFromContext,
  setActiveClaw,
} from "./claw-sessions.js";

const tempDirs: string[] = [];

async function makeEnv(): Promise<NodeJS.ProcessEnv> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "velaclaw-claws-"));
  tempDirs.push(dir);
  return {
    ...process.env,
    VELACLAW_STATE_DIR: dir,
    VELACLAW_TEST_FAST: "1",
  };
}

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => fs.rm(dir, { recursive: true, force: true })));
});

function telegramDm(senderId: string): MsgContext {
  return {
    Provider: "telegram",
    Surface: "telegram",
    ChatType: "direct",
    From: senderId,
    To: senderId,
    SenderId: senderId,
  };
}

describe("claw session profiles", () => {
  it("creates a named claw and routes the active conversation into its session key", async () => {
    const env = await makeEnv();
    const ctx = telegramDm("user-1");
    const profile = createClawProfile({
      agentId: "main",
      env,
      input: {
        name: "量化",
        rolePrompt: "专门做量化研究。",
        skillFilter: ["financial", "research"],
      },
    });

    setActiveClaw({
      agentId: "main",
      env,
      scope: resolveClawScopeFromContext({ agentId: "main", ctx }),
      profileId: profile.id,
    });

    const routed = applyActiveClawToContext({ agentId: "main", ctx, env });

    expect(routed.profile?.name).toBe("量化");
    expect(routed.ctx.SessionKey).toBe(profile.sessionKey);
    expect(routed.ctx.ClawSessionRolePrompt).toBe("专门做量化研究。");
    expect(routed.ctx.ClawSkillFilter).toEqual(["financial", "research"]);
  });

  it("keeps active claws scoped by sender", async () => {
    const env = await makeEnv();
    const ctxA = telegramDm("user-a");
    const ctxB = telegramDm("user-b");
    const profile = createClawProfile({
      agentId: "main",
      env,
      input: { name: "coding" },
    });
    setActiveClaw({
      agentId: "main",
      env,
      scope: resolveClawScopeFromContext({ agentId: "main", ctx: ctxA }),
      profileId: profile.id,
    });

    expect(applyActiveClawToContext({ agentId: "main", ctx: ctxA, env }).profile?.id).toBe(
      profile.id,
    );
    expect(applyActiveClawToContext({ agentId: "main", ctx: ctxB, env }).profile).toBeUndefined();
  });

  it("switches between main and multiple claws without reusing session keys", async () => {
    const env = await makeEnv();
    const ctx = telegramDm("user-1");
    const quant = createClawProfile({
      agentId: "main",
      env,
      input: { name: "quant" },
    });
    const coding = createClawProfile({
      agentId: "main",
      env,
      input: { name: "coding" },
    });
    const scope = resolveClawScopeFromContext({ agentId: "main", ctx });

    setActiveClaw({ agentId: "main", env, scope, profileId: quant.id });
    expect(applyActiveClawToContext({ agentId: "main", ctx, env }).ctx.SessionKey).toBe(
      quant.sessionKey,
    );

    setActiveClaw({ agentId: "main", env, scope, profileId: coding.id });
    expect(applyActiveClawToContext({ agentId: "main", ctx, env }).ctx.SessionKey).toBe(
      coding.sessionKey,
    );
    expect(coding.sessionKey).not.toBe(quant.sessionKey);

    setActiveClaw({ agentId: "main", env, scope });
    const mainRoute = applyActiveClawToContext({ agentId: "main", ctx, env });
    expect(mainRoute.profile).toBeUndefined();
    expect(mainRoute.ctx.SessionKey).toBeUndefined();
  });

  it("allows reusing a name after archiving the old profile", async () => {
    const env = await makeEnv();
    const first = createClawProfile({ agentId: "main", env, input: { name: "research" } });
    const { archiveClawProfile } = await import("./claw-sessions.js");
    archiveClawProfile({ agentId: "main", env, profileId: first.id });
    const second = createClawProfile({ agentId: "main", env, input: { name: "research" } });

    expect(second.id).not.toBe(first.id);
    expect(listClawProfiles({ agentId: "main", env }).map((entry) => entry.id)).toEqual([
      second.id,
    ]);
  });
});
