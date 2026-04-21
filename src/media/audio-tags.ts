export function readAudioTags() {
  return {};
}

export function parseAudioTag(text?: string): {
  tag?: string;
  remainder?: string;
  audioAsVoice?: boolean;
  hadTag?: boolean;
  text?: string;
} {
  return { text: text ?? "", audioAsVoice: false, hadTag: false };
}
