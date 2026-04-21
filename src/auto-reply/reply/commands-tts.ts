import type { CommandHandler } from "./commands-types.js";

// TTS subsystem has been removed. This handler is a no-op stub that rejects
// all /tts commands gracefully so callers that still reference it keep working.

export const handleTtsCommands: CommandHandler = async (_params, allowTextCommands) => {
  if (!allowTextCommands) {
    return null;
  }
  const normalized = _params.command.commandBodyNormalized;
  if (normalized !== "/tts" && !normalized.startsWith("/tts ")) {
    return null;
  }
  return {
    shouldContinue: false,
    reply: { text: "TTS support has been removed." },
  };
};
