"use client";

import { FileText, Upload, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { fill } from "@/modules/tools/shared/ui";
import { cn } from "@/lib/utils";
import { EXAMPLE_LIST, type LineNote, MAX_ADDRESSES, MAX_INPUT_CHARS, type ParsedList } from "./parse";
import type { BatchStrings } from "./widget";

const MAX_FILE_BYTES = 1_000_000;

function noteText(s: BatchStrings, note: LineNote, max: number): string {
  switch (note.kind) {
    case "duplicate":
      return fill(s.notes.duplicate, { line: note.firstLine });
    case "several":
      return fill(s.notes.several, { count: note.count });
    case "over-limit":
      return fill(s.notes["over-limit"], { max });
    default:
      return s.notes[note.kind];
  }
}

/**
 * Address list editor: a plain textarea (accessible, fast to paste into) with line numbers and per-line notes drawn
 * underneath it. Files are read in the browser; nothing is uploaded.
 */
export function AddressEditor({
  s,
  text,
  onText,
  parsed,
  max = MAX_ADDRESSES,
}: {
  s: BatchStrings;
  text: string;
  onText: (text: string) => void;
  parsed: ParsedList;
  /** Addresses per scan (500 on CRYPY's servers, more in the browser mode). */
  max?: number;
}) {
  const area = useRef<HTMLTextAreaElement>(null);
  const overlay = useRef<HTMLDivElement>(null);
  const gutter = useRef<HTMLDivElement>(null);
  const file = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [fileError, setFileError] = useState("");

  // Text typed or pasted before the page's code finished loading is in the box but not yet in the list: take it over
  // once (the same rule as the other tools' address boxes).
  useEffect(() => {
    const typed = area.current?.value ?? "";
    if (typed && typed !== text) onText(typed.slice(0, MAX_INPUT_CHARS));
    // Only on first load.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const lines = useMemo(() => text.split(/\r?\n/), [text]);
  const notes = useMemo(() => {
    const map = new Map<number, LineNote>();
    // The most important note per line: problems first, then duplicates, then information.
    const rank = { invalid: 0, checksum: 0, "over-limit": 1, duplicate: 2, several: 3 };
    for (const note of parsed.notes) {
      const current = map.get(note.line);
      if (!current || rank[note.kind] < rank[current.kind]) map.set(note.line, note);
    }
    return map;
  }, [parsed.notes]);

  const sync = () => {
    const el = area.current;
    if (!el) return;
    if (overlay.current) overlay.current.style.transform = `translate(${-el.scrollLeft}px, ${-el.scrollTop}px)`;
    if (gutter.current) gutter.current.style.transform = `translateY(${-el.scrollTop}px)`;
  };

  const readFile = async (f: File | undefined) => {
    setFileError("");
    if (!f) return;
    if (f.size > MAX_FILE_BYTES) return setFileError(s.fileTooBig);
    try {
      const content = await f.text();
      onText(content.slice(0, MAX_INPUT_CHARS));
    } catch {
      setFileError(s.fileUnreadable);
    }
  };

  const firstProblem = parsed.notes.find((n) => n.kind === "invalid" || n.kind === "checksum");
  const button =
    "inline-flex h-9 items-center gap-2 rounded-lg border px-3 text-sm hover:border-primary focus-visible:ring-3 focus-visible:ring-ring/25 focus-visible:outline-none";

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap gap-2">
        <button type="button" className={button} onClick={() => file.current?.click()}>
          <Upload className="size-4" aria-hidden="true" />
          {s.upload}
        </button>
        <input
          ref={file}
          type="file"
          accept=".csv,.txt,text/csv,text/plain"
          className="hidden"
          onChange={(e) => {
            void readFile(e.target.files?.[0]);
            e.target.value = "";
          }}
        />
        <button type="button" className={button} onClick={() => onText(EXAMPLE_LIST)}>
          <FileText className="size-4" aria-hidden="true" />
          {s.example}
        </button>
        <button type="button" className={cn(button, "ms-auto")} onClick={() => onText("")}>
          <X className="size-4" aria-hidden="true" />
          {s.clear}
        </button>
      </div>

      <div
        className={cn(
          "relative grid h-80 grid-cols-[2.75rem_1fr] overflow-hidden rounded-xl border bg-background focus-within:border-ring focus-within:ring-3 focus-within:ring-ring/25",
          dragging && "border-primary",
        )}
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          void readFile(e.dataTransfer.files?.[0]);
        }}
      >
        <div
          aria-hidden="true"
          className="overflow-hidden border-e bg-card/60 py-3 text-end font-mono text-xs leading-6 text-muted-foreground"
        >
          <div ref={gutter}>
            {lines.map((_, i) => (
              <div key={i} className="pe-2 tabular-nums">
                {i + 1}
              </div>
            ))}
          </div>
        </div>
        <div className="relative min-w-0 overflow-hidden">
          <div aria-hidden="true" className="pointer-events-none absolute inset-0">
            <div ref={overlay} className="w-max min-w-full py-3 font-mono text-sm leading-6 whitespace-pre">
              {lines.map((line, i) => {
                const note = notes.get(i + 1);
                const bad = note && (note.kind === "invalid" || note.kind === "checksum" || note.kind === "over-limit");
                return (
                  <div
                    key={i}
                    className={cn(
                      "px-3",
                      note && (bad ? "bg-critical/8" : note.kind === "duplicate" ? "bg-high/8" : ""),
                    )}
                  >
                    <span className="text-transparent">{line || " "}</span>
                    {note && (
                      <span className={cn("ms-3 font-sans text-xs", bad ? "text-critical" : "text-high")}>
                        {noteText(s, note, max)}
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
          <textarea
            ref={area}
            value={text}
            onChange={(e) => onText(e.target.value.slice(0, MAX_INPUT_CHARS))}
            onScroll={sync}
            wrap="off"
            spellCheck={false}
            autoCapitalize="off"
            autoComplete="off"
            aria-label={s.editorLabel}
            placeholder={s.placeholder}
            dir="ltr"
            className="relative block size-full resize-none bg-transparent px-3 py-3 font-mono text-sm leading-6 outline-none placeholder:text-muted-foreground/60"
          />
        </div>
        {dragging && (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-primary/10 text-sm font-medium text-primary">
            {s.dropHere}
          </div>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-2 text-xs">
        <span className="rounded-full bg-low/14 px-2.5 py-1 text-low">
          {fill(s.valid, { count: parsed.entries.length })}
        </span>
        {parsed.duplicates > 0 && (
          <span className="rounded-full bg-high/14 px-2.5 py-1 text-high">
            {fill(s.duplicates, { count: parsed.duplicates })}
          </span>
        )}
        {parsed.problems > 0 && firstProblem && (
          <span className="rounded-full bg-critical/14 px-2.5 py-1 text-critical">
            {fill(s.problems, { count: parsed.problems, line: firstProblem.line })}
          </span>
        )}
        {parsed.overLimit > 0 && (
          <span className="rounded-full bg-critical/14 px-2.5 py-1 text-critical">
            {fill(s.overLimit, { count: parsed.overLimit })}
          </span>
        )}
        <span className="ms-auto text-muted-foreground">
          {fill(s.countLine, { count: parsed.entries.length, max })}
        </span>
      </div>
      {fileError && (
        <p role="alert" className="text-sm text-critical">
          {fileError}
        </p>
      )}
    </div>
  );
}
