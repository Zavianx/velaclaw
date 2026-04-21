// Stub types — TTS was removed but plugin types still reference these interfaces.

export type SpeechProviderId = string;

export type SpeechProviderConfig = Record<string, unknown>;

export type SpeechProviderConfiguredContext = {
  config?: unknown;
  [key: string]: unknown;
};

export type SpeechProviderResolveConfigContext = {
  config?: unknown;
  [key: string]: unknown;
};

export type SpeechProviderResolveTalkConfigContext = {
  config?: unknown;
  talkProviderConfig?: Record<string, unknown>;
  [key: string]: unknown;
};

export type SpeechProviderResolveTalkOverridesContext = {
  config?: unknown;
  [key: string]: unknown;
};

export type SpeechDirectiveTokenParseContext = {
  token?: string;
  [key: string]: unknown;
};

export type SpeechDirectiveTokenParseResult = {
  handled?: boolean;
  [key: string]: unknown;
};

export type SpeechListVoicesRequest = {
  config?: unknown;
  [key: string]: unknown;
};

export type SpeechVoiceOption = {
  id: string;
  name?: string;
  [key: string]: unknown;
};

export type SpeechSynthesisRequest = {
  text: string;
  voice?: string;
  [key: string]: unknown;
};

export type SpeechSynthesisResult = {
  audio?: Buffer | Uint8Array;
  audioBuffer: Buffer;
  outputFormat?: string;
  fileExtension?: string;
  voiceCompatible?: boolean;
  sampleRate?: number;
  [key: string]: unknown;
};

export type SpeechTelephonySynthesisRequest = SpeechSynthesisRequest;
export type SpeechTelephonySynthesisResult = SpeechSynthesisResult;
