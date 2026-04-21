export type PdfExtractedImage = {
  data: string;
  mimeType: string;
};

export type PdfExtractedContent = {
  text: string;
  images: PdfExtractedImage[];
};

export async function extractPdfText(): Promise<string> {
  return "";
}

export async function extractPdfContent(_opts?: {
  buffer?: Buffer | Uint8Array;
  maxPages?: number;
  maxPixels?: number;
  minTextChars?: number;
  pageNumbers?: readonly number[];
}): Promise<PdfExtractedContent> {
  return { text: "", images: [] };
}
