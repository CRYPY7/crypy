/**
 * Owner powers read from a contract's verified source code (Solidity), when the source is published on Sourcify.
 * Pure (no network), unit-tested.
 *
 * Compared with reading the compiled code (bytecode.ts), the source gives:
 *   - every power-like function by its real name, not only names in CRYPY's list;
 *   - who may call it: the owner, a role, another named account, or anyone (no access check found);
 *   - limits written in the function, e.g. `require(totalFee <= 25)`, shown as written (never interpreted).
 * The analysis reads text, not the compiled program, so it stays labelled as an analysis of the source; access checks
 * hidden in unusual patterns may be missed, and then the function is reported as "access not recognised".
 */
import type { FunctionAccess, OwnerPower, PowerFact } from "@/lib/security/types";

export interface AbiEntry {
  type?: string;
  name?: string;
  stateMutability?: string;
  inputs?: { type?: string }[];
}

/** Power by function name (verified ABI). Standard ERC-20/Ownable/AccessControl functions are never powers. */
const NAME_RULES: { power: Exclude<OwnerPower, "selfdestruct">; test: RegExp }[] = [
  { power: "upgrade", test: /^upgrade(To|ToAndCall)$/ },
  { power: "mint", test: /^(mint|mintTo|mintFor|mintTokens|issue|_?mintAs\w*)$/i },
  { power: "fees", test: /^(set|update|change|adjust|modify)\w*(fee|tax)\w*$/i },
  {
    power: "blacklist",
    test: /^(?!.*(lister|listers)$).*(black ?list|blocklist|^setBots?$|^addBots?$|blockAddress|^ban\w*)/i,
  },
  {
    power: "pause",
    test: /^(pause|setPaused|pauseTrading|enableTrading|openTrading|startTrading|launch|setTrading\w*|tradingStatus|setTradingOpen|toggleTrading)$/i,
  },
  { power: "limits", test: /^(set|update|change|remove)\w*(max(tx|wallet|transaction|sell|buy)\w*|limits?)$/i },
  { power: "cooldown", test: /cooldown/i },
];
const NOT_POWERS = new Set([
  "transfer",
  "transferFrom",
  "approve",
  "increaseAllowance",
  "decreaseAllowance",
  "renounceOwnership",
  "transferOwnership",
  "acceptOwnership",
  "grantRole",
  "revokeRole",
  "renounceRole",
  "permit",
  "delegate",
  "delegateBySig",
  "unpause",
]);

/** Removes comments and string contents so they can't fake code. Keeps the text length similar. */
export function stripSolidity(text: string): string {
  let out = "";
  let i = 0;
  while (i < text.length) {
    const c = text[i]!;
    const n = text[i + 1];
    if (c === "/" && n === "/") {
      while (i < text.length && text[i] !== "\n") i++;
    } else if (c === "/" && n === "*") {
      i += 2;
      while (i < text.length && !(text[i] === "*" && text[i + 1] === "/")) i++;
      i += 2;
    } else if (c === '"' || c === "'") {
      const q = c;
      out += q;
      i++;
      while (i < text.length && text[i] !== q) i += text[i] === "\\" ? 2 : 1;
      out += q;
      i++;
    } else {
      out += c;
      i++;
    }
  }
  return out;
}

interface FunctionText {
  header: string;
  body: string | null;
}

/** Every definition of `name` (overloads, inherited copies): its header and body. */
export function functionTexts(code: string, name: string): FunctionText[] {
  const out: FunctionText[] = [];
  const re = new RegExp(`\\bfunction\\s+${name}\\s*\\(`, "g");
  for (let m = re.exec(code); m; m = re.exec(code)) {
    let i = m.index + m[0].length;
    let depth = 1;
    while (i < code.length && depth > 0) {
      if (code[i] === "(") depth++;
      else if (code[i] === ")") depth--;
      i++;
    }
    let j = i;
    while (j < code.length && code[j] !== "{" && code[j] !== ";") j++;
    const header = code.slice(m.index, j);
    if (code[j] === ";") {
      out.push({ header, body: null });
      continue;
    }
    let k = j + 1;
    depth = 1;
    while (k < code.length && depth > 0) {
      if (code[k] === "{") depth++;
      else if (code[k] === "}") depth--;
      k++;
    }
    out.push({ header, body: code.slice(j + 1, k - 1) });
  }
  return out;
}

