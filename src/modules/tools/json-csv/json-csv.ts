/**
 * JSON and CSV formatter (U3), in the browser: format, minify and validate JSON (with the line and column of an
 * error), and convert between a JSON list of objects and CSV. CSV cells that a spreadsheet would run as a formula
 * (starting with = + − @) are written as text, so an exported file can't run anything.
 */
export type JsonCsvError = "empty" | "json" | "csv" | "not-list" | "too-large";
const MAX_INPUT = 2_000_000;

export function formatJson(
  input: string,
  indent: 0 | 2 | 4,
): { ok: true; value: string } | { ok: false; error: JsonCsvError; line?: number; column?: number } {
  if (!input.trim()) return { ok: false, error: "empty" };
  if (input.length > MAX_INPUT) return { ok: false, error: "too-large" };
  try {
    return { ok: true, value: JSON.stringify(JSON.parse(input), null, indent || undefined) };
  } catch (error) {
    return { ok: false, error: "json", ...where(input, error) };
  }
}

/** Line and column of a JSON.parse error, from the position the engine reports. */
function where(input: string, error: unknown): { line?: number; column?: number } {
  const message = error instanceof Error ? error.message : "";
  const pos = /position (\d+)/.exec(message)?.[1] ?? /at line (\d+) column (\d+)/.exec(message);
  if (Array.isArray(pos)) return { line: Number(pos[1]), column: Number(pos[2]) };
  if (pos === undefined) return {};
  const index = Number(pos);
  const before = input.slice(0, index).split("\n");
  return { line: before.length, column: before[before.length - 1]!.length + 1 };
}

export function jsonToCsv(
  input: string,
): { ok: true; value: string; rows: number } | { ok: false; error: JsonCsvError } {
  if (!input.trim()) return { ok: false, error: "empty" };
  if (input.length > MAX_INPUT) return { ok: false, error: "too-large" };
  let data: unknown;
  try {
    data = JSON.parse(input);
  } catch {
    return { ok: false, error: "json" };
  }
  if (!Array.isArray(data) || !data.every((row) => row && typeof row === "object" && !Array.isArray(row)))
    return { ok: false, error: "not-list" };
  const columns: string[] = [];
  for (const row of data as Record<string, unknown>[])
    for (const key of Object.keys(row)) if (!columns.includes(key)) columns.push(key);
  const lines = [columns.map(cell).join(",")];
  for (const row of data as Record<string, unknown>[])
    lines.push(
      columns
        .map((c) =>
          cell(
            row[c] === undefined || row[c] === null
              ? ""
              : typeof row[c] === "object"
                ? JSON.stringify(row[c])
                : String(row[c]),
          ),
        )
        .join(","),
    );
  return { ok: true, value: lines.join("\n"), rows: data.length };
}

function cell(value: string): string {
  const safe = /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
  return /[",\n\r]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

/** RFC 4180: commas (or semicolons, when the first line has more of them), quoted cells, "" inside quotes. */
export function csvToJson(
  input: string,
): { ok: true; value: string; rows: number } | { ok: false; error: JsonCsvError } {
  if (!input.trim()) return { ok: false, error: "empty" };
  if (input.length > MAX_INPUT) return { ok: false, error: "too-large" };
  const firstLine = input.split(/\r?\n/, 1)[0] ?? "";
  const sep = (firstLine.match(/;/g)?.length ?? 0) > (firstLine.match(/,/g)?.length ?? 0) ? ";" : ",";
  const rows: string[][] = [];
  let row: string[] = [];
  let value = "";
  let quoted = false;
  for (let i = 0; i < input.length; i++) {
    const ch = input[i]!;
    if (quoted) {
      if (ch === '"' && input[i + 1] === '"') {
        value += '"';
        i++;
      } else if (ch === '"') quoted = false;
      else value += ch;
    } else if (ch === '"' && value === "") quoted = true;
    else if (ch === sep) {
      row.push(value);
      value = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && input[i + 1] === "\n") i++;
      row.push(value);
      rows.push(row);
      row = [];
      value = "";
    } else value += ch;
  }
  if (quoted) return { ok: false, error: "csv" };
  if (value !== "" || row.length) {
    row.push(value);
    rows.push(row);
  }
  const nonEmpty = rows.filter((r) => r.some((c) => c !== ""));
  if (nonEmpty.length < 1) return { ok: false, error: "csv" };
  const [header, ...body] = nonEmpty;
  const objects = body.map((r) => Object.fromEntries(header!.map((h, i) => [h || `column${i + 1}`, r[i] ?? ""])));
  return { ok: true, value: JSON.stringify(objects, null, 2), rows: objects.length };
}
