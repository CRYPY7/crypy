import { base64 } from "@scure/base";

/**
 * NFT token URI & metadata decoder (U5). Reads what a contract's tokenURI() / uri() returns, or pasted metadata JSON:
 * decodes on-chain data: URIs, turns ipfs:// and ar:// into gateway addresses, lists the traits, and flags content that
 * can run code or be changed later. Nothing is fetched: gateway addresses are shown, never opened.
 */
export type UriScheme = "data" | "ipfs" | "arweave" | "https" | "http" | "script" | "other";
export type NftError = "empty" | "too-large" | "bad-json" | "bad-data" | "token-id";
export const MAX_CHARS = 2_000_000;

export interface UriInfo {
  uri: string;
  scheme: UriScheme;
  /** For data: URIs: the declared media type (e.g. application/json, image/svg+xml). */
  mediaType: string | null;
  base64: boolean;
  /** Gateway addresses for ipfs:// and ar:// (shown to copy; never opened by CRYPY). */
  gateways: string[];
  /** Decoded text of a data: URI with a text media type (JSON, SVG, HTML). */
  text: string | null;
  bytes: number | null;
  /** A data: image URI safe to show in an <img> (images shown this way can't run scripts or load anything). */
  preview: string | null;
}

export interface Trait {
  trait: string;
  value: string;
  displayType: string | null;
}
export interface Metadata {
  name: string | null;
  description: string | null;
  externalUrl: string | null;
  attributes: Trait[];
  otherKeys: string[];
  pretty: string;
}

export type FindingCode =
  | "script-scheme"
  | "svg-script"
  | "html"
  | "web-hosted"
  | "insecure-http"
  | "svg-external"
  | "bad-json"
  | "content-addressed"
  | "on-chain"
  | "id-template"
  | "gateway-url";
export type FindingTone = "critical" | "medium" | "info";
export interface Finding {
  code: FindingCode;
  tone: FindingTone;
  /** Which part it is about: the token URI, image, animation_url, external_url. */
  field: "uri" | "image" | "animation" | "external";
}

export interface NftDecoded {
  /** The URI as read (after {id} was filled in, for ERC-1155). Null when metadata JSON was pasted. */
  source: UriInfo | null;
  metadata: Metadata | null;
  image: UriInfo | null;
  animation: UriInfo | null;
  findings: Finding[];
}
export type NftResult = { ok: true; value: NftDecoded } | { ok: false; error: NftError };

const tones: Record<FindingCode, FindingTone> = {
  "script-scheme": "critical",
  "svg-script": "critical",
  html: "medium",
  "web-hosted": "medium",
  "insecure-http": "medium",
  "svg-external": "medium",
  "bad-json": "medium",
  "content-addressed": "info",
  "on-chain": "info",
  "id-template": "info",
  "gateway-url": "info",
};

/** ERC-1155 clients replace {id} with the token id as 64 lower-case hex digits. */
export function fillId(uri: string, tokenId: string): { ok: true; uri: string } | { ok: false } {
  const text = tokenId.trim();
  if (!text) return { ok: true, uri };
  let id: bigint;
  try {
    if (!/^(0x[0-9a-f]+|\d+)$/i.test(text)) return { ok: false };
    id = BigInt(text);
  } catch {
    return { ok: false };
  }
  if (id >= 2n ** 256n) return { ok: false };
  return { ok: true, uri: uri.replaceAll("{id}", id.toString(16).padStart(64, "0")) };
}

const previewable = /^image\/(svg\+xml|png|gif|jpeg|webp|avif)$/;

function decodeData(uri: string): UriInfo | null {
  const comma = uri.indexOf(",");
  if (comma < 0) return null;
  const head = uri.slice(5, comma);
  const body = uri.slice(comma + 1);
  const parts = head.split(";").map((p) => p.trim());
  const isBase64 = parts.some((p) => p.toLowerCase() === "base64");
  const mediaType = (parts[0] || "text/plain").toLowerCase();
  let bytes: Uint8Array;
  try {
    if (isBase64) bytes = base64.decode(body.replace(/\s+/g, "").padEnd(Math.ceil(body.length / 4) * 4, "="));
    else {
      let text = body;
      try {
        text = decodeURIComponent(body);
      } catch {
        // Not percent-encoded: on-chain JSON often isn't. Keep it as written.
      }
      bytes = new TextEncoder().encode(text);
    }
  } catch {
    return null;
  }
  const isText = /json|svg|xml|html|text/.test(mediaType);
  let text: string | null = null;
  if (isText) {
    try {
      text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    } catch {
      return null;
    }
  }
  return {
    uri,
    scheme: "data",
    mediaType,
    base64: isBase64,
    gateways: [],
    text,
    bytes: bytes.length,
    preview: previewable.test(mediaType) ? `data:${mediaType};base64,${base64.encode(bytes)}` : null,
  };
}

