import type { IncomingMessage, ServerResponse } from "node:http";
import type { Duplex } from "node:stream";

export type CanvasHostHandler = {
  handle?: () => Promise<void> | void;
  rootDir?: string;
  basePath?: string;
  close?: () => Promise<void> | void;
  handleHttpRequest?: (req: IncomingMessage, res: ServerResponse) => Promise<boolean> | boolean;
  handleUpgrade?: (
    req: IncomingMessage,
    socket: Duplex,
    head: Buffer,
  ) => Promise<boolean> | boolean;
};

export type CanvasHostServer = {
  close?: () => Promise<void> | void;
  port?: number | null;
};

export async function createCanvasHostHandler(
  _options?: Record<string, unknown>,
): Promise<CanvasHostHandler> {
  return {
    handle: async () => {},
  };
}
