import type { ClawProfileInput } from "../../claws/claw-sessions.js";
import {
  normalizeOptionalLowercaseString,
  normalizeOptionalString,
} from "../../shared/string-coerce.js";
import { normalizeReasoningLevel, normalizeThinkLevel } from "../thinking.js";

export type ParsedClawArgs = {
  action: string;
  name?: string;
  roleText?: string;
  flags: Map<string, string | true>;
  errors: string[];
};

export type ParsedProfilePatch = {
  patch: Partial<ClawProfileInput>;
  clear: {
    rolePrompt?: boolean;
    skillFilter?: boolean;
    modelOverride?: boolean;
    thinkingLevel?: boolean;
    reasoningLevel?: boolean;
  };
  errors: string[];
};

const CLEAR_VALUES = new Set(["inherit", "default", "clear", "none", "off"]);
const ACTION_ALIASES = new Map<string, string>([
  ["a", "use"],
  ["attach", "use"],
  ["attach-session", "use"],
  ["create", "new"],
  ["current-session", "current"],
  ["del", "delete"],
  ["delete-session", "delete"],
  ["detach", "detach"],
  ["detach-client", "detach"],
  ["enter", "use"],
  ["leave", "detach"],
  ["kill", "delete"],
  ["kill-session", "delete"],
  ["list-sessions", "list"],
  ["ls", "list"],
  ["new-session", "new"],
  ["open", "use"],
  ["remove", "delete"],
  ["rm", "delete"],
  ["select", "use"],
  ["switch", "use"],
  ["switch-client", "use"],
  ["use-session", "use"],
]);
const NAME_ACTIONS = new Set(["new", "use", "edit", "delete"]);

export function tokenizeClawArgs(input: string): string[] {
  const tokens: string[] = [];
  let current = "";
  let quote: string | null = null;
  let escaping = false;
  for (const char of input) {
    if (escaping) {
      current += char;
      escaping = false;
      continue;
    }
    if (char === "\\") {
      escaping = true;
      continue;
    }
    if (quote) {
      if (char === quote) {
        quote = null;
      } else {
        current += char;
      }
      continue;
    }
    if (char === '"' || char === "'") {
      quote = char;
      continue;
    }
    if (/\s/.test(char)) {
      if (current) {
        tokens.push(current);
        current = "";
      }
      continue;
    }
    current += char;
  }
  if (current) {
    tokens.push(current);
  }
  return tokens;
}

export function parseClawInvocation(body: string): string | null {
  if (body === "/claw") {
    return "";
  }
  if (body.startsWith("/claw ")) {
    return body.slice("/claw ".length).trim();
  }
  if (body === "/new claw") {
    return "new";
  }
  if (body.startsWith("/new claw ")) {
    return `new ${body.slice("/new claw ".length).trim()}`.trim();
  }
  return null;
}

export function parseClawArgs(argText: string): ParsedClawArgs {
  const tokens = tokenizeClawArgs(argText);
  const rawAction = normalizeOptionalLowercaseString(tokens[0]) ?? "current";
  const action = ACTION_ALIASES.get(rawAction) ?? rawAction;
  const flags = new Map<string, string | true>();
  const errors: string[] = [];
  let name: string | undefined;
  const roleParts: string[] = [];
  for (let i = 1; i < tokens.length; i += 1) {
    const token = tokens[i];
    const shortFlagMatch = token.match(/^-(s|t)(?:=(.*))?$/u);
    if (shortFlagMatch) {
      const key = shortFlagMatch[1] === "s" ? "session" : "target";
      const value = shortFlagMatch[2] ?? tokens[i + 1];
      const normalizedValue = normalizeOptionalString(value);
      if (!normalizedValue) {
        errors.push(`Missing value for -${shortFlagMatch[1]}.`);
        continue;
      }
      if (shortFlagMatch[2] == null) {
        i += 1;
      }
      flags.set(key, normalizedValue);
      name ??= normalizedValue;
      continue;
    }
    if (!token.startsWith("--")) {
      if (!name && NAME_ACTIONS.has(action)) {
        name = normalizeOptionalString(token);
      } else {
        roleParts.push(token);
      }
      continue;
    }
    const [rawKey, inlineValue] = token
      .slice(2)
      .split(/=(.*)/s)
      .filter((part) => part !== "");
    const key = normalizeOptionalLowercaseString(rawKey);
    if (!key) {
      continue;
    }
    if (key === "purge") {
      flags.set(key, true);
      continue;
    }
    const value = inlineValue ?? tokens[i + 1];
    const normalizedValue = normalizeOptionalString(value);
    if (!normalizedValue) {
      errors.push(`Missing value for --${key}.`);
      continue;
    }
    if (inlineValue == null) {
      i += 1;
    }
    flags.set(key, normalizedValue);
    if ((key === "session" || key === "target") && !name) {
      name = normalizedValue;
    }
  }
  const explicitRole = flags.get("role");
  const roleText =
    typeof explicitRole === "string"
      ? normalizeOptionalString(explicitRole)
      : normalizeOptionalString(roleParts.join(" "));
  return { action, name, roleText, flags, errors };
}

