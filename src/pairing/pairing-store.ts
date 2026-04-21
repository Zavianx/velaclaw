import path from "node:path";
import fs from "node:fs/promises";
import { resolveStateDir } from "../config/paths.js";
import type { ChannelPairingAdapter } from "../channels/plugins/pairing.types.js";
import type { PairingChannel } from "./pairing-store.types.js";

export type PairingRequestRecord = {
  code: string;
  id: string;
  meta?: Record<string, string | undefined | null>;
  createdAt: string;
};

export function resolveChannelAllowFromPath(
  channel: string,
  env: NodeJS.ProcessEnv = process.env,
  accountId?: string,
): string {
  const suffix = accountId ? `-${accountId}` : "";
  return path.join(resolveStateDir(env), "credentials", `${channel}${suffix}-allowFrom.json`);
}

export async function readChannelAllowFromStore(
  _channel: PairingChannel,
  _env: NodeJS.ProcessEnv = process.env,
  _accountId?: string,
): Promise<string[]> {
  return [];
}

export function readChannelAllowFromStoreSync(
  _channel: PairingChannel,
  _env: NodeJS.ProcessEnv = process.env,
  _accountId?: string,
): string[] {
  return [];
}

export async function upsertChannelPairingRequest(params: {
  channel: PairingChannel;
  id: string | number;
  accountId?: string;
  meta?: Record<string, string | undefined | null>;
  env?: NodeJS.ProcessEnv;
  pairingAdapter?: ChannelPairingAdapter;
}): Promise<{ code: string; created: boolean }> {
  const seed = `${params.channel}:${params.accountId ?? "default"}:${String(params.id)}`;
  const code = seed
    .split("")
    .reduce((acc, char) => (acc * 33 + char.charCodeAt(0)) % 1_000_000, 1729)
    .toString()
    .padStart(6, "0");
  return {
    code,
    created: true,
  };
}

export async function listChannelPairingRequests(
  _channel: PairingChannel,
  _env: NodeJS.ProcessEnv = process.env,
  _accountId?: string,
): Promise<PairingRequestRecord[]> {
  return [];
}

export async function approveChannelPairingCode(_params: {
  channel: PairingChannel;
  code: string;
  accountId?: string;
  env?: NodeJS.ProcessEnv;
}): Promise<{ id: string } | null> {
  return null;
}

async function readAllowFromStoreFile(filePath: string): Promise<string[]> {
  try {
    const raw = await fs.readFile(filePath, "utf8");
    const parsed = JSON.parse(raw) as { allowFrom?: unknown };
    return Array.isArray(parsed.allowFrom)
      ? parsed.allowFrom.filter((entry): entry is string => typeof entry === "string" && entry.trim().length > 0)
      : [];
  } catch {
    return [];
  }
}

async function writeAllowFromStoreFile(filePath: string, entries: string[]): Promise<void> {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(
    filePath,
    JSON.stringify(
      {
        version: 1,
        allowFrom: [...new Set(entries.map((entry) => entry.trim()).filter(Boolean))],
      },
      null,
      2,
    ),
    "utf8",
  );
}

export async function addChannelAllowFromStoreEntry(params: {
  channel: PairingChannel;
  entry: string;
  accountId?: string;
  env?: NodeJS.ProcessEnv;
}): Promise<void> {
  const filePath = resolveChannelAllowFromPath(params.channel, params.env, params.accountId);
  const entries = await readAllowFromStoreFile(filePath);
  entries.push(params.entry);
  await writeAllowFromStoreFile(filePath, entries);
}

export async function removeChannelAllowFromStoreEntry(params: {
  channel: PairingChannel;
  entry: string;
  accountId?: string;
  env?: NodeJS.ProcessEnv;
}): Promise<void> {
  const filePath = resolveChannelAllowFromPath(params.channel, params.env, params.accountId);
  const entries = await readAllowFromStoreFile(filePath);
  await writeAllowFromStoreFile(
    filePath,
    entries.filter((entry) => entry !== params.entry),
  );
}
