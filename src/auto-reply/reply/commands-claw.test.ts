import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { applyActiveClawToContext } from "../../claws/claw-sessions.js";
import { __testing, handleClawCommand } from "./commands-claw.js";
import type { HandleCommandsParams } from "./commands-types.js";

const tempDirs: string[] = [];
const originalStateDir = process.env.VELACLAW_STATE_DIR;

async function useTempStateDir(): Promise<void> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "velaclaw-claw-command-"));
  tempDirs.push(dir);
  process.env.VELACLAW_STATE_DIR = dir;
}

afterEach(async () => {
  if (originalStateDir === undefined) {
    delete process.env.VELACLAW_STATE_DIR;
  } else {
    process.env.VELACLAW_STATE_DIR = originalStateDir;
  }
  await Promise.all(tempDirs.splice(0).map((dir) => fs.rm(dir, { recursive: true, force: true })));
});

function commandParams(commandBodyNormalized: string): HandleCommandsParams {
  return {
    ctx: {
      Provider: "telegram",
      Surface: "telegram",
      ChatType: "direct",
      From: "user-1",
      To: "user-1",
      SenderId: "user-1",
    },
    cfg: {},
    command: {
      surface: "telegram",
      channel: "telegram",
      ownerList: [],
      senderIsOwner: true,
      isAuthorizedSender: true,
      senderId: "user-1",
      rawBodyNormalized: commandBodyNormalized,
      commandBodyNormalized,
    },
    sessionKey: "agent:main:main",
    workspaceDir: "/tmp",
    directives: {},
    elevated: { enabled: false, allowed: false, failures: [] },
    provider: "openai",
    model: "gpt-test",
    contextTokens: 0,
    isGroup: false,
    resolvedVerboseLevel: "off",
    resolvedReasoningLevel: "off",
    defaultGroupActivation: () => "always",
    resolveDefaultThinkingLevel: async () => "off",
  } as unknown as HandleCommandsParams;
}

describe("claw command parsing", () => {
  it("parses /claw invocations", () => {
    expect(__testing.parseInvocation("/claw")).toBe("");
    expect(__testing.parseInvocation("/claw list")).toBe("list");
    expect(__testing.parseInvocation("/new claw quant research role")).toBe(
      "new quant research role",
    );
    expect(__testing.parseInvocation("/new something else")).toBeNull();
  });

  it("keeps quoted role text and option values together", () => {
    const parsed = __testing.parseClawArgs(
      'new quant "专门做量化研究" --skills financial,research --model openai/gpt-5.5 --thinking low',
    );

    expect(parsed.action).toBe("new");
    expect(parsed.name).toBe("quant");
    expect(parsed.roleText).toBe("专门做量化研究");
    expect(parsed.flags.get("skills")).toBe("financial,research");
    expect(parsed.flags.get("model")).toBe("openai/gpt-5.5");
    expect(parsed.flags.get("thinking")).toBe("low");
  });

  it("parses boolean flags", () => {
    const parsed = __testing.parseClawArgs("remove quant --purge");

    expect(parsed.action).toBe("delete");
    expect(parsed.name).toBe("quant");
    expect(parsed.flags.get("purge")).toBe(true);
  });

  it("parses claw-first product actions", () => {
    const created = __testing.parseClawArgs("create quant 专门做量化研究");
    expect(created.action).toBe("new");
    expect(created.name).toBe("quant");
    expect(created.roleText).toBe("专门做量化研究");

    expect(__testing.parseClawArgs("leave").action).toBe("detach");
    expect(__testing.parseClawArgs("enter quant").action).toBe("use");
  });

  it("keeps tmux-style session aliases as compatibility shims", () => {
    const created = __testing.parseClawArgs("new-session -s quant 专门做量化研究");
    expect(created.action).toBe("new");
    expect(created.name).toBe("quant");
    expect(created.roleText).toBe("专门做量化研究");

    const attached = __testing.parseClawArgs("attach-session -t quant");
    expect(attached.action).toBe("use");
    expect(attached.name).toBe("quant");
    expect(attached.flags.get("target")).toBe("quant");

    const killed = __testing.parseClawArgs("kill-session -t quant --purge");
    expect(killed.action).toBe("delete");
    expect(killed.name).toBe("quant");
    expect(killed.flags.get("purge")).toBe(true);

    expect(__testing.parseClawArgs("ls").action).toBe("list");
    expect(__testing.parseClawArgs("detach").action).toBe("detach");
  });
});

