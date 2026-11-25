"use client";

import { useId, useState } from "react";
import { type CommonStrings, FieldError, LinkButton, Notice, Panel, ValueRow, fill, inputClass } from "../shared/ui";
import { type FindingCode, type NftError, type UriInfo, type UriScheme, decodeNft } from "./nft-uri";

export interface NftUriStrings {
  label: string;
  placeholder: string;
  hint: string;
  tokenId: string;
  tokenIdHint: string;
  findingsTitle: string;
  fields: Record<"uri" | "image" | "animation" | "external", string>;
  findings: Record<FindingCode, { title: string; body: string }>;
  sourceTitle: string;
  storage: string;
  schemes: Record<UriScheme, string>;
  mediaType: string;
  decodedSize: string;
  bytes: string;
  gateway: string;
  gatewayHelp: string;
  decodedText: string;
  metadataTitle: string;
  name: string;
  description: string;
  externalUrl: string;
  image: string;
  imagePreview: string;
  imagePreviewHelp: string;
  noPreview: string;
  animation: string;
  traitsTitle: string;
  trait: string;
  value: string;
  noTraits: string;
  otherKeys: string;
  rawJson: string;
  note: string;
  local: string;
  errors: Record<NftError, string>;
}

const EXAMPLE_SVG =
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><rect width="100" height="100" fill="#1e293b"/><circle cx="50" cy="50" r="30" fill="#f59e0b"/></svg>';
function exampleUri(): string {
  const bytes = (s: string) => btoa(String.fromCharCode(...new TextEncoder().encode(s)));
  const meta = {
    name: "Example #7",
    description: "A fully on-chain example token.",
    image: `data:image/svg+xml;base64,${bytes(EXAMPLE_SVG)}`,
    attributes: [
      { trait_type: "Background", value: "Slate" },
      { trait_type: "Shape", value: "Circle" },
      { trait_type: "Level", value: 7, display_type: "number" },
    ],
  };
  return `data:application/json;base64,${bytes(JSON.stringify(meta))}`;
}

function UriBlock({
  title,
  info,
  strings,
  common,
  n,
  showText,
}: {
  title: string;
  info: UriInfo;
  strings: NftUriStrings;
  common: CommonStrings;
  n: Intl.NumberFormat;
  showText: boolean;
}) {
  return (
    <section className="min-w-0">
      <h3 className="mb-2 font-heading text-base font-semibold">{title}</h3>
      <dl>
        <div className="flex flex-col gap-1 border-b border-border pb-3">
          <dt className="text-sm text-muted-foreground">{strings.storage}</dt>
          <dd className="text-sm">{strings.schemes[info.scheme]}</dd>
        </div>
        {info.mediaType && <ValueRow label={strings.mediaType} value={info.mediaType} common={common} />}
        {info.bytes !== null && (
          <div className="flex flex-col gap-1 border-t border-border py-3">
            <dt className="text-sm text-muted-foreground">{strings.decodedSize}</dt>
            <dd className="text-sm">{fill(strings.bytes, { bytes: n.format(info.bytes) })}</dd>
          </div>
        )}
        {info.scheme !== "data" && info.scheme !== "script" && (
          <ValueRow label={title} value={info.uri} common={common} />
        )}
        {info.gateways.map((g, i) => (
          <ValueRow
            key={g}
            label={fill(strings.gateway, { n: i + 1 })}
            value={g}
            note={i === 0 ? strings.gatewayHelp : undefined}
            common={common}
          />
        ))}
      </dl>
      {showText && info.text !== null && !info.mediaType?.includes("json") && (
        <details className="mt-3">
          <summary className="cursor-pointer text-sm font-medium">{strings.decodedText}</summary>
          <pre className="technical mt-2 max-h-72 overflow-auto rounded-xl bg-muted p-3 text-xs whitespace-pre-wrap break-all">
            {info.text}
          </pre>
        </details>
      )}
    </section>
  );
}

