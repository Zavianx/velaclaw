import fs from "node:fs";
import type { PairingChannel } from "./pairing-store.types.js";
import { resolveChannelAllowFromPath } from "./pairing-store.js";

type AllowFromStore = {
  version?: number;
  allowFrom?: unknown;
};

function normalizeAllowFromEntries(entries: unknown): string[] {
  if (!Array.isArray(entries)) {
    return [];
  }
  const seen = new Set<string>();
  const normalized: string[] = [];
  for (const entry of entries) {
    if (typeof entry !== "string") {
      continue;
    }
    const trimmed = entry.trim();
    if (!trimmed || seen.has(trimmed)) {
      continue;
    }
    seen.add(trimmed);
    normalized.push(trimmed);
  }
  return normalized;
}

async function readAllowFromFile(filePath: string): Promise<string[]> {
  try {
    const raw = await fs.promises.readFile(filePath, "utf8");
    const parsed = JSON.parse(raw) as AllowFromStore;
    return normalizeAllowFromEntries(parsed.allowFrom);
  } catch {
    return [];
  }
}

function readAllowFromFileSync(filePath: string): string[] {
  try {
    const raw = fs.readFileSync(filePath, "utf8");
    const parsed = JSON.parse(raw) as AllowFromStore;
    return normalizeAllowFromEntries(parsed.allowFrom);
  } catch {
    return [];
  }
}

export { resolveChannelAllowFromPath };

export async function readChannelAllowFromStoreEntries(
  channel: PairingChannel,
  env: NodeJS.ProcessEnv = process.env,
  accountId?: string,
): Promise<string[]> {
  return await readAllowFromFile(resolveChannelAllowFromPath(channel, env, accountId));
}

export function readChannelAllowFromStoreEntriesSync(
  channel: PairingChannel,
  env: NodeJS.ProcessEnv = process.env,
  accountId?: string,
): string[] {
  return readAllowFromFileSync(resolveChannelAllowFromPath(channel, env, accountId));
}
