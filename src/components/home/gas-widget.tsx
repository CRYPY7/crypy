"use client";

import { Fuel } from "lucide-react";
import Link from "next/link";
import { ChainIcon } from "@/components/chain-icon";
import { actionCost, formatFeeUsd, formatGwei } from "@/lib/gas/compute";
import { useGas } from "@/modules/tools/gas-tracker/use-gas";

/** Home page: current average fee per chain and what sending coins costs. Loads after the page, refreshes every 12 s. */
export function GasWidget({
  locale,
  href,
  labels,
}: {
  locale: string;
  href: string;
  labels: { title: string; send: string; open: string; gwei: string };
}) {
  const { report } = useGas(null);
  if (!report || report.chains.length === 0) return null;
  return (
    <div className="mt-6 inline-flex flex-wrap items-center justify-center gap-x-4 gap-y-2 rounded-xl border bg-card px-4 py-2.5 text-sm">
      <span className="flex items-center gap-1.5 text-muted-foreground">
        <Fuel aria-hidden="true" className="size-4 text-primary" />
        {labels.title}
      </span>
      {report.chains.map((c) => {
        const cost = actionCost("sendCoin", c.speeds.average, c.coinUsd, c.l1Fees?.sendCoin);
        return (
          <span key={c.chain} className="inline-flex items-center gap-1.5">
            <ChainIcon chain={c.chain} size={16} />
            <span className="font-semibold tabular-nums">
              {labels.gwei.replace("{value}", formatGwei(c.speeds.average, locale))}
            </span>
            {cost.usd !== null && (
              <span className="text-muted-foreground">
                {labels.send.replace("{usd}", formatFeeUsd(cost.usd, locale))}
              </span>
            )}
          </span>
        );
      })}
      <Link href={href} prefetch={false} className="font-medium text-primary hover:underline">
        {labels.open}
      </Link>
    </div>
  );
}
