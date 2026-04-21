export function buildMediaFileContext(): null {
  return null;
}

export function renderFileContextBlock(params: {
  filename?: string;
  fallbackName?: string;
  mimeType?: string;
  text?: string;
  content?: string;
  surroundContentWithNewlines?: boolean;
}): string {
  const label = params.filename?.trim() || params.fallbackName?.trim() || "file";
  const body = (params.content ?? params.text)?.trim() || "";
  return [`<file_context name="${label}">`, body, "</file_context>"].filter(Boolean).join("\n");
}
