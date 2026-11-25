/**
 * File hash checker (U4): compares a file's hash, computed in the browser (the file never leaves the computer), with
 * the checksum a project publishes for its download. Published checksums come in many shapes: "sha256:…", the
 * `sha256sum` line "<hash>  file.dmg", upper case, or Base64. The algorithm is told by the length.
 */
export const algorithms = ["SHA-256", "SHA-512", "SHA-1"] as const;
export type Algorithm = (typeof algorithms)[number];
const HEX_LENGTH: Record<number, Algorithm> = { 64: "SHA-256", 128: "SHA-512", 40: "SHA-1" };
/** Largest file read into memory (phones run out of memory beyond this). */
export const MAX_FILE_BYTES = 1024 * 1024 * 1024;

export type Expected = { ok: true; algorithm: Algorithm; hex: string } | { ok: false; error: "format" } | null;

export function readExpected(raw: string): Expected {
  let text = raw.trim();
  if (!text) return null;
  // "<hash>  filename" (sha256sum), "SHA256 (file) = <hash>" (BSD), "sha256:<hash>", "sha256-<base64>" (SRI).
  const bsd = /=\s*([0-9a-fA-F]+)\s*$/.exec(text);
  if (bsd) text = bsd[1]!;
  text = text.replace(/^(sha-?(1|256|512))[:-]\s*/i, "");
  const first = text.split(/\s+/)[0]!;
  if (/^[0-9a-fA-F]+$/.test(first) && HEX_LENGTH[first.length])
    return { ok: true, algorithm: HEX_LENGTH[first.length]!, hex: first.toLowerCase() };
  // Base64 (as in integrity attributes).
  if (/^[A-Za-z0-9+/]+={0,2}$/.test(first)) {
    try {
      const bytes = Uint8Array.from(atob(first), (c) => c.charCodeAt(0));
      const hex = [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");
      if (HEX_LENGTH[hex.length]) return { ok: true, algorithm: HEX_LENGTH[hex.length]!, hex };
    } catch {
      // not Base64
    }
  }
  return { ok: false, error: "format" };
}

export function toHex(buffer: ArrayBuffer): string {
  return [...new Uint8Array(buffer)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** Hashes of a file's bytes with the browser's own crypto (Web Crypto). */
export async function hashBytes(data: ArrayBuffer): Promise<Record<Algorithm, string>> {
  const out = {} as Record<Algorithm, string>;
  for (const algorithm of algorithms) out[algorithm] = toHex(await crypto.subtle.digest(algorithm, data));
  return out;
}
