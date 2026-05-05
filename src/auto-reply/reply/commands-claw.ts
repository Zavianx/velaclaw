import fs from "node:fs/promises";
import { resolveSessionAgentId } from "../../agents/agent-scope.js";
import {
  archiveClawProfile,
  createClawProfile,
  findClawProfileByName,
  listClawProfiles,
  resolveActiveClawProfile,
  resolveClawScopeFromContext,
  setActiveClaw,
  updateClawProfile,
  type ClawProfile,
} from "../../claws/claw-sessions.js";
import { updateSessionStore, type SessionEntry } from "../../config/sessions.js";
import {
  normalizeOptionalLowercaseString,
  normalizeOptionalString,
} from "../../shared/string-coerce.js";
import { rejectUnauthorizedCommand } from "./command-gates.js";
import {
  parseClawArgs,
  parseClawInvocation,
  parseProfilePatch,
  tokenizeClawArgs,
  type ParsedProfilePatch,
} from "./commands-claw.parse.js";
import type { CommandHandler, HandleCommandsParams } from "./commands-types.js";

function usageText(): string {
  return [
    "Usage:",
    "/claw create <name> [role text] [--skills a,b] [--model provider/model] [--thinking low]",
    "/claw use <name|main>",
    "/claw leave",
    "/claw list",
    "/claw current",
    "/claw edit <name> [role text] [--skills inherit|none|a,b] [--model inherit|provider/model]",
    "/claw remove <name> [--purge]",
  ].join("\n");
}

function resolveAgentId(params: HandleCommandsParams): string {
  return resolveSessionAgentId({
    sessionKey: params.sessionKey,
    config: params.cfg,
  });
}

function formatProfile(profile: ClawProfile, activeId?: string): string {
  const active = profile.id === activeId ? " *active*" : "";
  const skills =
    profile.skillFilter === undefined
      ? "skills: inherit"
      : profile.skillFilter.length === 0
        ? "skills: none"
        : `skills: ${profile.skillFilter.join(",")}`;
  const model =
    profile.providerOverride && profile.modelOverride
      ? `model: ${profile.providerOverride}/${profile.modelOverride}`
      : "model: inherit";
  return `- ${profile.name}${active} (${skills}; ${model})`;
}

async function syncExistingSessionEntry(params: {
  commandParams: HandleCommandsParams;
  profile: ClawProfile;
  clear?: ParsedProfilePatch["clear"];
}): Promise<void> {
  const { commandParams, profile, clear } = params;
  const existing = commandParams.sessionStore?.[profile.sessionKey];
  if (!existing || !commandParams.storePath) {
    return;
  }
  const apply = (entry: SessionEntry) => {
    entry.label = `claw:${profile.name}`;
    entry.displayName = `Claw: ${profile.name}`;
    if (clear?.modelOverride) {
      delete entry.providerOverride;
      delete entry.modelOverride;
      delete entry.modelOverrideSource;
    } else if (profile.providerOverride && profile.modelOverride) {
      entry.providerOverride = profile.providerOverride;
      entry.modelOverride = profile.modelOverride;
      entry.modelOverrideSource = "user";
    }
    if (clear?.thinkingLevel) {
      delete entry.thinkingLevel;
    } else if (profile.thinkingLevel) {
      entry.thinkingLevel = profile.thinkingLevel;
    }
    if (clear?.reasoningLevel) {
      delete entry.reasoningLevel;
    } else if (profile.reasoningLevel) {
      entry.reasoningLevel = profile.reasoningLevel;
    }
    entry.updatedAt = Date.now();
  };
  apply(existing);
  await updateSessionStore(commandParams.storePath, (store) => {
    const entry = store[profile.sessionKey];
    if (!entry) {
      return;
    }
    apply(entry);
  });
}

async function purgeClawSession(params: {
  commandParams: HandleCommandsParams;
  profile: ClawProfile;
}): Promise<void> {
  const { commandParams, profile } = params;
  const entry = commandParams.sessionStore?.[profile.sessionKey];
  if (entry?.sessionFile) {
    await fs.rm(entry.sessionFile, { force: true }).catch(() => undefined);
  }
  if (commandParams.sessionStore) {
    delete commandParams.sessionStore[profile.sessionKey];
  }
  if (commandParams.storePath) {
    await updateSessionStore(commandParams.storePath, (store) => {
      delete store[profile.sessionKey];
    });
  }
}

