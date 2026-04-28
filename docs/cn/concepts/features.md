---
summary: "Velaclaw 在通道、路由、媒体和交互层面的能力清单。"
read_when:
  - 想看一份 Velaclaw 支持范围的完整列表
title: "功能清单"
---

# 功能清单

## 重点

<Columns>
  <Card title="通道" icon="message-square">
    一个网关同时打通 Discord、iMessage、Signal、Slack、Telegram、WhatsApp、WebChat 等。

  </Card>
  <Card title="插件" icon="plug">
    自带的插件加上 Matrix、Nextcloud Talk、Nostr、Twitch、Zalo 等，常规版本里不需要单独安装。

  </Card>
  <Card title="路由" icon="route">
    多 agent 路由，会话彼此隔离。

  </Card>
  <Card title="媒体" icon="image">
    图片、音频、视频、文档，以及图片和视频生成。

  </Card>
  <Card title="应用与界面" icon="monitor">
    Web Control UI 和 macOS 伴侣应用。

  </Card>
  <Card title="移动节点" icon="smartphone">
    iOS 和 Android 节点，支持配对、语音 / 对话和丰富的设备指令。

  </Card>
</Columns>

## 完整列表

**通道：**

- 内置通道包括 Discord、Google Chat、iMessage（旧版）、IRC、Signal、Slack、Telegram、WebChat、WhatsApp
- 自带插件通道包括 BlueBubbles（用于 iMessage）、飞书、LINE、Matrix、Mattermost、Microsoft Teams、Nextcloud Talk、Nostr、QQ Bot、Synology Chat、Tlon、Twitch、Zalo、Zalo Personal
- 可选的、单独安装的通道插件包括 Voice Call，以及微信这类第三方包
- 第三方通道插件可以进一步扩展网关，比如微信
- 群聊支持，靠 @ 提及来激活
- 私聊安全：白名单 + 配对

**Agent：**

- 内嵌的 agent 运行时，工具调用支持流式输出
- 多 agent 路由，按 workspace 或发送方隔离会话
- 会话：私聊汇成共享的 `main`；群聊各自隔离
- 长回复支持流式和分段

**认证与供应商：**

- 35+ 模型供应商（Anthropic、OpenAI、Google 等）
- 通过 OAuth 用订阅账号认证（比如 OpenAI Codex）
- 支持自定义和自托管供应商（vLLM、SGLang、Ollama，以及任何 OpenAI 兼容或 Anthropic 兼容端点）

**媒体：**

- 图片、音频、视频和文档的双向收发
- 共享的图片生成和视频生成能力面
- 语音消息转写
- 多供应商的语音合成（TTS）

**应用与界面：**

- WebChat 和浏览器版 Control UI
- macOS 菜单栏伴侣应用
- iOS 节点：配对、Canvas、相机、屏幕录制、定位、语音
- Android 节点：配对、对话、语音、Canvas、相机、设备指令

**工具与自动化：**

- 浏览器自动化、exec、沙箱
- 网页搜索（Brave、DuckDuckGo、Exa、Firecrawl、Gemini、Grok、Kimi、MiniMax Search、Ollama Web Search、Perplexity、SearXNG、Tavily）
- 定时任务和心跳调度
- 技能、插件，以及工作流流水线（Lobster）
