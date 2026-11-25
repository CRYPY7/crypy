"use client";

import { useId, useState } from "react";
import { TYPICAL_GAS } from "@/lib/gas/compute";
import { toDisplay } from "@/lib/math/decimal";
import { cn } from "@/lib/utils";
import { type CommonStrings, FieldError, LinkButton, Panel, ValueRow, fill, inputClass } from "../shared/ui";
import { type Field, type ManualFeeError, type PriceUnit, manualFee } from "./manual-fee";

export interface ManualFeeStrings {
  title: string;
  intro: string;
  gas: string;
  gasHint: string;
  typical: string;
  price: string;
  usd: string;
  usdHint: string;
  feeCoin: string;
  feeGwei: string;
  feeWei: string;
  feeUsd: string;
  noUsd: string;
  formula: string;
  limitNote: string;
  l1Note: string;
  local: string;
  errors: Record<ManualFeeError, string>;
}

const presets = ["sendCoin", "sendToken", "approve", "swap", "sendNft"] as const;
type Preset = (typeof presets)[number];

export function ManualFeeCalculator({
  strings,
  common,
  actions,
  coin,
  locale,
}: {
  strings: ManualFeeStrings;
  common: CommonStrings;
  actions: Record<Preset, string>;
  /** "ETH", "BNB"… on a chain's own page; "ETH / BNB / POL" on the tracker. */
  coin: string;
  locale: string;
}) {
  const id = useId();
  const [gas, setGas] = useState("");
  const [price, setPrice] = useState("");
  const [unit, setUnit] = useState<PriceUnit>("gwei");
  const [usd, setUsd] = useState("");
  const filled = gas.trim() !== "" && price.trim() !== "";
  const result = filled || usd.trim() ? manualFee({ gas, price, priceUnit: unit, usd }) : null;
  const errors: Partial<Record<Field, ManualFeeError>> = result && !result.ok ? result.errors : {};
  const typed: Record<Field, string> = { gas, price, usd };
  const value = result?.ok && filled ? result.value : null;
  const error = (field: Field) => {
    const code = errors[field];
    return typed[field].trim() && code ? strings.errors[code] : "";
  };

  return (
    <section aria-labelledby={`${id}-title`} className="mt-8">
      <Panel>
        <h2 id={`${id}-title`} className="font-heading text-lg font-semibold">
          {strings.title}
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">{strings.intro}</p>

        <div className="mt-5 grid gap-5 md:grid-cols-3">
          <div>
            <label htmlFor={`${id}-gas`} className="mb-1.5 block text-sm font-medium">
              {strings.gas}
            </label>
            <input
              id={`${id}-gas`}
              inputMode="numeric"
              autoComplete="off"
              dir="ltr"
              value={gas}
              placeholder="21000"
              aria-invalid={Boolean(error("gas")) || undefined}
              aria-describedby={`${id}-gas-hint ${id}-gas-error`}
              onChange={(e) => setGas(e.target.value)}
              className={`${inputClass} technical`}
            />
            <p id={`${id}-gas-hint`} className="mt-1.5 text-xs text-muted-foreground">
              {strings.gasHint}
            </p>
            <FieldError id={`${id}-gas-error`}>{error("gas")}</FieldError>
          </div>
          <div>
            <label htmlFor={`${id}-price`} className="mb-1.5 block text-sm font-medium">
              {strings.price}
            </label>
            <div className="flex gap-2">
              <input
                id={`${id}-price`}
                inputMode="decimal"
                autoComplete="off"
                dir="ltr"
                value={price}
                placeholder={unit === "gwei" ? "1.5" : "1500000000"}
                aria-invalid={Boolean(error("price")) || undefined}
                aria-describedby={`${id}-price-error`}
                onChange={(e) => setPrice(e.target.value)}
                className={`${inputClass} technical min-w-0`}
              />
              <select
                aria-label={strings.price}
                value={unit}
                onChange={(e) => setUnit(e.target.value as PriceUnit)}
                className="rounded-xl border border-input bg-card px-3 text-sm focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/25 focus-visible:outline-none"
              >
                <option value="gwei">gwei</option>
                <option value="wei">wei</option>
              </select>
            </div>
            <FieldError id={`${id}-price-error`}>{error("price")}</FieldError>
          </div>
          <div>
            <label htmlFor={`${id}-usd`} className="mb-1.5 block text-sm font-medium">
              {fill(strings.usd, { coin })}
            </label>
            <input
              id={`${id}-usd`}
              inputMode="decimal"
              autoComplete="off"
              dir="ltr"
              value={usd}
              placeholder="0.00"
              aria-invalid={Boolean(error("usd")) || undefined}
              aria-describedby={`${id}-usd-hint ${id}-usd-error`}
              onChange={(e) => setUsd(e.target.value)}
              className={`${inputClass} technical`}
            />
            <p id={`${id}-usd-hint`} className="mt-1.5 text-xs text-muted-foreground">
              {strings.usdHint}
            </p>
            <FieldError id={`${id}-usd-error`}>{error("usd")}</FieldError>
          </div>
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-2">
          <span className="text-sm text-muted-foreground">{strings.typical}</span>
          {presets.map((preset) => (
            <button
              key={preset}
              type="button"
              onClick={() => setGas(String(TYPICAL_GAS[preset]))}
              className={cn(
                "rounded-full border border-border px-3 py-1 text-xs hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/25 focus-visible:outline-none",
                gas === String(TYPICAL_GAS[preset]) && "border-primary text-primary",
              )}
            >
              {actions[preset]} · {TYPICAL_GAS[preset].toLocaleString(locale)}
            </button>
          ))}
        </div>

        <div aria-live="polite">
          {value && (
            <dl className="mt-5 border-t border-border pt-4">
              <ValueRow label={fill(strings.feeCoin, { coin })} value={value.native} common={common} />
              <ValueRow label={strings.feeGwei} value={value.gwei} common={common} />
              <ValueRow label={strings.feeWei} value={value.wei.toString()} common={common} />
              <ValueRow
                label={strings.feeUsd}
                value={value.usd ? `$${toDisplay(value.usd, { places: 2, significant: 2, locale })}` : strings.noUsd}
                technical={Boolean(value.usd)}
                common={common}
              />
            </dl>
          )}
        </div>

        <div className="mt-4 flex flex-col gap-1.5 border-t border-border pt-4 text-sm text-muted-foreground">
          <p>{strings.formula}</p>
          <p>{strings.limitNote}</p>
          <p>{strings.l1Note}</p>
          <p>{strings.local}</p>
        </div>
        <div className="mt-4 flex justify-end gap-4">
          <LinkButton
            onClick={() => {
              setGas("65000");
              setPrice("2");
              setUnit("gwei");
              setUsd("");
            }}
          >
            {common.example}
          </LinkButton>
          <LinkButton
            onClick={() => {
              setGas("");
              setPrice("");
              setUsd("");
            }}
          >
            {common.clear}
          </LinkButton>
        </div>
      </Panel>
    </section>
  );
}
