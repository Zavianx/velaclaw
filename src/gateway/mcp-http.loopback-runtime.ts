export type McpLoopbackRuntime = {
  port: number;
  token: string;
};

let activeRuntime: McpLoopbackRuntime | undefined;

export function getActiveMcpLoopbackRuntime(): McpLoopbackRuntime | undefined {
  return activeRuntime ? { ...activeRuntime } : undefined;
}

export function setActiveMcpLoopbackRuntime(runtime: McpLoopbackRuntime): void {
  activeRuntime = { ...runtime };
}

export function clearActiveMcpLoopbackRuntime(token: string): void {
  if (activeRuntime?.token === token) {
    activeRuntime = undefined;
  }
}

export function createMcpLoopbackServerConfig(port: number) {
  return {
    mcpServers: {
      velaclaw: {
        type: "http",
        url: `http://127.0.0.1:${port}/mcp`,
        headers: {
          Authorization: "Bearer ${VELACLAW_MCP_TOKEN}",
          "x-session-key": "${VELACLAW_MCP_SESSION_KEY}",
          "x-velaclaw-agent-id": "${VELACLAW_MCP_AGENT_ID}",
          "x-velaclaw-account-id": "${VELACLAW_MCP_ACCOUNT_ID}",
          "x-velaclaw-message-channel": "${VELACLAW_MCP_MESSAGE_CHANNEL}",
          "x-velaclaw-sender-is-owner": "${VELACLAW_MCP_SENDER_IS_OWNER}",
        },
      },
    },
  };
}
