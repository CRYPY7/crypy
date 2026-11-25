"use client";

import { useId, useState } from "react";
import { type Dec, toDisplay, toPlain } from "@/lib/math/decimal";
import { type CommonStrings, Figure, LinkButton, NumberField, Panel, ValueRow } from "../shared/ui";
import { type ImpactField, type SlipError, type ToleranceField, priceImpact, tolerance } from "./slippage";

export interface SlippageStrings {
  toleranceTitle: string;
  toleranceIntro: string;
  amount: string;
  amountHint: string;
  tolerance: string;
  toleranceHint: string;
  minReceived: string;
  minReceivedHelp: string;
  maxSent: string;
  maxSentHelp: string;
  impactTitle: string;
  impactIntro: string;
  reserveIn: string;
  reserveInHint: string;
  reserveOut: string;
  reserveOutHint: string;
  amountIn: string;
  amountInHint: string;
  fee: string;
  feeHint: string;
  amountOut: string;
  priceImpact: string;
  priceImpactHelp: string;
  totalCost: string;
  totalCostHelp: string;
  spotPrice: string;
  executionPrice: string;
  priceAfter: string;
  limits: string;
  local: string;
  empty: string;
  errors: Record<SlipError, string>;
}

const TOL: Record<ToleranceField, string> = { amount: "", tolerance: "" };
const IMP: Record<ImpactField, string> = { reserveIn: "", reserveOut: "", amountIn: "", fee: "" };

export function SlippageCalculator({
  strings,
  common,
  locale,
}: {
  strings: SlippageStrings;
  common: CommonStrings;
  locale: string;
}) {
  const id = useId();
  const [tol, setTol] = useState(TOL);
  const [imp, setImp] = useState(IMP);
  const num = (d: Dec, places = 6) => toDisplay(d, { places, significant: 6, locale });
  const pct = (d: Dec) => `${toDisplay(d, { places: 2, significant: 3, locale })}%`;

  const tolResult = tol.amount.trim() && tol.tolerance.trim() ? tolerance(tol) : null;
  const tolErrors = tolResult && !tolResult.ok ? tolResult.errors : {};
  const impReady = imp.reserveIn.trim() && imp.reserveOut.trim() && imp.amountIn.trim();
  const impResult = Object.values(imp).some((v) => v.trim()) ? priceImpact(imp) : null;
  const impErrors = impResult && !impResult.ok ? impResult.errors : {};
  const impValue = impReady && impResult?.ok ? impResult.value : null;
  const err = <F extends string>(errors: Partial<Record<F, SlipError>>, values: Record<F, string>, key: F) =>
    errors[key] && values[key].trim() ? strings.errors[errors[key]!] : "";

  return (
    <div className="flex flex-col gap-8">
      <section aria-labelledby={`${id}-tol`}>
        <Panel>
          <h2 id={`${id}-tol`} className="font-heading text-lg font-semibold">
            {strings.toleranceTitle}
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">{strings.toleranceIntro}</p>
          <div className="mt-5 grid gap-5 sm:grid-cols-2">
            {(["amount", "tolerance"] as const).map((key) => (
              <NumberField
                key={key}
                id={`${id}-${key}`}
                label={strings[key]}
                hint={strings[`${key}Hint`]}
                unit={key === "tolerance" ? "%" : undefined}
                value={tol[key]}
                onChange={(value) => setTol((s) => ({ ...s, [key]: value }))}
                error={err(tolErrors, tol, key)}
              />
            ))}
          </div>
          <div aria-live="polite">
            {tolResult?.ok && (
              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                <Figure
                  label={strings.minReceived}
                  value={num(tolResult.value.minReceived)}
                  help={strings.minReceivedHelp}
                  copy={toPlain(tolResult.value.minReceived)}
                  common={common}
                />
                <Figure
                  label={strings.maxSent}
                  value={num(tolResult.value.maxSent)}
                  help={strings.maxSentHelp}
                  copy={toPlain(tolResult.value.maxSent)}
                  common={common}
                />
              </div>
            )}
          </div>
          <div className="mt-4 flex justify-end gap-4">
            <LinkButton onClick={() => setTol({ amount: "1000", tolerance: "0.5" })}>{common.example}</LinkButton>
            <LinkButton onClick={() => setTol(TOL)}>{common.clear}</LinkButton>
          </div>
        </Panel>
      </section>

      <section aria-labelledby={`${id}-imp`}>
        <Panel>
          <h2 id={`${id}-imp`} className="font-heading text-lg font-semibold">
            {strings.impactTitle}
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">{strings.impactIntro}</p>
          <div className="mt-5 grid gap-5 sm:grid-cols-2">
            {(["reserveIn", "reserveOut", "amountIn", "fee"] as const).map((key) => (
              <NumberField
                key={key}
                id={`${id}-${key}`}
                label={strings[key]}
                hint={strings[`${key}Hint`]}
                unit={key === "fee" ? "%" : undefined}
                value={imp[key]}
                onChange={(value) => setImp((s) => ({ ...s, [key]: value }))}
                error={err(impErrors, imp, key)}
              />
            ))}
          </div>
          <div aria-live="polite">
            {!impValue ? (
              <p className="mt-4 text-sm text-muted-foreground">{strings.empty}</p>
            ) : (
              <>
                <div className="mt-4 grid gap-3 sm:grid-cols-2">
                  <Figure
                    label={strings.priceImpact}
                    value={pct(impValue.priceImpact)}
                    help={strings.priceImpactHelp}
                    tone={
                      Number(toPlain(impValue.priceImpact)) >= 5
                        ? "critical"
                        : Number(toPlain(impValue.priceImpact)) >= 1
                          ? "medium"
                          : "low"
                    }
                    copy={toPlain(impValue.priceImpact)}
                    common={common}
                  />
                  <Figure
                    label={strings.totalCost}
                    value={pct(impValue.totalCost)}
                    help={strings.totalCostHelp}
                    copy={toPlain(impValue.totalCost)}
                    common={common}
                  />
                </div>
                <dl className="mt-4">
                  <ValueRow label={strings.amountOut} value={num(impValue.amountOut)} common={common} />
                  <ValueRow label={strings.spotPrice} value={num(impValue.spotPrice, 8)} common={common} />
                  <ValueRow label={strings.executionPrice} value={num(impValue.executionPrice, 8)} common={common} />
                  <ValueRow label={strings.priceAfter} value={num(impValue.priceAfter, 8)} common={common} />
                </dl>
              </>
            )}
          </div>
          <p className="mt-4 rounded-xl bg-medium/14 px-3 py-2 text-sm text-medium">{strings.limits}</p>
          <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm text-muted-foreground">{strings.local}</p>
            <div className="flex gap-4">
              <LinkButton
                onClick={() => setImp({ reserveIn: "100000", reserveOut: "100000", amountIn: "1000", fee: "0.3" })}
              >
                {common.example}
              </LinkButton>
              <LinkButton onClick={() => setImp(IMP)}>{common.clear}</LinkButton>
            </div>
          </div>
        </Panel>
      </section>
    </div>
  );
}