function parseSkillFilter(raw: string): { clear?: boolean; value?: string[] } {
  const normalized = normalizeOptionalLowercaseString(raw);
  if (!normalized || normalized === "inherit" || normalized === "all" || normalized === "default") {
    return { clear: true };
  }
  if (normalized === "none" || normalized === "off" || normalized === "empty") {
    return { value: [] };
  }
  return {
    value: raw
      .split(",")
      .map((entry) => normalizeOptionalString(entry))
      .filter((entry): entry is string => Boolean(entry)),
  };
}

function parseModelOverride(
  raw: string,
  currentProvider: string,
): { clear?: boolean; providerOverride?: string; modelOverride?: string; error?: string } {
  const lowered = normalizeOptionalLowercaseString(raw);
  if (!lowered || CLEAR_VALUES.has(lowered)) {
    return { clear: true };
  }
  const slash = raw.indexOf("/");
  if (slash !== -1) {
    const provider = normalizeOptionalString(raw.slice(0, slash));
    const model = normalizeOptionalString(raw.slice(slash + 1));
    if (!provider || !model) {
      return { error: "Invalid --model. Use provider/model or inherit." };
    }
    return { providerOverride: provider, modelOverride: model };
  }
  const model = normalizeOptionalString(raw);
  if (!model) {
    return { error: "Invalid --model. Use provider/model or inherit." };
  }
  return { providerOverride: currentProvider, modelOverride: model };
}

export function parseProfilePatch(
  args: ParsedClawArgs,
  currentProvider: string,
): ParsedProfilePatch {
  const patch: Partial<ClawProfileInput> = {};
  const clear: ParsedProfilePatch["clear"] = {};
  const errors = [...args.errors];
  if (args.roleText) {
    if (CLEAR_VALUES.has(normalizeOptionalLowercaseString(args.roleText) ?? "")) {
      clear.rolePrompt = true;
    } else {
      patch.rolePrompt = args.roleText;
    }
  }
  const skills = args.flags.get("skills");
  if (typeof skills === "string") {
    const parsed = parseSkillFilter(skills);
    if (parsed.clear) {
      clear.skillFilter = true;
    } else {
      patch.skillFilter = parsed.value;
    }
  }
  const model = args.flags.get("model");
  if (typeof model === "string") {
    const parsed = parseModelOverride(model, currentProvider);
    if (parsed.error) {
      errors.push(parsed.error);
    } else if (parsed.clear) {
      clear.modelOverride = true;
    } else {
      patch.providerOverride = parsed.providerOverride;
      patch.modelOverride = parsed.modelOverride;
    }
  }
  const thinking = args.flags.get("thinking") ?? args.flags.get("think");
  if (typeof thinking === "string") {
    const lowered = normalizeOptionalLowercaseString(thinking);
    if (lowered && CLEAR_VALUES.has(lowered)) {
      clear.thinkingLevel = true;
    } else {
      const level = normalizeThinkLevel(thinking);
      if (!level) {
        errors.push("Invalid --thinking. Use off, minimal, low, medium, high, xhigh, or inherit.");
      } else {
        patch.thinkingLevel = level;
      }
    }
  }
  const reasoning = args.flags.get("reasoning");
  if (typeof reasoning === "string") {
    const lowered = normalizeOptionalLowercaseString(reasoning);
    if (lowered && CLEAR_VALUES.has(lowered)) {
      clear.reasoningLevel = true;
    } else {
      const level = normalizeReasoningLevel(reasoning);
      if (!level) {
        errors.push("Invalid --reasoning. Use off, on, stream, or inherit.");
      } else {
        patch.reasoningLevel = level;
      }
    }
  }
  return { patch, clear, errors };
}
