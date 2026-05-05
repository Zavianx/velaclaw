import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { loadWorkspaceSkillEntries } from "../agents/skills.js";
import { resolveClawSkillFilter } from "./claw-skill-filter.js";

const tempDirs: string[] = [];
const originalHome = process.env.HOME;
const originalUserProfile = process.env.USERPROFILE;

async function makeTempRoot(): Promise<string> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "velaclaw-claw-assets-"));
  tempDirs.push(dir);
  return dir;
}

async function writeSkill(root: string, name: string): Promise<void> {
  const skillDir = path.join(root, name);
  await fs.mkdir(skillDir, { recursive: true });
  await fs.writeFile(
    path.join(skillDir, "SKILL.md"),
    `---
name: ${name}
description: ${name} test skill
---

# ${name}
`,
    "utf8",
  );
}

afterEach(async () => {
  if (originalHome === undefined) {
    delete process.env.HOME;
  } else {
    process.env.HOME = originalHome;
  }
  if (originalUserProfile === undefined) {
    delete process.env.USERPROFILE;
  } else {
    process.env.USERPROFILE = originalUserProfile;
  }
  await Promise.all(tempDirs.splice(0).map((dir) => fs.rm(dir, { recursive: true, force: true })));
});

describe("claw skill inheritance", () => {
  it("inherits shared and private skill roots when no claw filter is set", async () => {
    const root = await makeTempRoot();
    const workspaceDir = path.join(root, "workspace");
    const managedSkillsDir = path.join(root, "managed-skills");
    const bundledSkillsDir = path.join(root, "bundled-skills-empty");
    const homeDir = path.join(root, "home");
    process.env.HOME = homeDir;
    process.env.USERPROFILE = homeDir;
    await writeSkill(managedSkillsDir, "shared-finance");
    await writeSkill(path.join(homeDir, ".agents", "skills"), "private-coding");

    const inheritedFilter = resolveClawSkillFilter({
      clawFilter: undefined,
      agentFilter: ["shared-finance", "private-coding"],
    });
    const entries = loadWorkspaceSkillEntries(workspaceDir, {
      managedSkillsDir,
      bundledSkillsDir,
      skillFilter: inheritedFilter,
    });

    expect(entries.map((entry) => entry.skill.name).toSorted()).toEqual([
      "private-coding",
      "shared-finance",
    ]);
  });

  it("narrows inherited assets when a claw skill filter is set", async () => {
    const root = await makeTempRoot();
    const workspaceDir = path.join(root, "workspace");
    const managedSkillsDir = path.join(root, "managed-skills");
    const bundledSkillsDir = path.join(root, "bundled-skills-empty");
    const homeDir = path.join(root, "home");
    process.env.HOME = homeDir;
    process.env.USERPROFILE = homeDir;
    await writeSkill(managedSkillsDir, "shared-finance");
    await writeSkill(path.join(homeDir, ".agents", "skills"), "private-coding");

    const narrowedFilter = resolveClawSkillFilter({
      clawFilter: ["shared-finance"],
      agentFilter: ["shared-finance", "private-coding"],
    });
    const entries = loadWorkspaceSkillEntries(workspaceDir, {
      managedSkillsDir,
      bundledSkillsDir,
      skillFilter: narrowedFilter,
    });

    expect(narrowedFilter).toEqual(["shared-finance"]);
    expect(entries.map((entry) => entry.skill.name)).toEqual(["shared-finance"]);
  });

  it("does not widen agent-level private asset allowlists", () => {
    expect(
      resolveClawSkillFilter({
        clawFilter: ["shared-finance"],
        agentFilter: ["private-coding"],
      }),
    ).toEqual([]);
  });
});