export function readUri(raw: string): UriInfo | null {
  const uri = raw.trim();
  const lower = uri.toLowerCase();
  const plain = (scheme: UriScheme, gateways: string[] = []): UriInfo => ({
    uri,
    scheme,
    mediaType: null,
    base64: false,
    gateways,
    text: null,
    bytes: null,
    preview: null,
  });
  if (lower.startsWith("data:")) return decodeData(uri);
  if (lower.startsWith("ipfs://")) {
    const path = uri.slice(7).replace(/^ipfs\//i, "");
    return plain("ipfs", [`https://ipfs.io/ipfs/${path}`, `https://dweb.link/ipfs/${path}`]);
  }
  if (lower.startsWith("ar://")) return plain("arweave", [`https://arweave.net/${uri.slice(5)}`]);
  if (lower.startsWith("https://")) return plain("https");
  if (lower.startsWith("http://")) return plain("http");
  // Browsers ignore spaces and control characters inside a scheme name ("java\tscript:"), so compare without them.
  if (/^(javascript|vbscript):/.test(lower.replace(/[\s\u0000-\u001f]/g, ""))) return plain("script");
  return plain("other");
}

function uriFindings(info: UriInfo, field: Finding["field"], out: Finding[]) {
  const add = (code: FindingCode) => {
    if (!out.some((f) => f.code === code && f.field === field)) out.push({ code, tone: tones[code], field });
  };
  if (info.scheme === "script") add("script-scheme");
  if (info.scheme === "http") add("insecure-http");
  if (info.scheme === "http" || info.scheme === "https") {
    if (/\/(ipfs|ipns)\//i.test(info.uri)) add("gateway-url");
    else add("web-hosted");
  }
  if (info.scheme === "ipfs" || info.scheme === "arweave") add("content-addressed");
  if (info.scheme === "data") add("on-chain");
  if (info.mediaType?.includes("html")) add("html");
  if (info.mediaType?.includes("svg") && info.text) svgFindings(info.text, add);
}

function svgFindings(svg: string, add: (code: FindingCode) => void) {
  if (/<script\b|\son[a-z]+\s*=|javascript:|<foreignObject\b/i.test(svg)) add("svg-script");
  if (/(?:href|src)\s*=\s*["']\s*(?:https?:)?\/\//i.test(svg) || /url\(\s*["']?\s*(?:https?:)?\/\//i.test(svg))
    add("svg-external");
}

const str = (v: unknown): string | null => (typeof v === "string" ? v : typeof v === "number" ? String(v) : null);

function readMetadata(json: unknown): Metadata | null {
  if (!json || typeof json !== "object" || Array.isArray(json)) return null;
  const o = json as Record<string, unknown>;
  const attributes: Trait[] = [];
  if (Array.isArray(o.attributes))
    for (const a of o.attributes.slice(0, 500)) {
      if (a && typeof a === "object") {
        const t = a as Record<string, unknown>;
        attributes.push({
          trait: str(t.trait_type) ?? "",
          value: str(t.value) ?? (typeof t.value === "boolean" ? String(t.value) : JSON.stringify(t.value ?? null)),
          displayType: str(t.display_type),
        });
      } else if (typeof a === "string") attributes.push({ trait: "", value: a, displayType: null });
    }
  const known = new Set(["name", "description", "image", "image_data", "animation_url", "external_url", "attributes"]);
  return {
    name: str(o.name),
    description: str(o.description),
    externalUrl: str(o.external_url),
    attributes,
    otherKeys: Object.keys(o).filter((k) => !known.has(k)),
    pretty: JSON.stringify(json, null, 2),
  };
}

function svgToUri(svg: string): UriInfo {
  const bytes = new TextEncoder().encode(svg);
  const b64 = base64.encode(bytes);
  return {
    uri: `data:image/svg+xml;base64,${b64}`,
    scheme: "data",
    mediaType: "image/svg+xml",
    base64: true,
    gateways: [],
    text: svg,
    bytes: bytes.length,
    preview: `data:image/svg+xml;base64,${b64}`,
  };
}

export function decodeNft(input: string, tokenId = ""): NftResult {
  const text = input.trim();
  if (!text) return { ok: false, error: "empty" };
  if (text.length > MAX_CHARS) return { ok: false, error: "too-large" };
  const findings: Finding[] = [];

  let source: UriInfo | null = null;
  let json: unknown = undefined;
  if (text.startsWith("{")) {
    try {
      json = JSON.parse(text);
    } catch {
      return { ok: false, error: "bad-json" };
    }
  } else {
    if (text.includes("{id}") && !tokenId.trim()) findings.push({ code: "id-template", tone: "info", field: "uri" });
    const filled = fillId(text, tokenId);
    if (!filled.ok) return { ok: false, error: "token-id" };
    source = readUri(filled.uri);
    if (!source) return { ok: false, error: "bad-data" };
    uriFindings(source, "uri", findings);
    if (source.scheme === "data" && source.mediaType?.includes("json") && source.text !== null) {
      try {
        json = JSON.parse(source.text);
      } catch {
        findings.push({ code: "bad-json", tone: "medium", field: "uri" });
      }
    }
  }

  const metadata = json === undefined ? null : readMetadata(json);
  if (json !== undefined && !metadata) return { ok: false, error: "bad-json" };
  let image: UriInfo | null = null;
  let animation: UriInfo | null = null;
  if (json && typeof json === "object") {
    const o = json as Record<string, unknown>;
    if (typeof o.image === "string" && o.image.trim()) image = readUri(o.image);
    else if (typeof o.image_data === "string" && o.image_data.trim()) image = svgToUri(o.image_data);
    if (typeof o.animation_url === "string" && o.animation_url.trim()) animation = readUri(o.animation_url);
    if (image) uriFindings(image, "image", findings);
    if (animation) uriFindings(animation, "animation", findings);
    if (metadata?.externalUrl) {
      const ext = readUri(metadata.externalUrl);
      if (ext?.scheme === "script") findings.push({ code: "script-scheme", tone: "critical", field: "external" });
    }
  }
  const order: Record<FindingTone, number> = { critical: 0, medium: 1, info: 2 };
  findings.sort((a, b) => order[a.tone] - order[b.tone]);
  return { ok: true, value: { source, metadata, image, animation, findings } };
}
