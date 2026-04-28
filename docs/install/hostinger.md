---
summary: "Host Velaclaw on Hostinger"
read_when:
  - Setting up Velaclaw on Hostinger
  - Looking for a managed VPS for Velaclaw
  - Using Hostinger 1-Click Velaclaw
title: "Hostinger"
---

# Hostinger

Run a persistent Velaclaw Gateway on [Hostinger](https://www.hostinger.com/velaclaw) via a **1-Click** managed deployment or a **VPS** install.

## Prerequisites

- Hostinger account ([signup](https://www.hostinger.com/velaclaw))
- About 5-10 minutes

## Option A: 1-Click Velaclaw

The fastest way to get started. Hostinger handles infrastructure, Docker, and automatic updates.

<Steps>
  <Step title="Purchase and launch">
    1. From the [Hostinger Velaclaw page](https://www.hostinger.com/velaclaw), choose a Managed Velaclaw plan and complete checkout.

    <Note>
    During checkout you can select **Ready-to-Use AI** credits that are pre-purchased and integrated instantly inside Velaclaw -- no external accounts or API keys from other providers needed. You can start chatting right away. Alternatively, provide your own key from Anthropic, OpenAI, Google Gemini, or xAI during setup.

    </Note>

  </Step>

  <Step title="Select a messaging channel">
    Choose one or more channels to connect:

    - **WhatsApp** -- scan the QR code shown in the setup wizard.
    - **Telegram** -- paste the bot token from [BotFather](https://t.me/BotFather).

  </Step>

  <Step title="Complete installation">
    Click **Finish** to deploy the instance. Once ready, access the Velaclaw dashboard from **Velaclaw Overview** in hPanel.

  </Step>

</Steps>

## Option B: Velaclaw on VPS

More control over your server. Hostinger deploys Velaclaw via Docker on your VPS and you manage it through the **Docker Manager** in hPanel.

<Steps>
  <Step title="Purchase a VPS">
    1. From the [Hostinger Velaclaw page](https://www.hostinger.com/velaclaw), choose an Velaclaw on VPS plan and complete checkout.

    <Note>
    You can select **Ready-to-Use AI** credits during checkout -- these are pre-purchased and integrated instantly inside Velaclaw, so you can start chatting without any external accounts or API keys from other providers.

    </Note>

  </Step>

  <Step title="Configure Velaclaw">
    Once the VPS is provisioned, fill in the configuration fields:

    - **Gateway token** -- auto-generated; save it for later use.
    - **WhatsApp number** -- your number with country code (optional).
    - **Telegram bot token** -- from [BotFather](https://t.me/BotFather) (optional).
    - **API keys** -- only needed if you did not select Ready-to-Use AI credits during checkout.

  </Step>

  <Step title="Start Velaclaw">
    Click **Deploy**. Once running, open the Velaclaw dashboard from the hPanel by clicking on **Open**.

  </Step>

</Steps>

Logs, restarts, and updates are managed directly from the Docker Manager interface in hPanel. To update, press on **Update** in Docker Manager and that will pull the latest image.

## Verify your setup

Send "Hi" to your assistant on the channel you connected. Velaclaw will reply and walk you through initial preferences.

## Troubleshooting

**Dashboard not loading** -- Wait a few minutes for the container to finish provisioning. Check the Docker Manager logs in hPanel.

**Docker container keeps restarting** -- Open Docker Manager logs and look for configuration errors (missing tokens, invalid API keys).

**Telegram bot not responding** -- Send your pairing code message from Telegram directly as a message inside your Velaclaw chat to complete the connection.

## Next steps

- [Channels](/channels) -- connect Telegram, WhatsApp, Discord, and more
- [Gateway configuration](/gateway/configuration) -- all config optionss
