export function parseMediaDataUrl(value: string): {
  mimeType?: string;
  data: string;
} | null {
  const match = /^data:([^;,]+)?(?:;base64)?,(.*)$/i.exec(value);
  if (!match) {
    return null;
  }
  return {
    mimeType: match[1] || undefined,
    data: match[2] || "",
  };
}

export type MediaOutputSegment =
  | { type: "text"; text: string }
  | { type: "media"; url: string; mimeType?: string };

export function splitMediaFromOutput(raw: string): {
  text: string;
  mediaUrls: string[];
  mediaUrl?: string;
  audioAsVoice?: boolean;
  segments?: MediaOutputSegment[];
} {
  return {
    text: raw || "",
    mediaUrls: [],
    mediaUrl: undefined,
    audioAsVoice: undefined,
  };
}