describe("handleClawCommand", () => {
  it("creates, activates, and clears a claw for the current conversation", async () => {
    await useTempStateDir();

    const createResult = await handleClawCommand(
      commandParams("/claw create quant 专门做量化研究 --skills financial"),
      true,
    );
    expect(createResult?.shouldContinue).toBe(false);
    expect(createResult?.reply?.text).toBe("Created and activated claw: quant");

    const ctx = commandParams("/claw current").ctx;
    const routed = applyActiveClawToContext({ agentId: "main", ctx });
    expect(routed.profile?.name).toBe("quant");
    expect(routed.ctx.SessionKey).toBe(routed.profile?.sessionKey);
    expect(routed.ctx.ClawSkillFilter).toEqual(["financial"]);

    const clearResult = await handleClawCommand(commandParams("/claw leave"), true);
    expect(clearResult?.reply?.text).toBe("Active claw: main");
    expect(applyActiveClawToContext({ agentId: "main", ctx }).profile).toBeUndefined();
  });

  it("supports product-style list, use, leave, and remove", async () => {
    await useTempStateDir();

    const createResult = await handleClawCommand(
      commandParams("/claw create quant 专门做量化研究 --skills financial"),
      true,
    );
    expect(createResult?.reply?.text).toBe("Created and activated claw: quant");

    const ctx = commandParams("/claw current").ctx;
    expect(applyActiveClawToContext({ agentId: "main", ctx }).profile?.name).toBe("quant");

    const leaveResult = await handleClawCommand(commandParams("/claw leave"), true);
    expect(leaveResult?.reply?.text).toBe("Active claw: main");
    expect(applyActiveClawToContext({ agentId: "main", ctx }).profile).toBeUndefined();

    const useResult = await handleClawCommand(commandParams("/claw use quant"), true);
    expect(useResult?.reply?.text).toBe("Active claw: quant");
    expect(applyActiveClawToContext({ agentId: "main", ctx }).profile?.name).toBe("quant");

    const listResult = await handleClawCommand(commandParams("/claw list"), true);
    expect(listResult?.reply?.text).toContain("Claws:");
    expect(listResult?.reply?.text).toContain("quant");
    expect(listResult?.reply?.text).not.toContain("session:");

    const removeResult = await handleClawCommand(commandParams("/claw remove quant"), true);
    expect(removeResult?.reply?.text).toBe("Deleted claw: quant");
    expect(applyActiveClawToContext({ agentId: "main", ctx }).profile).toBeUndefined();
  });

  it("supports tmux-style attach, detach, list, and kill-session", async () => {
    await useTempStateDir();

    const createResult = await handleClawCommand(
      commandParams("/claw new-session -s quant 专门做量化研究 --skills financial"),
      true,
    );
    expect(createResult?.reply?.text).toContain("Created and activated claw: quant");

    const ctx = commandParams("/claw current").ctx;
    expect(applyActiveClawToContext({ agentId: "main", ctx }).profile?.name).toBe("quant");

    const detachResult = await handleClawCommand(commandParams("/claw detach"), true);
    expect(detachResult?.reply?.text).toBe("Active claw: main");
    expect(applyActiveClawToContext({ agentId: "main", ctx }).profile).toBeUndefined();

    const attachResult = await handleClawCommand(
      commandParams("/claw attach-session -t quant"),
      true,
    );
    expect(attachResult?.reply?.text).toContain("Active claw: quant");
    expect(applyActiveClawToContext({ agentId: "main", ctx }).profile?.name).toBe("quant");

    const listResult = await handleClawCommand(commandParams("/claw ls"), true);
    expect(listResult?.reply?.text).toContain("Claws:");
    expect(listResult?.reply?.text).toContain("quant");

    const killResult = await handleClawCommand(commandParams("/claw kill-session -t quant"), true);
    expect(killResult?.reply?.text).toBe("Deleted claw: quant");
    expect(applyActiveClawToContext({ agentId: "main", ctx }).profile).toBeUndefined();
  });
});
