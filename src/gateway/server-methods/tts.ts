import { ErrorCodes, errorShape } from "../protocol/index.js";
import type { GatewayRequestHandlers } from "./types.js";

const TTS_REMOVED_MSG = "TTS subsystem has been removed";

export const ttsHandlers: GatewayRequestHandlers = {
  "tts.status": async ({ respond }) => {
    respond(false, undefined, errorShape(ErrorCodes.UNAVAILABLE, TTS_REMOVED_MSG));
  },
  "tts.enable": async ({ respond }) => {
    respond(false, undefined, errorShape(ErrorCodes.UNAVAILABLE, TTS_REMOVED_MSG));
  },
  "tts.disable": async ({ respond }) => {
    respond(false, undefined, errorShape(ErrorCodes.UNAVAILABLE, TTS_REMOVED_MSG));
  },
  "tts.convert": async ({ respond }) => {
    respond(false, undefined, errorShape(ErrorCodes.UNAVAILABLE, TTS_REMOVED_MSG));
  },
  "tts.setProvider": async ({ respond }) => {
    respond(false, undefined, errorShape(ErrorCodes.UNAVAILABLE, TTS_REMOVED_MSG));
  },
  "tts.providers": async ({ respond }) => {
    respond(false, undefined, errorShape(ErrorCodes.UNAVAILABLE, TTS_REMOVED_MSG));
  },
};