export const handleClawCommand: CommandHandler = async (params, allowTextCommands) => {
  if (!allowTextCommands) {
    return null;
  }
  const argText = parseClawInvocation(params.command.commandBodyNormalized);
  if (argText == null) {
    return null;
  }
  const unauthorized = rejectUnauthorizedCommand(params, "/claw");
  if (unauthorized) {
    return unauthorized;
  }

  const agentId = resolveAgentId(params);
  const scope = resolveClawScopeFromContext({ agentId, ctx: params.ctx });
  const active = resolveActiveClawProfile({ agentId, ctx: params.ctx });
  const args = parseClawArgs(argText);

  if (args.action === "help") {
    return { shouldContinue: false, reply: { text: usageText() } };
  }

  if (args.action === "current" || !args.action) {
    return {
      shouldContinue: false,
      reply: {
        text: active ? `Active claw: ${active.name}` : "Active claw: main",
      },
    };
  }

  if (args.action === "list") {
    const profiles = listClawProfiles({ agentId });
    const lines = profiles.map((profile) => formatProfile(profile, active?.id));
    return {
      shouldContinue: false,
      reply: {
        text: lines.length
          ? ["Claws:", ...lines, "", "Use: /claw use <name>"].join("\n")
          : "No claws yet. Create one with /claw create <name> [role text].",
      },
    };
  }

  if (args.action === "detach") {
    setActiveClaw({ agentId, scope });
    return { shouldContinue: false, reply: { text: "Active claw: main" } };
  }

  if (args.action === "use") {
    const name = normalizeOptionalString(args.name);
    if (!name) {
      return { shouldContinue: false, reply: { text: "Usage: /claw use <name|main>" } };
    }
    if (normalizeOptionalLowercaseString(name) === "main") {
      setActiveClaw({ agentId, scope });
      return { shouldContinue: false, reply: { text: "Active claw: main" } };
    }
    const profile = findClawProfileByName({ agentId, name });
    if (!profile) {
      return { shouldContinue: false, reply: { text: `Claw "${name}" not found.` } };
    }
    setActiveClaw({ agentId, scope, profileId: profile.id });
    return {
      shouldContinue: false,
      reply: { text: `Active claw: ${profile.name}` },
    };
  }

  if (args.action === "new") {
    if (!args.name) {
      return { shouldContinue: false, reply: { text: "Usage: /claw new <name> [role text]" } };
    }
    const parsed = parseProfilePatch(args, params.provider);
    if (parsed.errors.length > 0) {
      return { shouldContinue: false, reply: { text: parsed.errors.join("\n") } };
    }
    try {
      const profile = createClawProfile({
        agentId,
        input: {
          name: args.name,
          ...parsed.patch,
        },
      });
      setActiveClaw({ agentId, scope, profileId: profile.id });
      return {
        shouldContinue: false,
        reply: {
          text: `Created and activated claw: ${profile.name}`,
        },
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return { shouldContinue: false, reply: { text: message } };
    }
  }

  if (args.action === "edit") {
    if (!args.name) {
      return { shouldContinue: false, reply: { text: "Usage: /claw edit <name> [options]" } };
    }
    const profile = findClawProfileByName({ agentId, name: args.name });
    if (!profile) {
      return { shouldContinue: false, reply: { text: `Claw "${args.name}" not found.` } };
    }
    const parsed = parseProfilePatch(args, params.provider);
    if (parsed.errors.length > 0) {
      return { shouldContinue: false, reply: { text: parsed.errors.join("\n") } };
    }
    try {
      const updated = updateClawProfile({
        agentId,
        profileId: profile.id,
        patch: parsed.patch,
        clear: parsed.clear,
      });
      await syncExistingSessionEntry({
        commandParams: params,
        profile: updated,
        clear: parsed.clear,
      });
      return { shouldContinue: false, reply: { text: `Updated claw: ${updated.name}` } };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return { shouldContinue: false, reply: { text: message } };
    }
  }

  if (args.action === "delete" || args.action === "remove") {
    if (!args.name) {
      return { shouldContinue: false, reply: { text: "Usage: /claw delete <name> [--purge]" } };
    }
    const profile = findClawProfileByName({ agentId, name: args.name });
    if (!profile) {
      return { shouldContinue: false, reply: { text: `Claw "${args.name}" not found.` } };
    }
    archiveClawProfile({ agentId, profileId: profile.id });
    if (args.flags.get("purge") === true) {
      await purgeClawSession({ commandParams: params, profile });
    }
    return {
      shouldContinue: false,
      reply: {
        text:
          args.flags.get("purge") === true
            ? `Deleted claw and purged session: ${profile.name}`
            : `Deleted claw: ${profile.name}`,
      },
    };
  }

  return { shouldContinue: false, reply: { text: usageText() } };
};

export const __testing = {
  parseClawArgs,
  parseInvocation: parseClawInvocation,
  tokenizeArgs: tokenizeClawArgs,
};
