export async function readResponseWithLimit(response: Response, maxBytes = 1024 * 1024): Promise<Buffer> {
  const arrayBuffer = await response.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);
  return buffer.byteLength > maxBytes ? buffer.subarray(0, maxBytes) : buffer;
}
