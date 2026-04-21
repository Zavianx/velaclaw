// TTS subsystem stub — the full implementation was removed during the main
// history cleanup. This module only exists so callers that still reference
// it continue to compile. Runtime behaviour is unchanged: requests fail
// with an explicit "unavailable" error.

import type { SpeechSynthesisResult } from "./provider-types.js";

export type TextToSpeechRequest = {
  text: string;
  cfg?: unknown;
  channel?: unknown;
  voice?: string;
  [key: string]: unknown;
};

export type TextToSpeechResult = {
  success: boolean;
  audioPath?: string;
  audioBuffer?: Buffer;
  provider?: string;
  outputFormat?: string;
  fileExtension?: string;
  voiceCompatible?: boolean;
  error?: string;
  [key: string]: unknown;
};

export async function textToSpeech(_req: TextToSpeechRequest): Promise<TextToSpeechResult> {
  return {
    success: false,
    error: "TTS is unavailable in this Velaclaw build.",
  };
}

export async function synthesizeSpeech(_req: unknown): Promise<TextToSpeechResult> {
  return textToSpeech({ text: "" });
}

export function setTtsProvider(..._args: unknown[]): void {
  // no-op stub
}

export function resolveExplicitTtsOverrides(..._args: unknown[]): Record<string, unknown> {
  return {};
}

export function getTtsProvider(..._args: unknown[]): string | undefined {
  return undefined;
}

export function resolveTtsConfig(..._args: unknown[]): Record<string, unknown> {
  return {};
}

export async function maybeApplyTtsToPayload(
  payload: unknown,
  ..._args: unknown[]
): Promise<unknown> {
  return payload;
}

export async function textToSpeechTelephony(_req?: unknown): Promise<TextToSpeechResult> {
  return textToSpeech({ text: "" });
}

export type { SpeechSynthesisResult };