const ROLE = /\bonlyRole\s*\(|\bhasRole\s*\(|\b_checkRole\s*\(/;
const OWNER =
  /\bonlyOwner\b|\b_checkOwner\s*\(|(msg\.sender|_msgSender\s*\(\s*\))\s*==\s*(owner\s*\(\s*\)|_owner\b)|(owner\s*\(\s*\)|_owner\b)\s*==\s*(msg\.sender|_msgSender\s*\(\s*\))/;
const OTHER =
  /\bonly[A-Z]\w*\b|\bauth\b|\brequiresAuth\b|\b(require|if)\s*\([^;]*(msg\.sender|_msgSender\s*\(\s*\))\s*(==|!=)/;

/** Who may call a function, from its header (modifiers) and body. */
export function accessOf(t: FunctionText): FunctionAccess {
  const text = `${t.header} ${t.body ?? ""}`;
  if (ROLE.test(text)) return "role";
  if (OWNER.test(text)) return "owner";
  if (OTHER.test(text)) return "restricted";
  return "open";
}

/** Limits written in a function: `require(x <= 25)`-style checks, shown as written. */
export function limitsIn(body: string): string[] {
  const out: string[] = [];
  const re = /\brequire\s*\(/g;
  for (let m = re.exec(body); m && out.length < 3; m = re.exec(body)) {
    let i = m.index + m[0].length;
    let depth = 1;
    const start = i;
    while (i < body.length && depth > 0) {
      if (body[i] === "(") depth++;
      else if (body[i] === ")") depth--;
      i++;
    }
    const inner = body.slice(start, i - 1);
    const condition = splitTopLevel(inner)[0]!.replace(/\s+/g, " ").trim();
    if (
      SAFE_LIMIT.test(condition) &&
      /[^<]<[^<]|>=?/.test(condition) &&
      !/(>|!=)\s*0\s*$/.test(condition) &&
      /\d/.test(condition) &&
      !/msg\.sender|_msgSender/.test(condition)
    )
      out.push(condition.slice(0, 80));
  }
  return out;
}

function splitTopLevel(s: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let last = 0;
  for (let i = 0; i < s.length; i++) {
    if (s[i] === "(" || s[i] === "[") depth++;
    else if (s[i] === ")" || s[i] === "]") depth--;
    else if (s[i] === "," && depth === 0) {
      parts.push(s.slice(last, i));
      last = i + 1;
    }
  }
  parts.push(s.slice(last));
  return parts;
}

const signature = (f: AbiEntry) => `${f.name}(${(f.inputs ?? []).map((i) => i.type ?? "").join(",")})`;
/** Text from outside sources is shown only when it looks like plain Solidity. */
const SAFE_NAME = /^[A-Za-z_$][\w$]{0,63}$/;
const SAFE_TYPE = /^[\w[\]]{1,40}$/;
const SAFE_LIMIT = /^[\w\s<>=!+\-*/%().,&|[\]]+$/;

/**
 * Powers from a verified contract: ABI for which functions exist (callable from outside, state-changing), source for
 * who may call them and the limits they check. SELFDESTRUCT still comes from the compiled code.
 */
export function powersFromSource(abi: AbiEntry[], sources: Record<string, string>): PowerFact[] {
  const code = Object.values(sources).map(stripSolidity).join("\n");
  const byPower = new Map<OwnerPower, PowerFact>();
  for (const f of abi) {
    if (f.type !== "function" || !f.name || f.stateMutability === "view" || f.stateMutability === "pure") continue;
    if (!SAFE_NAME.test(f.name) || !(f.inputs ?? []).every((i) => SAFE_TYPE.test(i.type ?? ""))) continue;
    if (NOT_POWERS.has(f.name)) continue;
    const rule = NAME_RULES.find((r) => r.test.test(f.name!));
    if (!rule) continue;
    const texts = functionTexts(code, f.name).filter((t) => t.body !== null);
    const accesses = texts.map(accessOf);
    // The weakest protection among the definitions found decides; none found → not recognised.
    const order: FunctionAccess[] = ["open", "restricted", "role", "owner"];
    const access: FunctionAccess =
      accesses.length === 0 ? "unknown" : (order.find((a) => accesses.includes(a)) ?? "unknown");
    const limits = [...new Set(texts.flatMap((t) => limitsIn(t.body!)))].slice(0, 3);
    const fact = byPower.get(rule.power) ?? { power: rule.power, functions: [], basis: "source" as const, details: [] };
    const sig = signature(f);
    if (!fact.functions.includes(sig)) {
      fact.functions.push(sig);
      fact.details!.push({ signature: sig, access, limits });
    }
    byPower.set(rule.power, fact);
  }
  return [...byPower.values()];
}
