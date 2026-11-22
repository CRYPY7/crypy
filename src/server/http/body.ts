import "server-only";

/**
 * Reads a request body as text, refusing more than `maxBytes` (security review, M9). `request.json()` reads any size
 * into memory, and the Origin check alone doesn't stop scripts outside a browser, so every API that takes a body reads
 * it through here. Returns "" for no body, null when it is too large or not valid UTF-8.
 */
export async function readBodyText(request: Request, maxBytes: number): Promise<string | null> {
  const declared = Number(request.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > maxBytes) return null;
  if (!request.body) return "";
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > maxBytes) {
        await reader.cancel().catch(() => undefined);
        return null;
      }
      chunks.push(value);
    }
  } catch {
    return null;
  }
  const all = new Uint8Array(size);
  let at = 0;
  for (const chunk of chunks) {
    all.set(chunk, at);
    at += chunk.byteLength;
  }
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(all);
  } catch {
    return null;
  }
}

/** `readBodyText` + JSON.parse; null when missing, too large or not JSON. */
export async function readBodyJson(request: Request, maxBytes: number): Promise<unknown> {
  const text = await readBodyText(request, maxBytes);
  if (text === null || text === "") return null;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return null;
  }
}
