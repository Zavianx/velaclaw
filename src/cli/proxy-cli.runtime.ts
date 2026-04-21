import { spawn } from "node:child_process";
import process from "node:process";
import { buildDebugProxyCoverageReport } from "../proxy-capture/coverage.js";
import { applyDebugProxyEnv } from "../proxy-capture/env.js";
import { startDebugProxyServer } from "../proxy-capture/proxy-server.js";
import {
  finalizeDebugProxyCapture,
  initializeDebugProxyCapture,
} from "../proxy-capture/runtime.js";
import { closeDebugProxyCaptureStore } from "../proxy-capture/store.sqlite.js";
import type { CaptureQueryPreset } from "../proxy-capture/types.js";

const UNAVAILABLE_MESSAGE =
  "Debug proxy capture is unavailable in this build. The feature was slimmed out of the main tree.\n";

function writeUnavailable(): void {
  process.stdout.write(UNAVAILABLE_MESSAGE);
}

export async function runDebugProxyStartCommand(opts: { host?: string; port?: number }) {
  writeUnavailable();
  initializeDebugProxyCapture("proxy-start");
  const server = await startDebugProxyServer();
  process.stdout.write(
    `Debug proxy bind requested: host=${opts.host ?? ""} port=${opts.port ?? ""}\n`,
  );
  const shutdown = async () => {
    process.off("SIGINT", onSignal);
    process.off("SIGTERM", onSignal);
    await server.close();
    finalizeDebugProxyCapture();
    void closeDebugProxyCaptureStore();
    process.exit(0);
  };
  const onSignal = () => {
    void shutdown();
  };
  process.on("SIGINT", onSignal);
  process.on("SIGTERM", onSignal);
  await new Promise(() => undefined);
}

export async function runDebugProxyRunCommand(opts: {
  host?: string;
  port?: number;
  commandArgs: string[];
}) {
  if (opts.commandArgs.length === 0) {
    throw new Error("proxy run requires a command after --");
  }
  writeUnavailable();
  const server = await startDebugProxyServer();
  const [command, ...args] = opts.commandArgs;
  const childEnv = applyDebugProxyEnv(process.env);
  try {
    await new Promise<void>((resolve, reject) => {
      const child = spawn(command ?? "", args, {
        stdio: "inherit",
        env: childEnv,
        cwd: process.cwd(),
      });
      child.once("error", reject);
      child.once("exit", (code, signal) => {
        process.exitCode = signal ? 1 : (code ?? 1);
        resolve();
      });
    });
  } finally {
    await server.close();
    void closeDebugProxyCaptureStore();
  }
}

export async function runDebugProxySessionsCommand(_opts: { limit?: number }) {
  writeUnavailable();
  process.stdout.write(`${JSON.stringify([], null, 2)}\n`);
  void closeDebugProxyCaptureStore();
}

export async function runDebugProxyQueryCommand(_opts: {
  preset: CaptureQueryPreset;
  sessionId?: string;
}) {
  writeUnavailable();
  process.stdout.write(`${JSON.stringify([], null, 2)}\n`);
  void closeDebugProxyCaptureStore();
}

export async function runDebugProxyCoverageCommand() {
  process.stdout.write(`${JSON.stringify(buildDebugProxyCoverageReport(), null, 2)}\n`);
  void closeDebugProxyCaptureStore();
}

export async function runDebugProxyPurgeCommand() {
  writeUnavailable();
  process.stdout.write(`${JSON.stringify({ ok: true, removed: 0 }, null, 2)}\n`);
  void closeDebugProxyCaptureStore();
}

export async function readDebugProxyBlobCommand(opts: { blobId: string }) {
  writeUnavailable();
  void closeDebugProxyCaptureStore();
  throw new Error(`Unknown blob: ${opts.blobId}`);
}
