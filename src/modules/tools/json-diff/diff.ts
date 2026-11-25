import { cmp, parseDec } from "@/lib/math/decimal";

/**
 * JSON diff (U5): what changed between two JSON documents. A small parser of its own keeps every number exactly as
 * written (JSON.parse rounds big integers such as token amounts) and notices repeated keys, which different programs
 * read differently. Everything runs in the browser.
 */
export type JsonValue =
  | { t: "object"; entries: [string, JsonValue][] }
  | { t: "array"; items: JsonValue[] }
  | { t: "string"; v: string }
  | { t: "number"; raw: string }
  | { t: "bool"; v: boolean }
  | { t: "null" };

export interface ParseError {
  error: "syntax" | "too-large" | "too-deep" | "empty";
  line: number;
  column: number;
}
export type ParseResult = { ok: true; value: JsonValue; duplicates: string[] } | ({ ok: false } & ParseError);

export const MAX_CHARS = 2_000_000;
const MAX_DEPTH = 200;

export function parseJson(text: string): ParseResult {
  if (!text.trim()) return { ok: false, error: "empty", line: 1, column: 1 };
  if (text.length > MAX_CHARS) return { ok: false, error: "too-large", line: 1, column: 1 };
  let i = 0;
  const duplicates: string[] = [];
  const fail = (error: ParseError["error"] = "syntax"): never => {
    const before = text.slice(0, i);
    const line = before.split("\n").length;
    const column = i - before.lastIndexOf("\n");
    throw Object.assign(new Error("json"), { info: { error, line, column } });
  };
  const ws = () => {
    while (i < text.length && " \t\n\r".includes(text[i]!)) i++;
  };
  const str = (): string => {
    i++; // opening quote
    let out = "";
    while (i < text.length) {
      const c = text[i]!;
      if (c === '"') {
        i++;
        return out;
      }
      if (c === "\\") {
        const e = text[i + 1];
        const map: Record<string, string> = {
          '"': '"',
          "\\": "\\",
          "/": "/",
          b: "\b",
          f: "\f",
          n: "\n",
          r: "\r",
          t: "\t",
        };
        if (e === "u") {
          const hex = text.slice(i + 2, i + 6);
          if (!/^[0-9a-f]{4}$/i.test(hex)) fail();
          out += String.fromCharCode(parseInt(hex, 16));
          i += 6;
        } else if (e !== undefined && e in map) {
          out += map[e];
          i += 2;
        } else fail();
      } else if (c < " ") fail();
      else {
        out += c;
        i++;
      }
    }
    return fail();
  };
  const value = (path: string, depth: number): JsonValue => {
    if (depth > MAX_DEPTH) fail("too-deep");
    ws();
    const c = text[i];
    if (c === "{") {
      i++;
      const entries: [string, JsonValue][] = [];
      const seen = new Set<string>();
      ws();
      if (text[i] === "}") {
        i++;
        return { t: "object", entries };
      }
      for (;;) {
        ws();
        if (text[i] !== '"') fail();
        const key = str();
        ws();
        if (text[i] !== ":") fail();
        i++;
        const child = pathKey(path, key);
        if (seen.has(key)) duplicates.push(child);
        seen.add(key);
        entries.push([key, value(child, depth + 1)]);
        ws();
        if (text[i] === ",") i++;
        else if (text[i] === "}") {
          i++;
          return { t: "object", entries };
        } else fail();
      }
    }
    if (c === "[") {
      i++;
      const items: JsonValue[] = [];
      ws();
      if (text[i] === "]") {
        i++;
        return { t: "array", items };
      }
      for (;;) {
        items.push(value(`${path}[${items.length}]`, depth + 1));
        ws();
        if (text[i] === ",") i++;
        else if (text[i] === "]") {
          i++;
          return { t: "array", items };
        } else fail();
      }
    }
    if (c === '"') return { t: "string", v: str() };
    const num = /^-?(0|[1-9]\d*)(\.\d+)?([eE][+-]?\d+)?/.exec(text.slice(i, i + 1000));
    if (num) {
      i += num[0].length;
      return { t: "number", raw: num[0] };
    }
    for (const [word, v] of [
      ["true", { t: "bool", v: true }],
      ["false", { t: "bool", v: false }],
      ["null", { t: "null" }],
    ] as const)
      if (text.startsWith(word, i)) {
        i += word.length;
        return v;
      }
    return fail();
  };
  try {
    const root = value("$", 0);
    ws();
    if (i < text.length) fail();
    return { ok: true, value: root, duplicates };
  } catch (e) {
    const info = (e as { info?: ParseError }).info;
    if (!info) throw e;
    return { ok: false, ...info };
  }
}

