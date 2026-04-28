---
summary: "Messaging platforms Velaclaw can connect to"
read_when:
  - You want to choose a chat channel for Velaclaw
  - You need a quick overview of supported messaging platforms
title: "Chat Channels"
---

# Chat Channels

Velaclaw can talk to you on any chat app you already use. Each channel connects via the Gateway.
Text is supported everywhere; media and reactions vary by channel.

## Supported channels

- BlueBubbles — **Recommended for iMessage**; uses the BlueBubbles macOS server REST API with full feature support (bundled plugin; edit, unsend, effects, reactions, group management — edit currently broken on macOS 26 Tahoe).
- [Discord](/channels/discord) — Discord Bot API + Gateway; supports servers, channels, and DMs.
- Feishu — Feishu/Lark bot via WebSocket (bundled plugin).
- Google Chat — Google Chat API app via HTTP webhook.
- iMessage (legacy) — Legacy macOS integration via imsg CLI (deprecated, use BlueBubbles for new setups).
- IRC — Classic IRC servers; channels + DMs with pairing/allowlist controls.
- LINE — LINE Messaging API bot (bundled plugin).
- Matrix — Matrix protocol (bundled plugin).
- Mattermost — Bot API + WebSocket; channels, groups, DMs (bundled plugin).
- Microsoft Teams — Bot Framework; enterprise support (bundled plugin).
- Nextcloud Talk — Self-hosted chat via Nextcloud Talk (bundled plugin).
- Nostr — Decentralized DMs via NIP-04 (bundled plugin).
- [QQ Bot](/channels/qqbot) — QQ Bot API; private chat, group chat, and rich media (bundled plugin).
- Signal — signal-cli; privacy-focused.
- [Slack](/channels/slack) — Bolt SDK; workspace apps.
- Synology Chat — Synology NAS Chat via outgoing+incoming webhooks (bundled plugin).
- [Telegram](/channels/telegram) — Bot API via grammY; supports groups.
- [Tlon](/channels/tlon) — Urbit-based messenger (bundled plugin).
- [Twitch](/channels/twitch) — Twitch chat via IRC connection (bundled plugin).
- Voice Call — Telephony via Plivo or Twilio (plugin, installed separately).
- [WebChat](/web/webchat) — Gateway WebChat UI over WebSocket.
- [WeChat](https://www.npmjs.com/package/@tencent-weixin/velaclaw-weixin) — Tencent iLink Bot plugin via QR login; private chats only.
- [WhatsApp](/channels/whatsapp) — Most popular; uses Baileys and requires QR pairing.
- Zalo — Zalo Bot API; Vietnam's popular messenger (bundled plugin).
- Zalo Personal — Zalo personal account via QR login (bundled plugin).

## Notes

- Channels can run simultaneously; configure multiple and Velaclaw will route per chat.
- Fastest setup is usually **Telegram** (simple bot token). WhatsApp requires QR pairing and
  stores more state on disk.
- Group behavior varies by channel; see [Groups](/channels/groups).
- DM pairing and allowlists are enforced for safety; see [Security](/gateway/security).
- Troubleshooting: [Channel troubleshooting](/channels/troubleshooting).
- Model providers are documented separately; see [Model Providers](/providers/models).
