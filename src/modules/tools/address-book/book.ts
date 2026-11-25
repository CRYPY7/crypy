import { checkOtherAddress } from "@/lib/address/other-formats";
import { checkWalletInput, cleanLabel } from "@/lib/portfolio/input";

/**
 * Local address book (U4): addresses the visitor trusts, kept in this browser only. Its main job is catching address
 * poisoning: a scammer sends dust from an address that starts and ends like one you use, hoping you copy it from your
 * history. So a pasted address is checked against the book: the same address, a look-alike (same first and last
 * characters, different middle), or not in the book. Never sent anywhere.
 */
export const ADDRESS_BOOK_KEY = "crypy.addressBook";
export const MAX_ENTRIES = 200;
/** Characters compared at each end: wallets usually show 4–6 of them. */
const ENDS = 4;

export type Family = "evm" | "bitcoin" | "solana";
export interface Entry {
  address: string;
  label: string;
  family: Family;
  addedAt: number;
}
export interface Book {
  entries: Entry[];
}
export const emptyBook: Book = { entries: [] };

export type AddressInput =
  | { kind: "ok"; address: string; family: Family }
  | { kind: "empty" }
  | { kind: "secret" }
  | { kind: "checksum" }
  | { kind: "invalid" };

/** EVM (checksummed), Bitcoin or Solana. Recovery phrases and private keys are refused, never kept. */
export function checkAddress(raw: string): AddressInput {
  const text = raw.trim();
  const evm = checkWalletInput(text);
  if (evm.kind === "ok") return { kind: "ok", address: evm.address, family: "evm" };
  if (evm.kind === "empty" || evm.kind === "secret" || evm.kind === "checksum") return evm;
  const other = checkOtherAddress(text);
  if (other?.ok) {
    const family = other.address.family;
    // Bech32 addresses are case-insensitive: keep them in lower case so they compare equal.
    const address = family === "bitcoin" && /^(bc|tb)1/i.test(text) ? text.toLowerCase() : text;
    return { kind: "ok", address, family };
  }
  if (other && !other.ok && other.reason === "checksum") return { kind: "checksum" };
  return { kind: "invalid" };
}

const body = (e: { address: string; family: Family }) =>
  e.family === "evm" ? e.address.slice(2).toLowerCase() : e.address;
const same = (a: { address: string; family: Family }, b: { address: string; family: Family }) =>
  a.family === b.family && body(a) === body(b);

export type Match = { kind: "saved"; entry: Entry } | { kind: "lookalike"; entries: Entry[] } | { kind: "unknown" };

/** Is this address in the book, or does it only look like one that is? */
export function matchAddress(book: Book, address: string, family: Family): Match {
  const probe = { address, family };
  const saved = book.entries.find((e) => same(e, probe));
  if (saved) return { kind: "saved", entry: saved };
  const b = body(probe).toLowerCase();
  const lookalikes = book.entries.filter((e) => {
    if (e.family !== family) return false;
    const eb = body(e).toLowerCase();
    return eb.slice(0, ENDS) === b.slice(0, ENDS) && eb.slice(-ENDS) === b.slice(-ENDS);
  });
  return lookalikes.length ? { kind: "lookalike", entries: lookalikes } : { kind: "unknown" };
}

export function addEntry(
  book: Book,
  raw: string,
  label: string,
  now = Date.now(),
):
  | { ok: true; book: Book }
  | { ok: false; error: Exclude<AddressInput["kind"], "ok"> | "duplicate" | "full" | "label" } {
  const checked = checkAddress(raw);
  if (checked.kind !== "ok") return { ok: false, error: checked.kind };
  const clean = cleanLabel(label);
  if (!clean) return { ok: false, error: "label" };
  if (book.entries.some((e) => same(e, checked))) return { ok: false, error: "duplicate" };
  if (book.entries.length >= MAX_ENTRIES) return { ok: false, error: "full" };
  return {
    ok: true,
    book: {
      entries: [...book.entries, { address: checked.address, family: checked.family, label: clean, addedAt: now }],
    },
  };
}

/** Read defensively (also used for imported files): anything malformed, duplicated or over the limit is dropped. */
export function parseBook(text: string | null): Book {
  if (!text) return emptyBook;
  try {
    const raw = JSON.parse(text) as { v?: unknown; entries?: unknown };
    if (raw.v !== 1 || !Array.isArray(raw.entries)) return emptyBook;
    let book = emptyBook;
    for (const e of raw.entries as Record<string, unknown>[]) {
      if (!e || typeof e.address !== "string" || typeof e.label !== "string") continue;
      const added = addEntry(book, e.address, e.label, typeof e.addedAt === "number" ? e.addedAt : 0);
      if (added.ok) book = added.book;
    }
    return book;
  } catch {
    return emptyBook;
  }
}

export function serializeBook(book: Book): string {
  return JSON.stringify({ v: 1, entries: book.entries });
}

/** Two books together (import): existing entries win; new ones are added up to the limit. */
export function mergeBooks(a: Book, b: Book): Book {
  let book = a;
  for (const e of b.entries) {
    const added = addEntry(book, e.address, e.label, e.addedAt);
    if (added.ok) book = added.book;
  }
  return book;
}
