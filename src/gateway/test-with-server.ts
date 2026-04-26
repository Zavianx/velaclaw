import { afterAll, beforeAll, beforeEach } from "vitest";
import type { WebSocket } from "ws";
import { connectOk, startServerWithClient, testState } from "./test-helpers.js";

type GatewayServerHandle = {
  close: () => Promise<void> | void;
};
type GatewayEnvSnapshot = {
  restore: () => void;
};
type StartedServerWithClient = {
  server: GatewayServerHandle;
  ws: WebSocket;
  port: number;
  envSnapshot: GatewayEnvSnapshot;
};

export type GatewayWs = StartedServerWithClient["ws"];
export type GatewayServer = StartedServerWithClient["server"];

export async function withServer<T>(run: (ws: GatewayWs) => Promise<T>): Promise<T> {
  const { server, ws, envSnapshot } = await startServerWithClient("secret");
  try {
    return await run(ws);
  } finally {
    ws.close();
    await server.close();
    envSnapshot.restore();
  }
}

export function installConnectedControlUiServerSuite(
  onReady: (started: { server: GatewayServer; ws: GatewayWs; port: number }) => void,
): void {
  let started: StartedServerWithClient | null = null;
  const token = "secret";

  beforeAll(async () => {
    const next: StartedServerWithClient = await startServerWithClient(token, {
      controlUiEnabled: true,
    });
    started = next;
    onReady({
      server: next.server,
      ws: next.ws,
      port: next.port,
    });
    await connectOk(next.ws);
  });

  beforeEach(() => {
    process.env.VELACLAW_GATEWAY_TOKEN = token;
    testState.gatewayAuth = { mode: "token", token };
  });

  afterAll(async () => {
    started?.ws.close();
    if (started?.server) {
      await started.server.close();
    }
    started?.envSnapshot.restore();
  });
}