export function pathKey(path: string, key: string): string {
  return /^[A-Za-z_$][\w$]*$/.test(key) ? `${path}.${key}` : `${path}[${JSON.stringify(key)}]`;
}

/** Numbers are equal when they are the same value however written (1.0 = 1 = 1e0); exact, no rounding. */
function sameNumber(a: string, b: string): boolean {
  if (a === b) return true;
  const x = parseDec(a, { allowNegative: true });
  const y = parseDec(b, { allowNegative: true });
  return x.ok && y.ok ? cmp(x.value, y.value) === 0 : false;
}

export type ChangeKind = "added" | "removed" | "changed" | "type";
export interface Change {
  path: string;
  kind: ChangeKind;
  before: string | null;
  after: string | null;
}
export const MAX_CHANGES = 2000;

/** A short, single-line rendering of a value for the change list. */
export function show(v: JsonValue, limit = 120): string {
  const full = render(v);
  return full.length > limit ? `${full.slice(0, limit - 1)}…` : full;
}
function render(v: JsonValue): string {
  switch (v.t) {
    case "object":
      return `{${v.entries.map(([k, x]) => `${JSON.stringify(k)}:${render(x)}`).join(",")}}`;
    case "array":
      return `[${v.items.map(render).join(",")}]`;
    case "string":
      return JSON.stringify(v.v);
    case "number":
      return v.raw;
    case "bool":
      return String(v.v);
    case "null":
      return "null";
  }
}

export interface DiffResult {
  changes: Change[];
  truncated: boolean;
  counts: Record<ChangeKind, number>;
}

export function diffJson(a: JsonValue, b: JsonValue): DiffResult {
  const changes: Change[] = [];
  const counts: Record<ChangeKind, number> = { added: 0, removed: 0, changed: 0, type: 0 };
  const push = (c: Change) => {
    counts[c.kind] += 1;
    if (changes.length < MAX_CHANGES) changes.push(c);
  };
  const walk = (x: JsonValue, y: JsonValue, path: string) => {
    if (x.t !== y.t) return push({ path, kind: "type", before: show(x), after: show(y) });
    if (x.t === "object" && y.t === "object") {
      // Objects are unordered; with repeated keys, the last one wins (as JSON.parse does).
      const mx = new Map(x.entries);
      const my = new Map(y.entries);
      for (const [k, vx] of mx) {
        const vy = my.get(k);
        if (vy === undefined) push({ path: pathKey(path, k), kind: "removed", before: show(vx), after: null });
        else walk(vx, vy, pathKey(path, k));
      }
      for (const [k, vy] of my)
        if (!mx.has(k)) push({ path: pathKey(path, k), kind: "added", before: null, after: show(vy) });
      return;
    }
    if (x.t === "array" && y.t === "array") {
      const n = Math.max(x.items.length, y.items.length);
      for (let i = 0; i < n; i++) {
        const p = `${path}[${i}]`;
        const vx = x.items[i];
        const vy = y.items[i];
        if (vx === undefined) push({ path: p, kind: "added", before: null, after: show(vy!) });
        else if (vy === undefined) push({ path: p, kind: "removed", before: show(vx), after: null });
        else walk(vx, vy, p);
      }
      return;
    }
    const equal =
      x.t === "number" && y.t === "number"
        ? sameNumber(x.raw, y.raw)
        : x.t === "string" && y.t === "string"
          ? x.v === y.v
          : x.t === "bool" && y.t === "bool"
            ? x.v === y.v
            : x.t === "null";
    if (!equal) push({ path, kind: "changed", before: show(x), after: show(y) });
  };
  walk(a, b, "$");
  const total = counts.added + counts.removed + counts.changed + counts.type;
  return { changes, truncated: total > changes.length, counts };
}

/** Plain-text report of the changes, for copying. */
export function report(result: DiffResult): string {
  const sign: Record<ChangeKind, string> = { added: "+", removed: "-", changed: "~", type: "~" };
  return result.changes
    .map((c) =>
      c.kind === "added"
        ? `+ ${c.path}: ${c.after}`
        : c.kind === "removed"
          ? `- ${c.path}: ${c.before}`
          : `${sign[c.kind]} ${c.path}: ${c.before} → ${c.after}`,
    )
    .join("\n");
}
