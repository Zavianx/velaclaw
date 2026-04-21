export const VELACLAW_CLI_ENV_VAR = "VELACLAW_CLI";
export const VELACLAW_CLI_ENV_VALUE = "1";

export function markVelaclawExecEnv<T extends Record<string, string | undefined>>(env: T): T {
  return {
    ...env,
    [VELACLAW_CLI_ENV_VAR]: VELACLAW_CLI_ENV_VALUE,
  };
}

export function ensureVelaclawExecMarkerOnProcess(
  env: NodeJS.ProcessEnv = process.env,
): NodeJS.ProcessEnv {
  env[VELACLAW_CLI_ENV_VAR] = VELACLAW_CLI_ENV_VALUE;
  return env;
}
