"use client";

import { useId, useState } from "react";
import { type Dec, toDisplay, toPlain } from "@/lib/math/decimal";
import { type CommonStrings, Figure, LinkButton, NumberField, Panel, ValueRow, fill } from "../shared/ui";
import { type Buy, MAX_BUYS, type ProfitError, profitCalc } from "./profit";

export interface ProfitStrings {
  buysTitle: string;
  buyAmount: string;
  buyPrice: string;
  buyLabel: string;
  addBuy: string;
  removeBuy: string;
  buyFees: string;
  buyFeesHint: string;
  sellPrice: string;
  sellPriceHint: string;
  sellFee: string;
  sellFeeHint: string;
  results: string;
  empty: string;
  profit: string;
  profitPercent: string;
  averageCost: string;
  averageCostHelp: string;
  breakEven: string;
  breakEvenHelp: string;
  amount: string;
  cost: string;
  saleValue: string;
  sellFeeUsd: string;
  priceChange: string;
  note: string;
  local: string;
  errors: Record<ProfitError, string>;
}

const EMPTY_BUY: Buy = { amount: "", price: "" };

export function ProfitCalculator({
  strings,
  common,
  locale,
}: {
  strings: ProfitStrings;
  common: CommonStrings;
  locale: string;
}) {
  const id = useId();
  const [buys, setBuys] = useState<Buy[]>([EMPTY_BUY]);
  const [buyFees, setBuyFees] = useState("");
  const [sellPrice, setSellPrice] = useState("");
  const [sellFee, setSellFee] = useState("");
  const touched = buys.some((b) => b.amount.trim() || b.price.trim()) || sellPrice.trim();
  const result = touched ? profitCalc({ buys, buyFees, sellPrice, sellFee }) : null;
  const errors: Partial<Record<string, ProfitError>> = result && !result.ok ? result.errors : {};
  const v = result?.ok ? result.value : null;
  const usd = (d: Dec) => {
    const text = toDisplay(d, { places: 2, significant: 4, locale });
    return text.startsWith("-") ? `-$${text.slice(1)}` : `$${text}`;
  };
  const pct = (d: Dec) => `${d.units > 0n ? "+" : ""}${toDisplay(d, { places: 2, significant: 3, locale })}%`;
  // An empty required box only gets its message once something else was typed in its row (or the sale price box).
  const shown = (key: string, value: string) =>
    errors[key] && (value.trim() || errors[key] === "half-row") && errors[key] !== "empty"
      ? strings.errors[errors[key]!]
      : "";
  const setBuy = (i: number, patch: Partial<Buy>) =>
    setBuys((list) => list.map((b, j) => (j === i ? { ...b, ...patch } : b)));
  const tone = v ? (v.profit.units > 0n ? "low" : v.profit.units < 0n ? "critical" : undefined) : undefined;

  return (
    <Panel>
      <fieldset>
        <legend className="mb-3 font-heading text-lg font-semibold">{strings.buysTitle}</legend>
        <ol className="grid gap-4">
          {buys.map((buy, i) => (
            <li key={i} className="grid items-start gap-3 sm:grid-cols-[1fr_1fr_auto]">
              <NumberField
                id={`${id}-amount-${i}`}
                label={fill(strings.buyAmount, { n: i + 1 })}
                value={buy.amount}
                onChange={(amount) => setBuy(i, { amount })}
                error={shown(`amount-${i}`, buy.amount)}
              />
              <NumberField
                id={`${id}-price-${i}`}
                label={fill(strings.buyPrice, { n: i + 1 })}
                value={buy.price}
                unit="USD"
                onChange={(price) => setBuy(i, { price })}
                error={shown(`price-${i}`, buy.price)}
              />
              {buys.length > 1 && (
                <div className="sm:pt-8">
                  <LinkButton onClick={() => setBuys((list) => list.filter((_, j) => j !== i))}>
                    <span aria-hidden="true">{strings.removeBuy}</span>
                    <span className="sr-only">{fill(strings.buyLabel, { n: i + 1 })}</span>
                  </LinkButton>
                </div>
              )}
            </li>
          ))}
        </ol>
        {buys.length < MAX_BUYS && (
          <div className="mt-3">
            <LinkButton onClick={() => setBuys((list) => [...list, EMPTY_BUY])}>{strings.addBuy}</LinkButton>
          </div>
        )}
      </fieldset>

      <div className="mt-5 grid gap-5 border-t border-border pt-5 sm:grid-cols-3">
        <NumberField
          id={`${id}-fees`}
          label={strings.buyFees}
          hint={strings.buyFeesHint}
          unit="USD"
          value={buyFees}
          onChange={setBuyFees}
          error={shown("buyFees", buyFees)}
        />
        <NumberField
          id={`${id}-sell`}
          label={strings.sellPrice}
          hint={strings.sellPriceHint}
          unit="USD"
          value={sellPrice}
          onChange={setSellPrice}
          error={shown("sellPrice", sellPrice)}
        />
        <NumberField
          id={`${id}-sell-fee`}
          label={strings.sellFee}
          hint={strings.sellFeeHint}
          unit="%"
          value={sellFee}
          onChange={setSellFee}
          error={shown("sellFee", sellFee)}
        />
      </div>

      <section aria-labelledby={`${id}-results`} aria-live="polite" className="mt-6 border-t border-border pt-5">
        <h2 id={`${id}-results`} className="font-heading text-lg font-semibold">
          {strings.results}
        </h2>
        {!v ? (
          <p className="mt-2 text-sm text-muted-foreground">
            {errors["amount-0"] === "no-buys" ? strings.errors["no-buys"] : strings.empty}
          </p>
        ) : (
          <>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <Figure
                label={strings.profit}
                value={usd(v.profit)}
                tone={tone}
                help={v.profitPercent ? fill(strings.profitPercent, { percent: pct(v.profitPercent) }) : undefined}
                copy={toPlain(v.profit)}
                common={common}
              />
              <Figure
                label={strings.breakEven}
                value={v.breakEven ? usd(v.breakEven) : null}
                help={strings.breakEvenHelp}
                copy={v.breakEven ? toPlain(v.breakEven) : null}
                common={common}
              />
            </div>
            <dl className="mt-4">
              <ValueRow
                label={strings.averageCost}
                value={usd(v.averageCost)}
                note={
                  v.priceChange
                    ? `${strings.averageCostHelp} ${fill(strings.priceChange, { percent: pct(v.priceChange) })}`
                    : strings.averageCostHelp
                }
                common={common}
              />
              <ValueRow
                label={strings.amount}
                value={toDisplay(v.amount, { places: 0, significant: 8, locale })}
                common={common}
              />
              <ValueRow label={strings.cost} value={usd(v.cost)} common={common} />
              <ValueRow label={strings.saleValue} value={usd(v.saleValue)} common={common} />
              {v.sellFeeUsd.units > 0n && (
                <ValueRow label={strings.sellFeeUsd} value={usd(v.sellFeeUsd)} common={common} />
              )}
            </dl>
          </>
        )}
        <p className="mt-4 text-sm text-muted-foreground">{strings.note}</p>
      </section>
      <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-border pt-4">
        <p className="text-sm text-muted-foreground">{strings.local}</p>
        <div className="flex gap-4">
          <LinkButton
            onClick={() => {
              setBuys([
                { amount: "0.5", price: "2400" },
                { amount: "0.5", price: "3200" },
              ]);
              setBuyFees("6");
              setSellPrice("3500");
              setSellFee("0.1");
            }}
          >
            {common.example}
          </LinkButton>
          <LinkButton
            onClick={() => {
              setBuys([EMPTY_BUY]);
              setBuyFees("");
              setSellPrice("");
              setSellFee("");
            }}
          >
            {common.clear}
          </LinkButton>
        </div>
      </div>
    </Panel>
  );
}
