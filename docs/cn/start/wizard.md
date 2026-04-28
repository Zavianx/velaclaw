---
summary: "CLI 引导：用一条命令配好网关、workspace、通道和技能"
read_when:
  - 准备运行或调整 CLI 引导
  - 在新机器上做一次完整设置
title: "引导（CLI）"
sidebarTitle: "引导：CLI"
---

# 引导（CLI）

CLI 引导是在 macOS、Linux 或 Windows（推荐通过 WSL2）上设置 Velaclaw 的**推荐方式**。
一条命令把本地网关或远程网关连接、通道、技能和 workspace 默认值全部配好。

```bash
velaclaw onboard
```

<Info>
最快聊上第一句：直接打开 Control UI（不需要配通道）。运行
`velaclaw dashboard`，然后在浏览器里聊。文档：[控制面板](/web/dashboard)。
</Info>

之后想重新配置：

```bash
velaclaw configure
velaclaw agents add <name>
```

<Note>
`--json` 不等于非交互模式。脚本里要用 `--non-interactive`。
</Note>

<Tip>
CLI 引导里有一步是网页搜索，可以选择 Brave、DuckDuckGo、Exa、Firecrawl、Gemini、Grok、Kimi、
MiniMax Search、Ollama Web Search、Perplexity、SearXNG 或 Tavily。一部分供应商需要 API key，
其他可以免 key。这一步之后也能用 `velaclaw configure --section web` 重新配。文档：[网页工具](/tools/web)。
</Tip>

## QuickStart 还是 Advanced

引导一上来会让你选 **QuickStart**（默认值）或 **Advanced**（完全控制）。

<Tabs>
  <Tab title="QuickStart（默认值）">
    - 本地网关（loopback）
    - 默认 workspace（或已有的 workspace）
    - 网关端口 **18789**
    - 网关认证 **Token**（自动生成，loopback 也会生成）
    - 新本地环境的工具策略默认值：`tools.profile: "coding"`（已有的显式 profile 不会被覆盖）
    - DM 隔离默认值：未设置时，本地引导会写入 `session.dmScope: "per-channel-peer"`。详情见 [CLI 设置参考](/start/wizard-cli-reference#outputs-and-internals)
    - Tailscale 暴露 **关闭**
    - Telegram + WhatsApp 私聊默认走 **白名单**（会让你输入手机号）

  </Tab>
  <Tab title="Advanced（完全控制）">
    - 把每一步都展开：模式、workspace、网关、通道、守护进程、技能。

  </Tab>
</Tabs>

## 引导会配置哪些东西

**本地模式（默认）** 会带你过下面这些步骤：

1. **模型 / 认证**——从所有支持的供应商和认证方式里挑一种（API key、OAuth，或某个供应商专属的手动认证），
   也包括自定义供应商（OpenAI 兼容、Anthropic 兼容，或 Unknown 自动探测）。挑一个默认模型。
   安全提示：如果这个 agent 会调用工具或处理 webhook / hooks 内容，尽量选最新一代里最强的模型，
   并把工具策略保持严格。能力较弱或较老的型号更容易被 prompt 注入。
   非交互运行时，`--secret-input-mode ref` 会把以环境变量为后端的引用写进认证档案，而不是明文 API key。
   非交互 `ref` 模式下，必须先设好对应的供应商环境变量；只传命令行 key 而没设环境变量会立即失败。
   交互模式下，选 secret 引用模式可以指向一个环境变量、或一个已经配好的供应商引用（`file` 或 `exec`），
   保存前会做一次快速预检。
   对于 Anthropic，交互式引导和 configure 推荐 **Anthropic Claude CLI** 作为本地路径、
   **Anthropic API key** 作为生产路径。Anthropic setup-token 也仍然作为一种 token 认证方式保留。
2. **Workspace**——agent 文件存放位置（默认 `~/.velaclaw/workspace`），并写入引导用的 bootstrap 文件。
3. **网关**——端口、绑定地址、认证模式、Tailscale 暴露。
   交互式 token 模式下，可以选默认的明文 token 存储，或转成 SecretRef。
   非交互 token SecretRef：`--gateway-token-ref-env <ENV_VAR>`。
4. **通道**——内置和自带的聊天通道，比如 BlueBubbles、Discord、飞书、Google Chat、Mattermost、
   Microsoft Teams、QQ Bot、Signal、Slack、Telegram、WhatsApp 等。
5. **守护进程**——安装 LaunchAgent（macOS）、systemd 用户单元（Linux/WSL2）、
   或原生 Windows 计划任务（带 per-user 启动文件夹兜底）。
   如果 token 认证需要 token、且 `gateway.auth.token` 由 SecretRef 管理，守护进程安装会校验它，
   但不会把解析后的 token 落到 supervisor service 的环境元数据里。
   如果 token 认证需要 token，但配置里的 token SecretRef 还没解析出来，守护进程安装会被拦下并给出可执行的提示。
   如果 `gateway.auth.token` 和 `gateway.auth.password` 都配了、且 `gateway.auth.mode` 没设，
   守护进程安装会被拦下，直到显式设置 mode。
6. **健康检查**——启动网关并确认在跑。
7. **技能**——安装推荐的技能和可选依赖。

<Note>
重新跑引导**不会**清掉任何东西，除非你显式选 **Reset**（或加 `--reset`）。
CLI `--reset` 默认重置 config、credentials 和 sessions；用 `--reset-scope full` 才会包含 workspace。
如果配置无效或包含老 key，引导会让你先跑 `velaclaw doctor`。
</Note>

**远程模式**只在本地客户端里配置一个连到别处网关的连接。
它**不会**在远端主机上安装或修改任何东西。

## 加一个 agent

用 `velaclaw agents add <name>` 创建一个独立 agent，它有自己的 workspace、会话和认证档案。
不带 `--workspace` 直接跑会进入引导。

它会设置：

- `agents.list[].name`
- `agents.list[].workspace`
- `agents.list[].agentDir`

提示：

- 默认 workspace 走 `~/.velaclaw/workspace-<agentId>` 这个路径。
- 加 `bindings` 把入站消息路由过去（引导可以代你做）。
- 非交互参数：`--model`、`--agent-dir`、`--bind`、`--non-interactive`。

## 完整参考

更细的逐步拆解和配置输出见 [CLI 设置参考](/start/wizard-cli-reference)。
非交互的例子见 [CLI 自动化](/start/wizard-cli-automation)。
更深的技术参考（包括 RPC 细节）见 [引导参考](/reference/wizard)。

## 相关文档

- CLI 命令参考：[`velaclaw onboard`](/cli/onboard)
- 引导总览：[引导总览](/cn/start/onboarding-overview)
- macOS 应用引导：[引导](/start/onboarding)
- Agent 首次运行的初始化：[Agent Bootstrapping](/start/bootstrapping)
