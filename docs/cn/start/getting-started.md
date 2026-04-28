---
summary: "几分钟装好 Velaclaw 并跑通第一次对话。"
read_when:
  - 第一次从零安装
  - 想用最快的路径打通对话
title: "开始使用"
---

# 开始使用

安装 Velaclaw、跑一遍引导、和你的 AI 助手对话——总共大概五分钟。
完成后你会有一个跑着的网关、配好的认证，以及一个能用的对话会话。

## 你需要准备

- **Node.js**——推荐 Node 24（Node 22.14+ 也可以)
- **一个模型供应商的 API key**（Anthropic、OpenAI、Google 等等）——引导过程会提示你

<Tip>
用 `node --version` 确认 Node 版本。
**Windows 用户：** 原生 Windows 和 WSL2 都支持。WSL2 更稳定，推荐使用。
参考 [Windows](/platforms/windows)。需要装 Node？参考 [Node 安装](/install/node)。
</Tip>

## 快速安装

<Steps>
  <Step title="安装 Velaclaw">
    <Tabs>
      <Tab title="macOS / Linux">
        ```bash
        curl -fsSL https://velaclaw.ai/install.sh | bash
        ```
        <img
  src="/assets/install-script.svg"
  alt="Install Script Process"
  className="rounded-lg"
/>

      </Tab>
      <Tab title="Windows (PowerShell)">
        ```powershell
        iwr -useb https://velaclaw.ai/install.ps1 | iex
        ```

      </Tab>

    </Tabs>

    <Note>
    其他安装方式（Docker、Nix、npm）：[安装](/install)。

    </Note>

  </Step>
  <Step title="跑一遍引导">
    ```bash
    velaclaw onboard --install-daemon
    ```

    向导会带你选模型供应商、设置 API key、配置网关，大约两分钟。

    完整说明见 [引导（CLI）](/cn/start/wizard)。

  </Step>
  <Step title="确认网关在跑">
    ```bash
    velaclaw gateway status
    ```

    应该能看到网关在 18789 端口监听。

  </Step>
  <Step title="打开控制面板">
    ```bash
    velaclaw dashboard
    ```

    这会在浏览器打开 Control UI。能加载出来就说明都正常。

  </Step>
  <Step title="发出第一条消息">
    在 Control UI 的对话框里输入一条消息，应该会收到 AI 的回复。

    想从手机里聊？最快搭起来的通道是 [Telegram](/channels/telegram)（一个 bot token 就够）。
    所有可选项见 [通道](/channels)。

  </Step>
</Steps>

<Accordion title="进阶：挂载自定义的 Control UI 构建产物">
  如果你维护着本地化或定制版的面板构建，把
  `gateway.controlUi.root` 指到一个包含构建好的静态资源和 `index.html` 的目录。

```bash
mkdir -p "$HOME/.velaclaw/control-ui-custom"
# 把构建好的静态文件复制到这个目录
```

然后设置：

```json
{
  "gateway": {
    "controlUi": {
      "enabled": true,
      "root": "$HOME/.velaclaw/control-ui-custom"
    }
  }
}
```

重启网关并重新打开面板：

```bash
velaclaw gateway restart
velaclaw dashboard
```

</Accordion>

## 接下来可以做什么

<Columns>
  <Card title="接入一个通道" href="/channels" icon="message-square">
    Discord、飞书、iMessage、Matrix、Microsoft Teams、Signal、Slack、Telegram、WhatsApp、Zalo 等等。

  </Card>
  <Card title="配对与安全" href="/channels/pairing" icon="shield">
    控制谁能给你的 agent 发消息。

  </Card>
  <Card title="配置网关" href="/gateway/configuration" icon="settings">
    模型、工具、沙箱以及进阶设置。

  </Card>
  <Card title="浏览工具" href="/tools" icon="wrench">
    浏览器、exec、网页搜索、技能和插件。

  </Card>
</Columns>

<Accordion title="进阶：环境变量">
  如果你以服务账号身份运行 Velaclaw 或者想用自定义路径：

- `VELACLAW_HOME`——内部路径解析使用的主目录
- `VELACLAW_STATE_DIR`——覆盖状态目录
- `VELACLAW_CONFIG_PATH`——覆盖配置文件路径

完整参考：[环境变量](/help/environment)。
</Accordion>
