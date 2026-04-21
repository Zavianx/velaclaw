import path from "node:path";
import {
  readVelaclawControlPlaneStateSync,
  ensureVelaclawManagerConfigInitialized,
  ensureVelaclawControlPlaneStateInitialized,
  ensureVelaclawWorkspaceInitialized,
  resolveActiveVelaclawRoot,
  updateVelaclawControlPlaneState,
} from "./workspace.js";

type CommonArgs = {
  root?: string;
  json?: boolean;
};

function printResult(value: unknown, json: boolean | undefined, text: () => string) {
  if (json) {
    console.log(JSON.stringify(value, null, 2));
  } else {
    console.log(text());
  }
}

export async function velaclawInitCommand(params: CommonArgs & { target: string }) {
  const targetRoot = path.resolve(params.target);
  await ensureVelaclawWorkspaceInitialized(targetRoot);
  printResult(
    { ok: true, root: targetRoot },
    params.json,
    () => `Velaclaw workspace initialized at ${targetRoot}`,
  );
}

export async function velaclawStartCommand(params: CommonArgs & { port?: number }) {
  const root = resolveActiveVelaclawRoot(params.root);
  process.env.VELACLAW_ROOT = root;
  await ensureVelaclawWorkspaceInitialized(root);
  const controlPlaneState = await updateVelaclawControlPlaneState(root, {
    ...(params.port ? { port: params.port } : {}),
    env: process.env,
  });
  process.env.PORT = String(controlPlaneState.port);
  process.env.VELACLAW_CONTROL_PORT = String(controlPlaneState.port);
  const port = controlPlaneState.port;

  const managerBootstrap = await ensureVelaclawManagerConfigInitialized(process.env);

  const { createVelaclawApp } = await import("./server.js");
  const app = createVelaclawApp();
  app.listen(port, () => {
    console.log(`Velaclaw control plane listening on ${controlPlaneState.listenBaseUrl}`);
    console.log(`Workspace: ${root}`);
    console.log(`Member runtime base URL: ${controlPlaneState.memberBaseUrl}`);
    if (managerBootstrap.changed) {
      console.log(`Manager defaults initialized at ${managerBootstrap.configPath}`);
    }
  });
}

export async function velaclawVerifyCommand(params: CommonArgs & { baseUrl?: string }) {
  const root = resolveActiveVelaclawRoot(params.root);
  const controlPlaneState = params.baseUrl
    ? null
    : (readVelaclawControlPlaneStateSync(root) ??
      (await ensureVelaclawControlPlaneStateInitialized(root)));
  const baseUrl =
    params.baseUrl ||
    controlPlaneState?.listenBaseUrl ||
    `http://127.0.0.1:${process.env.PORT || 4318}`;
  try {
    const res = await fetch(`${baseUrl}/health`);
    const body = await res.json();
    printResult(body, params.json, () => `Health: ${JSON.stringify(body)}`);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    printResult({ ok: false, error: msg }, params.json, () => `Verify failed: ${msg}`);
    process.exit(1);
  }
}
