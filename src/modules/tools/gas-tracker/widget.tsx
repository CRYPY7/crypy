"use client";

import { ChainIcon } from "@/components/chain-icon";
import { type GasAction, TYPICAL_GAS, actionCost, formatFeeUsd, formatGwei } from "@/lib/gas/compute";
import { cn } from "@/lib/utils";
import type { GasReport } from "@/server/services/gas";
import { useGas } from "./use-gas";

export type GasStrings = Record<string, string>;
export interface GasChainInfo {
  key: string;
  name: string;
  coin: string;
}

const fill = (text: string, vars: Record<string, string | number>) =>
  text.replace(/\{(\w+)\}/g, (m, k: string) => (k in vars ? String(vars[k]) : m));

function Spark({ values, label }: { values: number[]; label: string }) {
  if (values.length < 2) return null;
  const w = 220;
  const h = 48;
  const max = Math.max(...values);
  const min = Math.min(...values);
  const span = max - min || 1;
  const points = values
    .map((v, i) => `${((i / (values.length - 1)) * w).toFixed(1)},${(h - 4 - ((v - min) / span) * (h - 8)).toFixed(1)}`)
    .join(" ");
  return (
    <svg
      role="img"
      aria-label={label}
      width={w}
      height={h}
      viewBox={`0 0 ${w} ${h}`}
      className="max-w-full text-primary"
    >
      <polyline points={points} fill="none" stroke="currentColor" strokeWidth="2" />
    </svg>
  );
}

