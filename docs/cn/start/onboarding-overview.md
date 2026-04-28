---
summary: "Velaclaw 引导路径与流程一览"
read_when:
  - 在挑选引导路径
  - 准备配置一个新环境
title: "引导总览"
sidebarTitle: "引导总览"
---

# 引导总览

Velaclaw 有两条引导路径。两条都会配好认证、网关和可选的聊天通道——
区别只在于你怎么跟设置过程交互。

## 该走哪条路径？

|              | CLI 引导                            | macOS 应用引导           |
| ------------ | ----------------------------------- | ------------------------ |
| **平台**     | macOS、Linux、Windows（原生或 WSL2) | 仅 macOS                 |
| **界面**     | 终端向导                            | 应用内的图形向导         |
| **适合谁**   | 服务器、无头环境、想要完全控制      | 桌面 Mac，喜欢可视化设置 |
| **自动化**   | 脚本里用 `--non-interactive`        | 只能手动                 |
| **入口命令** | `velaclaw onboard`                  | 启动应用                 |

大多数人应该从 **CLI 引导**开始——它哪里都能跑，控制力也最强。

## 引导会配置哪些东西

不管走哪条路径，引导都会配置：

1. **模型供应商和认证**——你选的供应商对应的 API key、OAuth 或 setup token
2. **Workspace**——存放 agent 文件、bootstrap 模板和记忆的目录
3. **网关**——端口、绑定地址、认证模式
4. **通道**（可选）——内置和自带的聊天通道，比如 BlueBubbles、Discord、飞书、Google Chat、
   Mattermost、Microsoft Teams、Telegram、WhatsApp 等
5. **守护进程**（可选）——后台服务，让网关开机自动跑

## CLI 引导

任意终端里跑：

```bash
velaclaw onboard
```

加 `--install-daemon` 顺手把后台服务也装上。

完整参考：[引导（CLI）](/cn/start/wizard)
CLI 命令文档：[`velaclaw onboard`](/cli/onboard)

## macOS 应用引导

打开 Velaclaw 应用，首次启动的向导会用图形界面带你走完同样的步骤。

完整参考：[引导（macOS 应用）](/start/onboarding)

## 自定义或未列出的供应商

如果你的供应商不在引导列表里，选 **Custom Provider** 然后填：

- API 兼容模式（OpenAI 兼容、Anthropic 兼容，或自动探测）
- Base URL 和 API key
- 模型 ID 和可选的别名

可以同时配多个自定义端点——每个会拿到自己的 endpoint ID。
