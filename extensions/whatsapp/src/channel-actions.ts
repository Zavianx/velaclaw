import {
  listWhatsAppAccountIds,
  resolveWhatsAppAccount,
  createActionGate,
  type ChannelMessageActionName,
  type VelaclawConfig,
  resolveWhatsAppReactionLevel,
} from "./channel-actions.runtime.js";

function areWhatsAppAgentReactionsEnabled(params: { cfg: VelaclawConfig; accountId?: string }) {
  if (!params.cfg.channels?.whatsapp) {
    return false;
  }
  const gate = createActionGate(params.cfg.channels.whatsapp.actions);
  if (!gate("reactions")) {
    return false;
  }
  return resolveWhatsAppReactionLevel({
    cfg: params.cfg,
    accountId: params.accountId,
  }).agentReactionsEnabled;
}

function hasAnyWhatsAppAccountWithAgentReactionsEnabled(cfg: VelaclawConfig) {
  if (!cfg.channels?.whatsapp) {
    return false;
  }
  return listWhatsAppAccountIds(cfg).some((accountId) => {
    const account = resolveWhatsAppAccount({ cfg, accountId });
    if (!account.enabled) {
      return false;
    }
    return areWhatsAppAgentReactionsEnabled({
      cfg,
      accountId,
    });
  });
}

export function resolveWhatsAppAgentReactionGuidance(params: {
  cfg: VelaclawConfig;
  accountId?: string;
}) {
  if (!params.cfg.channels?.whatsapp) {
    return undefined;
  }
  const gate = createActionGate(params.cfg.channels.whatsapp.actions);
  if (!gate("reactions")) {
    return undefined;
  }
  const resolved = resolveWhatsAppReactionLevel({
    cfg: params.cfg,
    accountId: params.accountId,
  });
  if (!resolved.agentReactionsEnabled) {
    return undefined;
  }
  return resolved.agentReactionGuidance;
}

export function describeWhatsAppMessageActions(params: {
  cfg: VelaclawConfig;
  accountId?: string | null;
}): { actions: ChannelMessageActionName[] } | null {
  if (!params.cfg.channels?.whatsapp) {
    return null;
  }
  const gate = createActionGate(params.cfg.channels.whatsapp.actions);
  const actions = new Set<ChannelMessageActionName>();
  const canReact =
    params.accountId != null
      ? areWhatsAppAgentReactionsEnabled({
          cfg: params.cfg,
          accountId: params.accountId ?? undefined,
        })
      : hasAnyWhatsAppAccountWithAgentReactionsEnabled(params.cfg);
  if (canReact) {
    actions.add("react");
  }
  if (gate("polls")) {
    actions.add("poll");
  }
  return { actions: Array.from(actions) };
}