export function GasTracker({
  initial,
  strings: s,
  locale,
  chains,
}: {
  initial: GasReport;
  strings: GasStrings;
  locale: string;
  chains: GasChainInfo[];
}) {
  const { report, now } = useGas(initial);
  const info = (key: string) => chains.find((c) => c.key === key);
  const actions = Object.keys(TYPICAL_GAS) as GasAction[];
  const data = report ?? initial;
  const hours = (sec: number) =>
    sec >= 3600 ? fill(s.hours!, { n: (sec / 3600).toFixed(1) }) : fill(s.minutes!, { n: Math.round(sec / 60) });

  return (
    <div className="flex flex-col gap-5">
      {data.unavailable.map((c) => (
        <p key={c} role="alert" className="rounded-xl border border-high/50 bg-high/8 p-4 text-sm">
          {fill(s.chainDown!, { chain: info(c)?.name ?? c })}
        </p>
      ))}
      <div className="grid gap-4 lg:grid-cols-2">
        {data.chains.map((c) => {
          const chain = info(c.chain);
          const cards = [
            { key: "low", label: s.low, gwei: c.speeds.low, note: s.lowNote },
            { key: "average", label: s.average, gwei: c.speeds.average, note: s.averageNote },
            { key: "high", label: s.high, gwei: c.speeds.high, note: s.highNote },
          ];
          return (
            <section
              key={c.chain}
              aria-labelledby={`gas-${c.chain}`}
              className="flex flex-col gap-4 rounded-xl border bg-card p-5"
            >
              <div className="flex flex-wrap items-center gap-3">
                <ChainIcon chain={c.chain} size={26} />
                <h2 id={`gas-${c.chain}`} className="text-lg font-semibold">
                  {chain?.name ?? c.chain}
                </h2>
                <span className="ms-auto text-xs text-muted-foreground" aria-live="polite">
                  {fill(s.updated!, {
                    block: c.block.toLocaleString(locale),
                    seconds: now ? Math.max(0, Math.round((now - c.checkedAt) / 1000)) : 0,
                  })}
                </span>
              </div>
              <div className="grid grid-cols-3 gap-2">
                {cards.map((card) => {
                  const cost = actionCost("sendCoin", card.gwei, c.coinUsd, c.l1Fees?.sendCoin);
                  return (
                    <div
                      key={card.key}
                      className={cn(
                        "flex flex-col gap-1 rounded-lg border p-3",
                        card.key === "average" && "border-primary bg-primary/8",
                      )}
                    >
                      <span className="text-xs text-muted-foreground">{card.label}</span>
                      <span className="text-xl font-semibold tabular-nums">
                        {formatGwei(card.gwei, locale)}{" "}
                        <span className="text-xs font-normal text-muted-foreground">gwei</span>
                      </span>
                      <span className="text-xs">
                        {cost.usd !== null ? fill(s.toSend!, { usd: formatFeeUsd(cost.usd, locale) }) : "—"}
                      </span>
                      <span className="text-xs text-muted-foreground">{card.note}</span>
                    </div>
                  );
                })}
              </div>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="text-xs text-muted-foreground">{s.baseFee}</p>
                  <p className="font-semibold">
                    {c.speeds.baseFee !== null ? `${formatGwei(c.speeds.baseFee, locale)} gwei` : s.noBaseFee}
                  </p>
                </div>
                <div className="text-end">
                  <Spark values={c.trend.values} label={s.trendLabel!} />
                  <p className="text-xs text-muted-foreground">
                    {fill(c.trend.measure === "baseFee" ? s.trendBase! : s.trendTip!, {
                      span: c.trend.spanSeconds ? hours(c.trend.spanSeconds) : "—",
                    })}
                  </p>
                </div>
              </div>
            </section>
          );
        })}
      </div>

      <section aria-labelledby="gas-costs" className="rounded-xl border bg-card p-5">
        <h2 id="gas-costs" className="mb-3 text-base font-semibold">
          {s.costsTitle}
        </h2>
        {/* Scrolls sideways on phones; focusable so keyboard users can scroll it too. */}
        <div tabIndex={0} role="group" aria-labelledby="gas-costs" className="overflow-x-auto">
          <table className="w-full min-w-[36rem] text-sm">
            <thead>
              <tr className="text-xs text-muted-foreground">
                <th scope="col" className="py-2 text-start font-medium">
                  {s.action}
                </th>
                <th scope="col" className="py-2 text-end font-medium">
                  {s.typicalGas}
                </th>
                {data.chains.map((c) => (
                  <th key={c.chain} scope="col" className="py-2 ps-3 text-end font-medium">
                    {fill(s.onChain!, { chain: info(c.chain)?.name ?? c.chain })}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {actions.map((a) => (
                <tr key={a} className="border-t">
                  <th scope="row" className="py-2.5 text-start font-normal">
                    {s[`action_${a}`]}
                  </th>
                  <td className="py-2.5 text-end text-muted-foreground tabular-nums">
                    {TYPICAL_GAS[a].toLocaleString(locale)}
                  </td>
                  {data.chains.map((c) => {
                    const cost = actionCost(a, c.speeds.average, c.coinUsd, c.l1Fees?.[a]);
                    return (
                      <td key={c.chain} className="py-2.5 ps-3 text-end font-semibold whitespace-nowrap tabular-nums">
                        {cost.usd !== null
                          ? formatFeeUsd(cost.usd, locale)
                          : `${cost.coin.toPrecision(2)} ${info(c.chain)?.coin}`}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-3 text-xs text-muted-foreground">
          {data.chains.some((c) => c.l1Fees) &&
            `${fill(s.l1Note!, {
              chains: data.chains
                .filter((c) => c.l1Fees)
                .map((c) => info(c.chain)?.name ?? c.chain)
                .join(", "),
            })} `}
          {s.costsNote}{" "}
          {data.chains
            .filter((c) => c.coinUsd !== null)
            .map((c) => `${info(c.chain)?.name}: ${info(c.chain)?.coin} ${formatFeeUsd(c.coinUsd!, locale)}`)
            .join(" · ")}
        </p>
      </section>

      <p className="rounded-lg border border-dashed p-3 text-xs text-muted-foreground">
        <span className="font-semibold text-foreground">{s.howTitle}</span> {s.how}
      </p>
    </div>
  );
}
