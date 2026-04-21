// Speech directive parsing stub — the full TTS subsystem was removed but
// plugin code still references these helpers. Keep the surface area so
// callers compile; the returned results signal "no directives applied"
// without changing runtime behaviour.

export type ParsedTtsDirectives = {
  text: string;
  cleanedText: string;
  overrides: {
    ttsText?: string;
    [key: string]: unknown;
  };
  model?: string;
  voice?: string;
  [key: string]: unknown;
};

export function parseTtsDirectives(
  text: string,
  _modelOverrides?: unknown,
  _options?: unknown,
): ParsedTtsDirectives {
  return { text, cleanedText: text, overrides: {} };
}
