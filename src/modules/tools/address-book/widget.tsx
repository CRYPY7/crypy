"use client";

import { useId, useMemo, useState, useSyncExternalStore } from "react";
import { FieldError, LinkButton, Notice, Panel, fill, inputClass } from "../shared/ui";
import {
  ADDRESS_BOOK_KEY,
  type Book,
  MAX_ENTRIES,
  type Family,
  addEntry,
  checkAddress,
  emptyBook,
  matchAddress,
  mergeBooks,
  parseBook,
  serializeBook,
} from "./book";

export interface AddressBookStrings {
  checkTitle: string;
  checkLabel: string;
  checkPlaceholder: string;
  saved: string;
  savedText: string;
  lookalike: string;
  lookalikeText: string;
  lookalikeEntry: string;
  unknown: string;
  unknownText: string;
  addTitle: string;
  address: string;
  label: string;
  labelPlaceholder: string;
  add: string;
  added: string;
  listTitle: string;
  count: string;
  empty: string;
  families: Record<Family, string>;
  remove: string;
  export: string;
  import: string;
  imported: string;
  errors: Record<"invalid" | "checksum" | "secret" | "duplicate" | "full" | "label" | "importFile", string>;
  storage: string;
  local: string;
}

/** The book as a small external store over localStorage (all tabs in step; private mode keeps it for the visit). */
const listeners = new Set<() => void>();
let memoryCopy: string | null = null;
function readSaved(): string | null {
  try {
    return window.localStorage.getItem(ADDRESS_BOOK_KEY) ?? memoryCopy;
  } catch {
    return memoryCopy;
  }
}
function writeSaved(book: Book) {
  memoryCopy = serializeBook(book);
  try {
    window.localStorage.setItem(ADDRESS_BOOK_KEY, memoryCopy);
  } catch {
    // Storage blocked or full: the in-memory copy keeps this visit working.
  }
  for (const listener of listeners) listener();
}
function subscribeSaved(listener: () => void) {
  const onStorage = (event: StorageEvent) => {
    if (event.key === ADDRESS_BOOK_KEY) listener();
  };
  listeners.add(listener);
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", onStorage);
  };
}

const button =
  "inline-flex h-10 items-center gap-2 rounded-xl bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50";

