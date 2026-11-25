"use client";

import { useId, useState } from "react";
import { toDisplay } from "@/lib/math/decimal";
import {
  type CommonStrings,
  FieldError,
  Figure,
  LinkButton,
  NumberField,
  Panel,
  ValueRow,
  fill,
  inputClass,
} from "../shared/ui";
import { type CalldataError, type PriceError, calldataGas, gasCost, readCalldata } from "./calldata";

export interface CalldataStrings {
  label: string;
  placeholder: string;
  create: string;
  createHint: string;
  bytes: string;
  bytesValue: string;
  tokens: string;
  tokensHelp: string;
  dataGas: string;
  dataGasHelp: string;
  createGas: string;
  intrinsic: string;
  intrinsicHelp: string;
  floor: string;
  floorHelp: string;
  floorApplies: string;
  floorNever: string;
  selector: string;
  decode: string;
  gas: string;
  costTitle: string;
  gwei: string;
  gweiHint: string;
  coinPrice: string;
  coinPriceHint: string;
  costIntrinsic: string;
  costFloor: string;
  costNative: string;
  note: string;
  local: string;
  errors: Record<CalldataError, string>;
  priceErrors: Record<Exclude<PriceError, "empty">, string>;
}

const EXAMPLE =
  "0xa9059cbb000000000000000000000000d8da6bf26964af9d7eed9e03e53415d37aa9604500000000000000000000000000000000000000000000000000000000000f4240";

export function CalldataGas({
  strings,
  common,
  locale,
  decoderPath,
}: {
  strings: CalldataStrings;
  common: CommonStrings;
  locale: string;
  decoderPath: string;
}) {
  const id = useId();
  const [text, setText] = useState("");
  const [create, setCreate] = useState(false);
  const [gwei, setGwei] = useState("");
  const [price, setPrice] = useState("");
  const read = text.trim() ? readCalldata(text) : null;
  const g = read?.ok ? calldataGas(read.bytes, { create }) : null;
  const n = new Intl.NumberFormat(locale);
  const gas = (v: bigint) => fill(strings.gas, { gas: n.format(v) });
  const costs =
    g && gwei.trim() ? { intrinsic: gasCost(g.intrinsic, gwei, price), floor: gasCost(g.floor, gwei, price) } : null;
  const costErr = costs && !costs.intrinsic.ok ? costs.intrinsic : null;
  const priceError = (field: "gwei" | "price") =>
    costErr && costErr.field === field && costErr.error !== "empty" ? strings.priceErrors[costErr.error] : undefined;
  const coin = (c: ReturnType<typeof gasCost>) =>
    c.ok
      ? `${toDisplay(c.value.native, { places: 6, significant: 4, locale })}${c.value.usd ? ` · $${toDisplay(c.value.usd, { places: 2, significant: 3, locale })}` : ""}`
      : null;

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
        aria-invalid={(read && !read.ok) || undefined}
        aria-describedby={`${id}-error`}
        onChange={(e) => setText(e.target.value)}
        className={`${inputClass} technical resize-y text-sm`}
      />
      <FieldError id={`${id}-error`}>{read && !read.ok ? strings.errors[read.error] : ""}</FieldError>
      <label className="mt-2 flex min-h-11 items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={create}
          onChange={(e) => setCreate(e.target.checked)}
          aria-describedby={`${id}-create-hint`}
          className="size-4 accent-primary"
        />
        {strings.create}
      </label>
      <p id={`${id}-create-hint`} className="text-xs text-muted-foreground">
        {strings.createHint}
      </p>

      {g && (
        <div className="mt-5 border-t border-border pt-5" aria-live="polite">
          <div className="grid gap-3 sm:grid-cols-2">
            <Figure
              label={strings.intrinsic}
              value={gas(g.intrinsic)}
              help={strings.intrinsicHelp}
              copy={g.intrinsic.toString()}
              common={common}
            />
            <Figure
              label={strings.floor}
              value={gas(g.floor)}
              help={strings.floorHelp}
              copy={g.floor.toString()}
              common={common}
            />
          </div>
          <p className="mt-3 rounded-xl bg-muted px-3 py-2 text-sm" data-testid="calldata-floor">
            {g.floorAppliesBelow > 0n
              ? fill(strings.floorApplies, { gas: n.format(g.floorAppliesBelow) })
              : strings.floorNever}
          </p>
          <dl className="mt-4">
            <div className="flex flex-col gap-1 border-b border-border pb-3">
              <dt className="text-sm text-muted-foreground">{strings.bytes}</dt>
              <dd className="text-sm">
                {fill(strings.bytesValue, {
                  bytes: n.format(g.bytes),
                  zero: n.format(g.zeroBytes),
                  nonZero: n.format(g.nonZeroBytes),
                })}
              </dd>
            </div>
            <ValueRow label={strings.tokens} value={g.tokens.toString()} note={strings.tokensHelp} common={common} />
            <ValueRow label={strings.dataGas} value={g.dataGas.toString()} note={strings.dataGasHelp} common={common} />
            {create && <ValueRow label={strings.createGas} value={g.createGas.toString()} common={common} />}
            {g.selector && (
              <ValueRow
                label={strings.selector}
                value={g.selector}
                note={
                  <a
                    href={`${decoderPath}#data=${g.bytes <= 8_000 ? `0x${text.replace(/\s+/g, "").replace(/^0x/i, "")}` : ""}`}
                    className="font-medium text-primary underline-offset-4 hover:underline"
                  >
                    {strings.decode}
                  </a>
                }
                common={common}
              />
            )}
          </dl>

          <section aria-labelledby={`${id}-cost`} className="mt-5 border-t border-border pt-5">
            <h2 id={`${id}-cost`} className="mb-3 font-heading text-lg font-semibold">
              {strings.costTitle}
            </h2>
            <div className="grid gap-5 sm:grid-cols-2">
              <NumberField
                id={`${id}-gwei`}
                label={strings.gwei}
                hint={strings.gweiHint}
                unit="gwei"
                value={gwei}
                onChange={setGwei}
                error={priceError("gwei")}
              />
              <NumberField
                id={`${id}-price`}
                label={strings.coinPrice}
                hint={strings.coinPriceHint}
                unit="USD"
                value={price}
                onChange={setPrice}
                error={priceError("price")}
              />
            </div>
            {costs?.intrinsic.ok && costs.floor.ok && (
              <dl className="mt-4">
                <ValueRow
                  label={strings.costIntrinsic}
                  value={coin(costs.intrinsic)!}
                  note={strings.costNative}
                  common={common}
                />
                <ValueRow label={strings.costFloor} value={coin(costs.floor)!} common={common} />
              </dl>
            )}
          </section>
        </div>
      )}

      <p className="mt-4 text-sm text-muted-foreground">{strings.note}</p>
      <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-border pt-4">
        <p className="text-sm text-muted-foreground">{strings.local}</p>
        <div className="flex gap-4">
          <LinkButton
            onClick={() => {
              setText(EXAMPLE);
              setCreate(false);
              setGwei("2");
              setPrice("");
            }}
          >
            {common.example}
          </LinkButton>
          <LinkButton
            onClick={() => {
              setText("");
              setCreate(false);
              setGwei("");
              setPrice("");
            }}
          >
            {common.clear}
          </LinkButton>
        </div>
      </div>
    </Panel>
  );
}
