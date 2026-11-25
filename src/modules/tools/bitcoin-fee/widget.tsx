"use client";

import { useId, useState } from "react";
import { type CommonStrings, Figure, LinkButton, NumberField, Panel, fill } from "../shared/ui";
import { type FeeError, type InputKind, type OutputKind, bitcoinFee, inputKinds, outputKinds } from "./fee";

export interface BitcoinFeeStrings {
  inputsTitle: string;
  outputsTitle: string;
  inputs: Record<InputKind, string>;
  outputs: Record<OutputKind, string>;
  rate: string;
  rateHint: string;
  price: string;
  priceHint: string;
  size: string;
  sizeValue: string;
  sizeHelp: string;
  fee: string;
  feeBtc: string;
  feeUsd: string;
  feeUsdHelp: string;
  sats: string;
  errors: Record<FeeError, string>;
  estimate: string;
  local: string;
}

export function BitcoinFee({
  strings,
  common,
  locale,
}: {
  strings: BitcoinFeeStrings;
  common: CommonStrings;
  locale: string;
}) {
  const id = useId();
  const [inputs, setInputs] = useState<Partial<Record<InputKind, string>>>({ p2wpkh: "1" });
  const [outputs, setOutputs] = useState<Partial<Record<OutputKind, string>>>({ p2wpkh: "2" });
  const [rate, setRate] = useState("");
  const [price, setPrice] = useState("");
  const result = rate.trim() ? bitcoinFee({ inputs, outputs, rate, price }) : null;
  const err = result && !result.ok ? result.error : null;
  const n = new Intl.NumberFormat(locale);

  return (
    <Panel>
      <div className="grid gap-5 sm:grid-cols-2">
        <fieldset>
          <legend className="mb-3 font-heading text-lg font-semibold">{strings.inputsTitle}</legend>
          <div className="grid gap-3">
            {inputKinds.map((k) => (
              <NumberField
                key={k}
                id={`${id}-in-${k}`}
                label={strings.inputs[k]}
                value={inputs[k] ?? ""}
                onChange={(v) => setInputs({ ...inputs, [k]: v })}
              />
            ))}
          </div>
        </fieldset>
        <fieldset>
          <legend className="mb-3 font-heading text-lg font-semibold">{strings.outputsTitle}</legend>
          <div className="grid gap-3">
            {outputKinds.map((k) => (
              <NumberField
                key={k}
                id={`${id}-out-${k}`}
                label={strings.outputs[k]}
                value={outputs[k] ?? ""}
                onChange={(v) => setOutputs({ ...outputs, [k]: v })}
              />
            ))}
          </div>
        </fieldset>
      </div>
      <div className="mt-5 grid gap-5 border-t border-border pt-5 sm:grid-cols-2">
        <NumberField
          id={`${id}-rate`}
          label={strings.rate}
          value={rate}
          onChange={setRate}
          unit="sat/vB"
          hint={strings.rateHint}
          error={err && err !== "price" ? strings.errors[err] : undefined}
        />
        <NumberField
          id={`${id}-price`}
          label={strings.price}
          value={price}
          onChange={setPrice}
          unit="USD"
          hint={strings.priceHint}
          error={err === "price" ? strings.errors.price : undefined}
        />
      </div>

      {result?.ok && (
        <div className="mt-5 grid gap-3 border-t border-border pt-5 sm:grid-cols-2" aria-live="polite">
          <Figure
            label={strings.size}
            value={fill(strings.sizeValue, { vbytes: n.format(result.value.vbytes) })}
            help={strings.sizeHelp}
            common={common}
          />
          <Figure
            label={strings.fee}
            value={fill(strings.sats, { sats: n.format(Number(result.value.feeSats)) })}
            copy={result.value.feeSats.toString()}
            common={common}
          />
          <Figure
            label={strings.feeBtc}
            value={`${result.value.feeBtc} BTC`}
            copy={result.value.feeBtc}
            common={common}
          />
          <Figure
            label={strings.feeUsd}
            value={result.value.feeUsd ? `$${result.value.feeUsd}` : null}
            help={strings.feeUsdHelp}
            common={common}
          />
        </div>
      )}
      {result?.ok && <p className="mt-3 text-sm text-muted-foreground">{strings.estimate}</p>}

      <div className="mt-4 flex justify-end gap-4 border-t border-border pt-4">
        <LinkButton
          onClick={() => {
            setInputs({ p2wpkh: "1" });
            setOutputs({ p2wpkh: "2" });
            setRate("12");
            setPrice("");
          }}
        >
          {common.example}
        </LinkButton>
        <LinkButton
          onClick={() => {
            setInputs({});
            setOutputs({});
            setRate("");
            setPrice("");
          }}
        >
          {common.clear}
        </LinkButton>
      </div>
      <p className="mt-4 text-sm text-muted-foreground">{strings.local}</p>
    </Panel>
  );
}