export function NftUriDecoder({
  strings,
  common,
  locale,
}: {
  strings: NftUriStrings;
  common: CommonStrings;
  locale: string;
}) {
  const id = useId();
  const [text, setText] = useState("");
  const [tokenId, setTokenId] = useState("");
  const result = text.trim() ? decodeNft(text, tokenId) : null;
  const v = result?.ok ? result.value : null;
  const err = result && !result.ok ? result.error : null;
  const n = new Intl.NumberFormat(locale);
  const meta = v?.metadata;

  return (
    <Panel>
      <label htmlFor={`${id}-input`} className="mb-1.5 block text-sm font-medium">
        {strings.label}
      </label>
      <textarea
        id={`${id}-input`}
        rows={4}
        autoComplete="off"
        spellCheck={false}
        dir="ltr"
        value={text}
        placeholder={strings.placeholder}
        aria-invalid={(err && err !== "token-id") || undefined}
        aria-describedby={`${id}-error ${id}-hint`}
        onChange={(e) => setText(e.target.value)}
        className={`${inputClass} technical resize-y text-sm`}
      />
      <p id={`${id}-hint`} className="mt-1.5 text-xs text-muted-foreground">
        {strings.hint}
      </p>
      <FieldError id={`${id}-error`}>{err && err !== "token-id" ? strings.errors[err] : ""}</FieldError>
      <div className="mt-3 max-w-md">
        <label htmlFor={`${id}-token`} className="mb-1.5 block text-sm font-medium">
          {strings.tokenId}
        </label>
        <input
          id={`${id}-token`}
          autoComplete="off"
          dir="ltr"
          value={tokenId}
          inputMode="numeric"
          aria-invalid={err === "token-id" || undefined}
          aria-describedby={`${id}-token-error ${id}-token-hint`}
          onChange={(e) => setTokenId(e.target.value)}
          className={`${inputClass} technical`}
        />
        <p id={`${id}-token-hint`} className="mt-1.5 text-xs text-muted-foreground">
          {strings.tokenIdHint}
        </p>
        <FieldError id={`${id}-token-error`}>{err === "token-id" ? strings.errors["token-id"] : ""}</FieldError>
      </div>

      {v && (
        <div className="mt-5 grid gap-6 border-t border-border pt-5" aria-live="polite">
          {v.findings.length > 0 && (
            <section aria-labelledby={`${id}-findings`}>
              <h2 id={`${id}-findings`} className="mb-3 font-heading text-lg font-semibold">
                {strings.findingsTitle}
              </h2>
              <ul className="grid gap-2" data-testid="nft-findings">
                {v.findings.map((f) => (
                  <li key={`${f.code}-${f.field}`}>
                    <Notice tone={f.tone} title={`${strings.fields[f.field]}: ${strings.findings[f.code].title}`}>
                      {strings.findings[f.code].body}
                    </Notice>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {v.source && (
            <UriBlock title={strings.sourceTitle} info={v.source} strings={strings} common={common} n={n} showText />
          )}

          {meta && (
            <section aria-labelledby={`${id}-meta`}>
              <h2 id={`${id}-meta`} className="mb-3 font-heading text-lg font-semibold">
                {strings.metadataTitle}
              </h2>
              <div className="grid gap-5 md:grid-cols-[minmax(0,1fr)_12rem]">
                <dl className="min-w-0">
                  {meta.name !== null && (
                    <ValueRow label={strings.name} value={meta.name} technical={false} common={common} />
                  )}
                  {meta.description !== null && (
                    <ValueRow label={strings.description} value={meta.description} technical={false} common={common} />
                  )}
                  {meta.externalUrl !== null && (
                    <ValueRow label={strings.externalUrl} value={meta.externalUrl} common={common} />
                  )}
                  {meta.otherKeys.length > 0 && (
                    <div className="flex flex-col gap-1 border-t border-border py-3">
                      <dt className="text-sm text-muted-foreground">{strings.otherKeys}</dt>
                      <dd className="technical text-sm break-all">{meta.otherKeys.join(", ")}</dd>
                    </div>
                  )}
                </dl>
                <figure className="text-sm">
                  {v.image?.preview ? (
                    // A data: image in an <img> can't run scripts or load anything; nothing is fetched.
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={v.image.preview}
                      alt={fill(strings.imagePreview, { name: meta.name ?? "" })}
                      className="aspect-square w-full rounded-xl border border-border bg-muted object-contain"
                    />
                  ) : (
                    <p className="flex aspect-square items-center justify-center rounded-xl border border-dashed border-border p-3 text-center text-muted-foreground">
                      {strings.noPreview}
                    </p>
                  )}
                  <figcaption className="mt-1 text-xs text-muted-foreground">{strings.imagePreviewHelp}</figcaption>
                </figure>
              </div>

              <h3 className="mt-5 mb-2 font-heading text-base font-semibold">{strings.traitsTitle}</h3>
              {meta.attributes.length ? (
                <div className="overflow-x-auto">
                  <table className="w-full text-start text-sm" data-testid="nft-traits">
                    <thead>
                      <tr className="text-muted-foreground">
                        <th scope="col" className="py-2 pe-4 text-start font-medium">
                          {strings.trait}
                        </th>
                        <th scope="col" className="py-2 text-start font-medium">
                          {strings.value}
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {meta.attributes.map((a, i) => (
                        <tr key={i} className="border-t border-border">
                          <td className="py-2 pe-4">{a.trait || "—"}</td>
                          <td className="py-2 break-all">{a.value}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">{strings.noTraits}</p>
              )}
            </section>
          )}

          {(v.image || v.animation) && (
            <div className="grid gap-6 md:grid-cols-2">
              {v.image && (
                <UriBlock title={strings.image} info={v.image} strings={strings} common={common} n={n} showText />
              )}
              {v.animation && (
                <UriBlock
                  title={strings.animation}
                  info={v.animation}
                  strings={strings}
                  common={common}
                  n={n}
                  showText
                />
              )}
            </div>
          )}

          {meta && (
            <details>
              <summary className="cursor-pointer text-sm font-medium">{strings.rawJson}</summary>
              <pre className="technical mt-2 max-h-72 overflow-auto rounded-xl bg-muted p-3 text-xs whitespace-pre-wrap break-all">
                {meta.pretty}
              </pre>
            </details>
          )}
        </div>
      )}

      <p className="mt-4 text-sm text-muted-foreground">{strings.note}</p>
      <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-border pt-4">
        <p className="text-sm text-muted-foreground">{strings.local}</p>
        <div className="flex gap-4">
          <LinkButton
            onClick={() => {
              setText(exampleUri());
              setTokenId("");
            }}
          >
            {common.example}
          </LinkButton>
          <LinkButton
            onClick={() => {
              setText("");
              setTokenId("");
            }}
          >
            {common.clear}
          </LinkButton>
        </div>
      </div>
    </Panel>
  );
}
