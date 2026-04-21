import { resolveGatewayPort } from "../config/paths.js";
import type { VelaclawConfig } from "../config/types.velaclaw.js";
import { issueDeviceBootstrapToken } from "../infra/device-bootstrap.js";
import { PAIRING_SETUP_BOOTSTRAP_PROFILE } from "../shared/device-bootstrap-profile.js";
import { resolveGatewayBindUrl } from "../shared/gateway-bind-url.js";

export type PairingSetupPayload = {
  url: string;
  bootstrapToken: string;
};

export type PairingSetupCommandResult = {
  code: number | null;
  stdout: string;
  stderr?: string;
};

export type PairingSetupCommandRunner = (
  argv: string[],
  opts: { timeoutMs: number },
) => Promise<PairingSetupCommandResult>;

export type ResolvePairingSetupOptions = {
  env?: NodeJS.ProcessEnv;
  publicUrl?: string;
  preferRemoteUrl?: boolean;
  forceSecure?: boolean;
  pairingBaseDir?: string;
  runCommandWithTimeout?: PairingSetupCommandRunner;
};

export type PairingSetupResolution =
  | {
      ok: true;
      payload: PairingSetupPayload;
      authLabel: "token" | "password";
      urlSource: string;
    }
  | {
      ok: false;
      error: string;
    };

function normalizeGatewayUrl(raw: string | undefined, forceSecure = false): string | null {
  const trimmed = raw?.trim();
  if (!trimmed) {
    return null;
  }

  try {
    const parsed = new URL(trimmed);
    const protocol = forceSecure
      ? "wss:"
      : parsed.protocol === "https:"
        ? "wss:"
        : parsed.protocol === "http:"
          ? "ws:"
          : parsed.protocol;
    if (protocol !== "ws:" && protocol !== "wss:") {
      return null;
    }
    if (!parsed.hostname) {
      return null;
    }
    return `${protocol}//${parsed.hostname}${parsed.port ? `:${parsed.port}` : ""}`;
  } catch {
    return null;
  }
}

function resolveAuthLabel(
  cfg: VelaclawConfig,
  env: NodeJS.ProcessEnv,
): "token" | "password" | null {
  const envToken = env.VELACLAW_GATEWAY_TOKEN?.trim();
  const envPassword = env.VELACLAW_GATEWAY_PASSWORD?.trim();
  const token = typeof cfg.gateway?.auth?.token === "string" ? cfg.gateway.auth.token.trim() : "";
  const password =
    typeof cfg.gateway?.auth?.password === "string" ? cfg.gateway.auth.password.trim() : "";
  if (envToken || token) {
    return "token";
  }
  if (envPassword || password) {
    return "password";
  }
  return null;
}

function resolveGatewayUrl(
  cfg: VelaclawConfig,
  options: ResolvePairingSetupOptions,
): {
  url?: string;
  source?: string;
  error?: string;
} {
  const explicitPublicUrl = normalizeGatewayUrl(options.publicUrl, options.forceSecure === true);
  if (explicitPublicUrl) {
    return { url: explicitPublicUrl, source: "publicUrl" };
  }

  if (options.preferRemoteUrl) {
    const remoteUrl = normalizeGatewayUrl(
      typeof cfg.gateway?.remote?.url === "string" ? cfg.gateway.remote.url : undefined,
      options.forceSecure === true,
    );
    if (remoteUrl) {
      return { url: remoteUrl, source: "gateway.remote.url" };
    }
  }

  const scheme = options.forceSecure === true || cfg.gateway?.tls?.enabled === true ? "wss" : "ws";
  const bindUrl = resolveGatewayBindUrl({
    bind: cfg.gateway?.bind,
    customBindHost: cfg.gateway?.customBindHost,
    scheme,
    port: resolveGatewayPort(cfg, options.env),
    pickTailnetHost: () => null,
    pickLanHost: () => "127.0.0.1",
  });
  if (bindUrl && "url" in bindUrl && bindUrl.url) {
    return { url: bindUrl.url, source: bindUrl.source };
  }
  if (bindUrl && "error" in bindUrl && bindUrl.error) {
    return { error: bindUrl.error };
  }
  return {
    error:
      "Gateway is only bound to loopback. Set gateway.bind=lan or provide an explicit publicUrl.",
  };
}

export function encodePairingSetupCode(payload: PairingSetupPayload): string {
  const json = JSON.stringify(payload);
  const base64 = Buffer.from(json, "utf8").toString("base64");
  return base64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

export async function resolvePairingSetupFromConfig(
  cfg: VelaclawConfig,
  options: ResolvePairingSetupOptions = {},
): Promise<PairingSetupResolution> {
  const env = options.env ?? process.env;
  const authLabel = resolveAuthLabel(cfg, env);
  if (!authLabel) {
    return { ok: false, error: "Gateway auth is not configured (no token or password)." };
  }

  const urlResult = resolveGatewayUrl(cfg, options);
  if (!urlResult.url) {
    return { ok: false, error: urlResult.error ?? "Gateway URL unavailable." };
  }

  const bootstrap = await issueDeviceBootstrapToken({
    baseDir: options.pairingBaseDir,
    profile: PAIRING_SETUP_BOOTSTRAP_PROFILE,
  });

  return {
    ok: true,
    payload: {
      url: urlResult.url,
      bootstrapToken: bootstrap.token,
    },
    authLabel,
    urlSource: urlResult.source ?? "unknown",
  };
}
