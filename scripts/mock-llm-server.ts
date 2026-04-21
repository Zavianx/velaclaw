/**
 * Mock LLM Server — 模拟 manager 的 LLM/LiteLLM 服务
 *
 * 兼容 OpenAI Chat Completions API
 * 对进化引擎的 prompt 返回结构化的 [MEMORY]/[SKILL] 资产
 */

import http from "node:http";

const PORT = Number(process.env.MOCK_LLM_PORT || 4000);
let requestCount = 0;
const requestLog: { ts: string; model: string; messages: number; firstUserSnippet: string }[] = [];

const server = http.createServer(async (req, res) => {
  // CORS / health
  res.setHeader("Access-Control-Allow-Origin", "*");

  if (req.url === "/health" || req.url === "/healthz") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ ok: true, service: "mock-llm", requestsServed: requestCount }));
    return;
  }

  if (req.url === "/_log") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ ok: true, requests: requestLog.slice(-20) }));
    return;
  }

  if (req.url === "/v1/models") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(
      JSON.stringify({
        object: "list",
        data: [
          { id: "gpt-4o", object: "model", owned_by: "mock" },
          { id: "gpt-4.1", object: "model", owned_by: "mock" },
        ],
      }),
    );
    return;
  }

  // Chat completions
  if (
    req.method === "POST" &&
    (req.url === "/v1/chat/completions" || req.url === "/chat/completions")
  ) {
    let body = "";
    for await (const chunk of req) {
      body += chunk;
    }

    try {
      const payload = JSON.parse(body);
      const messages = payload.messages || [];
      const lastUser =
        messages.findLast?.((m: { role?: string }) => m.role === "user")?.content || "";
      const userText = String(lastUser);

      requestCount++;
      requestLog.push({
        ts: new Date().toISOString(),
        model: payload.model || "?",
        messages: messages.length,
        firstUserSnippet: userText.slice(0, 80),
      });

      // 检测是否是进化引擎的 prompt
      const isEvolution =
        userText.includes("Session topics") ||
        userText.includes("会话主题") ||
        userText.includes("Stats:") ||
        userText.includes("Already generated");

      let responseContent = "";

      if (isEvolution) {
        // 返回结构化的进化资产（基于会话主题生成）
        const topics: string[] = [];
        const m = userText.match(/Session topics.*?:\s*\n([\s\S]*?)(?:\n\nSummaries|\n\nStats|$)/);
        if (m) {
          for (const line of m[1].split("\n")) {
            const t = line.replace(/^-\s*/, "").trim();
            if (t) {
              topics.push(t);
            }
          }
        }

        if (topics.length === 0) {
          responseContent = "[NONE]";
        } else {
          // 为每个主题生成一个 MEMORY 或 SKILL
          const items: string[] = [];
          for (let i = 0; i < Math.min(topics.length, 3); i++) {
            const topic = topics[i];
            const isSkill = i % 2 === 0;
            const type = isSkill ? "SKILL" : "MEMORY";
            const title = `${topic}（团队总结）`;
            const content = isSkill
              ? `# ${title}\n\n基于团队反复讨论，沉淀的可复用方法：\n1. 准备阶段 — 明确目标和约束\n2. 执行阶段 — 按步骤推进，保留可观测点\n3. 复盘阶段 — 记录经验和踩坑`
              : `# ${title}\n\n这是团队最近高频出现的话题。建议成员遇到相关问题时优先参考已有经验，避免重复踩坑。`;
            items.push(`[${type}]\n${title}\n${content}`);
          }
          responseContent = items.join("\n---\n");
        }
      } else {
        // 普通对话回复
        responseContent = "Hello from mock LLM. I received your message.";
      }

      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(
        JSON.stringify({
          id: `chatcmpl-mock-${Date.now()}`,
          object: "chat.completion",
          created: Math.floor(Date.now() / 1000),
          model: payload.model || "gpt-4o",
          choices: [
            {
              index: 0,
              message: { role: "assistant", content: responseContent },
              finish_reason: "stop",
            },
          ],
          usage: {
            prompt_tokens: Math.ceil(body.length / 4),
            completion_tokens: Math.ceil(responseContent.length / 4),
            total_tokens: Math.ceil((body.length + responseContent.length) / 4),
          },
        }),
      );
    } catch (err) {
      res.writeHead(400, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: err instanceof Error ? err.message : "bad request" }));
    }
    return;
  }

  res.writeHead(404, { "Content-Type": "application/json" });
  res.end(JSON.stringify({ error: `not found: ${req.url}` }));
});

server.listen(PORT, "0.0.0.0", () => {
  console.log(`[mock-llm] listening on 0.0.0.0:${PORT}`);
  console.log(`[mock-llm] OpenAI-compatible: POST http://127.0.0.1:${PORT}/v1/chat/completions`);
});