export function AddressBook({ strings }: { strings: AddressBookStrings }) {
  const id = useId();
  const raw = useSyncExternalStore(subscribeSaved, readSaved, () => undefined);
  const book = useMemo(() => (raw === undefined ? emptyBook : parseBook(raw)), [raw]);
  const [probe, setProbe] = useState("");
  const [address, setAddress] = useState("");
  const [label, setLabel] = useState("");
  const [addError, setAddError] = useState<keyof AddressBookStrings["errors"] | null>(null);
  const [message, setMessage] = useState("");

  const probed = probe.trim() ? checkAddress(probe) : null;
  const match = probed?.kind === "ok" ? matchAddress(book, probed.address, probed.family) : null;
  const probeError = probed && probed.kind !== "ok" && probed.kind !== "empty" ? strings.errors[probed.kind] : "";

  const add = () => {
    const result = addEntry(book, address, label);
    if (!result.ok) return setAddError(result.error === "empty" ? "invalid" : result.error);
    writeSaved(result.book);
    setAddError(null);
    setAddress("");
    setLabel("");
    setMessage(fill(strings.added, { label: result.book.entries[result.book.entries.length - 1]!.label }));
  };

  const exportBook = () => {
    const url = URL.createObjectURL(new Blob([serializeBook(book)], { type: "application/json" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = "crypy-address-book.json";
    a.click();
    URL.revokeObjectURL(url);
  };

  const importBook = async (file: File | undefined) => {
    if (!file) return;
    const text = file.size <= 1_000_000 ? await file.text().catch(() => "") : "";
    const incoming = parseBook(text);
    if (incoming.entries.length === 0) return setMessage(strings.errors.importFile);
    const merged = mergeBooks(book, incoming);
    writeSaved(merged);
    setMessage(fill(strings.imported, { count: merged.entries.length - book.entries.length }));
  };

  return (
    <div className="flex flex-col gap-6">
      <Panel>
        <h2 className="mb-3 font-heading text-lg font-semibold">{strings.checkTitle}</h2>
        <label htmlFor={`${id}-probe`} className="mb-1.5 block text-sm font-medium">
          {strings.checkLabel}
        </label>
        <input
          id={`${id}-probe`}
          autoComplete="off"
          spellCheck={false}
          dir="ltr"
          value={probe}
          placeholder={strings.checkPlaceholder}
          aria-invalid={Boolean(probeError) || undefined}
          aria-describedby={`${id}-probe-error`}
          onChange={(e) => setProbe(e.target.value)}
          className={`${inputClass} technical text-sm`}
        />
        <FieldError id={`${id}-probe-error`}>{probeError}</FieldError>
        {match && (
          <div className="mt-3" aria-live="polite">
            {match.kind === "saved" && (
              <Notice tone="low" title={fill(strings.saved, { label: match.entry.label })} testId="book-verdict">
                {strings.savedText}
              </Notice>
            )}
            {match.kind === "lookalike" && (
              <Notice tone="critical" title={strings.lookalike} testId="book-verdict">
                <p>{strings.lookalikeText}</p>
                <ul className="mt-2 flex flex-col gap-1">
                  {match.entries.map((e) => (
                    <li key={e.address}>
                      {fill(strings.lookalikeEntry, { label: e.label })}{" "}
                      <span dir="ltr" className="technical break-all">
                        {e.address}
                      </span>
                    </li>
                  ))}
                </ul>
              </Notice>
            )}
            {match.kind === "unknown" && (
              <Notice tone="info" title={strings.unknown} testId="book-verdict">
                {strings.unknownText}
              </Notice>
            )}
          </div>
        )}
      </Panel>

      <Panel>
        <h2 className="mb-3 font-heading text-lg font-semibold">{strings.addTitle}</h2>
        <form
          className="grid gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            add();
          }}
        >
          <div>
            <label htmlFor={`${id}-address`} className="mb-1.5 block text-sm font-medium">
              {strings.address}
            </label>
            <input
              id={`${id}-address`}
              autoComplete="off"
              spellCheck={false}
              dir="ltr"
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              className={`${inputClass} technical text-sm`}
            />
          </div>
          <div>
            <label htmlFor={`${id}-label`} className="mb-1.5 block text-sm font-medium">
              {strings.label}
            </label>
            <input
              id={`${id}-label`}
              autoComplete="off"
              maxLength={40}
              value={label}
              placeholder={strings.labelPlaceholder}
              onChange={(e) => setLabel(e.target.value)}
              className={`${inputClass} text-sm`}
            />
          </div>
          <FieldError id={`${id}-add-error`}>
            {addError ? fill(strings.errors[addError], { max: MAX_ENTRIES }) : ""}
          </FieldError>
          <button type="submit" className={button}>
            {strings.add}
          </button>
        </form>
      </Panel>

      <Panel>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          <h2 className="min-w-0 flex-1 font-heading text-lg font-semibold">
            {strings.listTitle}
            <span className="text-sm font-normal text-muted-foreground">
              {" "}
              · {fill(strings.count, { count: book.entries.length, max: MAX_ENTRIES })}
            </span>
          </h2>
          {book.entries.length > 0 && <LinkButton onClick={exportBook}>{strings.export}</LinkButton>}
          <label className="cursor-pointer text-sm font-medium text-primary underline-offset-4 hover:underline">
            {strings.import}
            <input
              type="file"
              accept="application/json,.json"
              className="sr-only"
              onChange={(e) => {
                void importBook(e.target.files?.[0]);
                e.target.value = "";
              }}
            />
          </label>
        </div>
        {message && (
          <p className="mt-2 text-sm text-muted-foreground" role="status">
            {message}
          </p>
        )}
        {book.entries.length === 0 ? (
          <p className="mt-3 text-sm text-muted-foreground">{strings.empty}</p>
        ) : (
          <ul className="mt-3">
            {book.entries.map((e) => (
              <li key={e.address} className="flex items-start gap-3 border-t border-border py-3 first:border-t-0">
                <div className="min-w-0 flex-1">
                  <p className="font-medium">{e.label}</p>
                  <p dir="ltr" className="technical text-sm break-all text-muted-foreground">
                    {e.address}
                  </p>
                  <p className="text-xs text-muted-foreground">{strings.families[e.family]}</p>
                </div>
                <LinkButton
                  onClick={() => writeSaved({ entries: book.entries.filter((x) => x.address !== e.address) })}
                >
                  {fill(strings.remove, { label: e.label })}
                </LinkButton>
              </li>
            ))}
          </ul>
        )}
        <p className="mt-4 text-sm text-muted-foreground">{strings.storage}</p>
      </Panel>
      <p className="text-sm text-muted-foreground">{strings.local}</p>
    </div>
  );
}
