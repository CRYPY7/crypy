import Link from "next/link";
import { ChainIcon } from "@/components/chain-icon";
import type { Locale } from "@/i18n/locales";
import { getTranslations } from "next-intl/server";
import { formatAmount } from "@/lib/format/amount";
import { formatPrice, formatUsd } from "@/lib/format/money";
import type { ChainHoldings, Holding } from "@/lib/portfolio/holdings";
import { localePath } from "@/lib/routes";
import { MAX_TOKEN_PAGES } from "@/server/chains/evm/balances";
import type { AddressOverview } from "@/server/services/overview";
import { Notice } from "./entity-parts";

/**
 * Collapsed lists (tokens without a price, likely spam) show at most this many rows per chain. Big wallets hold
 * thousands of airdropped tokens: listing them all made the page 4 MB (0.5 MB compressed), slow on phones and far
 * from the server. The count in the heading stays complete, and a line says how many aren't listed.
 */
export const COLLAPSED_ROWS = 50;

/** Server-rendered holdings: no JavaScript is sent for this section. */
export async function TotalValue({
  overview,
  locale,
  label,
}: {
  overview: AddressOverview;
  locale: Locale;
  /** Heading, e.g. "Total value · all chains". */
  label?: string;
}) {
  const t = await getTranslations();
  const time = new Intl.DateTimeFormat(locale, { timeStyle: "short", timeZone: "UTC" }).format(
    new Date(overview.fetchedAt),
  );
  return (
    <section aria-labelledby="total-value" className="rounded-2xl border border-border bg-card p-5 sm:p-6">
      <h2 id="total-value" className="text-sm font-medium text-muted-foreground">
        {label ?? t("entity.address.balances.total")}
      </h2>
      {overview.pricesAvailable ? (
        <p className="mt-1 font-heading text-3xl font-bold tabular-nums sm:text-4xl">
          {formatUsd(overview.totalUsd, locale)}
        </p>
      ) : (
        <p className="mt-2 text-sm">{t("entity.address.balances.pricesUnavailable")}</p>
      )}
      {overview.pricesAvailable && overview.chains.length > 1 && (
        <ul className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-sm text-muted-foreground">
          {overview.chains.map((chain) => (
            <li key={chain.chain}>
              <ChainIcon chain={chain.chain} size={14} className="me-1" />
              {t(`chains.${chain.chain}`)}{" "}
              <span className="font-medium text-foreground tabular-nums">{formatUsd(chain.totalUsd, locale)}</span>
            </li>
          ))}
        </ul>
      )}
      {overview.chains.some((c) => overview.saved?.[c.chain] || overview.refreshing?.[c.chain]) && (
        <p className="mt-3 text-sm font-medium text-medium">
          {t("entity.freshness.totalIncludes", {
            chains: overview.chains
              .filter((c) => overview.saved?.[c.chain] || overview.refreshing?.[c.chain])
              .map((c) => t(`chains.${c.chain}`))
              .join(", "),
          })}
        </p>
      )}
      <p className="mt-3 text-xs text-muted-foreground">
        {t("entity.address.balances.totalNote")} {t("entity.address.balances.pricesBy")} ·{" "}
        {t("entity.address.balances.updated", { time: `${time} UTC` })}
      </p>
    </section>
  );
}

export async function ChainHoldingsSection({
  holdings,
  kindLabel,
  pricesAvailable,
  locale,
}: {
  holdings: ChainHoldings;
  kindLabel?: React.ReactNode;
  pricesAvailable: boolean;
  locale: Locale;
}) {
  const t = await getTranslations();
  const chainName = t(`chains.${holdings.chain}`);
  // With prices available, the main table shows the native coin and priced tokens; the rest fold away.
  const main = pricesAvailable
    ? holdings.visible.filter((holding) => holding.kind === "native" || holding.valueUsd !== undefined)
    : holdings.visible;
  const unpriced = pricesAvailable ? holdings.visible.filter((holding) => !main.includes(holding)) : [];
  const onlyEmptyNative =
    holdings.visible.length === 1 && holdings.visible[0]!.amount.raw === "0" && holdings.hidden.length === 0;

  return (
    <section aria-labelledby={`holdings-${holdings.chain}`} className="flex flex-col gap-3">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h2 id={`holdings-${holdings.chain}`} className="flex items-center gap-2 font-sans text-lg font-semibold">
          <ChainIcon chain={holdings.chain} size={20} />
          {chainName}
          {kindLabel && <span className="ms-2 text-sm font-normal text-muted-foreground">{kindLabel}</span>}
        </h2>
        {pricesAvailable && (
          <p className="text-sm text-muted-foreground">
            {t("entity.address.balances.chainTotal", { chain: chainName })}{" "}
            <span className="font-semibold text-foreground tabular-nums">{formatUsd(holdings.totalUsd, locale)}</span>
          </p>
        )}
      </div>

      {/* While the list is still being read (B-035), the page's "still reading" notice says so instead. */}
      {holdings.coverage !== "full" && !holdings.completing && (
        <Notice tone="warning">
          {t(`entity.address.balances.coverage.${holdings.coverage}`, {
            chain: chainName,
            count: new Intl.NumberFormat(locale).format(holdings.checkedEntries ?? MAX_TOKEN_PAGES * 100),
          })}
        </Notice>
      )}

      {onlyEmptyNative ? (
        <p className="rounded-xl border border-dashed p-5 text-sm text-muted-foreground">
          {t("entity.address.balances.empty", { chain: chainName })}
        </p>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-border">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-start text-xs text-muted-foreground">
              <tr>
                <th scope="col" className="px-3 py-2.5 text-start font-medium sm:px-4">
                  {t("entity.address.balances.asset")}
                </th>
                <th scope="col" className="hidden px-4 py-2.5 text-end font-medium sm:table-cell">
                  {t("entity.address.balances.balance")}
                </th>
                <th scope="col" className="hidden px-4 py-2.5 text-end font-medium sm:table-cell">
                  {t("entity.address.balances.price")}
                </th>
                <th scope="col" className="px-4 py-2.5 text-end font-medium">
                  {t("entity.address.balances.value")}
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {main.map((holding) => (
                <HoldingRow key={holding.address ?? "native"} holding={holding} locale={locale} t={t} />
              ))}
            </tbody>
          </table>
        </div>
      )}

      {unpriced.length > 0 && (
        <details className="rounded-xl border border-border bg-card px-4 py-3">
          <summary className="cursor-pointer text-sm font-medium">
            {t("entity.address.balances.unpricedGroup", { count: unpriced.length })}
          </summary>
          <p className="mt-2 text-sm text-muted-foreground">{t("entity.address.balances.unpricedNote")}</p>
          <ul className="mt-3 flex flex-col divide-y divide-border text-sm">
            {unpriced.slice(0, COLLAPSED_ROWS).map((holding) => (
              <li key={holding.address} className="flex items-center justify-between gap-3 py-2">
                <span className="min-w-0">
                  <Link
                    href={localePath(locale, `/token/${holding.chain}/${holding.address}`)}
                    prefetch={false}
                    className="font-semibold text-primary underline-offset-4 hover:underline"
                  >
                    <bdi>{holding.symbol}</bdi>
                  </Link>{" "}
                  <span className="text-muted-foreground">
                    <bdi>{holding.name}</bdi>
                  </span>
                </span>
                <span dir="ltr" className="shrink-0 tabular-nums">
                  {formatAmount(holding.amount.raw, holding.amount.decimals, locale, 6)}
                </span>
              </li>
            ))}
          </ul>
          {unpriced.length > COLLAPSED_ROWS && (
            <p className="mt-2 text-sm text-muted-foreground">
              {t("entity.address.balances.moreNotListed", { count: unpriced.length - COLLAPSED_ROWS })}
            </p>
          )}
        </details>
      )}

      {holdings.hidden.length > 0 && (
        <details className="group rounded-xl border border-border bg-card px-4 py-3">
          <summary className="cursor-pointer text-sm font-medium">
            {t("entity.address.balances.hidden", { count: holdings.hidden.length })}
          </summary>
          <p className="mt-2 text-sm text-high">{t("entity.address.balances.hiddenNote")}</p>
          <ul className="mt-3 flex flex-col divide-y divide-border text-sm">
            {holdings.hidden.slice(0, COLLAPSED_ROWS).map((holding) => (
              <li key={holding.address} className="flex flex-wrap items-center justify-between gap-2 py-2">
                <span className="min-w-0">
                  <span className="font-medium">{holding.symbol}</span>{" "}
                  <span className="text-muted-foreground">{holding.name}</span>
                  <span className="technical block truncate text-xs text-muted-foreground">{holding.address}</span>
                </span>
                <span className="rounded-md bg-high/14 px-2 py-0.5 text-xs font-semibold text-high">
                  {t(`entity.address.balances.spam.${holding.spam!}`)}
                </span>
              </li>
            ))}
          </ul>
          {holdings.hidden.length > COLLAPSED_ROWS && (
            <p className="mt-2 text-sm text-muted-foreground">
              {t("entity.address.balances.moreNotListed", { count: holdings.hidden.length - COLLAPSED_ROWS })}
            </p>
          )}
        </details>
      )}
    </section>
  );
}

function HoldingRow({
  holding,
  locale,
  t,
}: {
  holding: Holding;
  locale: Locale;
  t: Awaited<ReturnType<typeof getTranslations>>;
}) {
  const amount = formatAmount(holding.amount.raw, holding.amount.decimals, locale, 6);
  const name = holding.kind === "native" ? t("entity.address.balances.nativeCoin") : holding.name;
  return (
    <tr>
      <td className="px-3 py-3 sm:px-4">
        {holding.kind === "token" && holding.address ? (
          <Link
            href={localePath(locale, `/token/${holding.chain}/${holding.address}`)}
            prefetch={false}
            className="font-semibold text-primary underline-offset-4 hover:underline"
          >
            {holding.symbol}
          </Link>
        ) : (
          <span className="font-semibold">{holding.symbol}</span>
        )}
        {name && <span className="block max-w-[14rem] truncate text-xs text-muted-foreground">{name}</span>}
      </td>
      <td className="hidden px-4 py-3 text-end tabular-nums sm:table-cell">
        <span dir="ltr">{amount}</span>
      </td>
      <td className="hidden px-4 py-3 text-end tabular-nums text-muted-foreground sm:table-cell">
        {holding.priceUsd !== undefined ? formatPrice(holding.priceUsd, locale) : "—"}
      </td>
      <td className="px-4 py-3 text-end tabular-nums">
        {/* On phones the balance sits under the value instead of in its own column. */}
        {holding.valueUsd === undefined ? (
          <span className="text-xs text-muted-foreground">{t("entity.address.balances.noPrice")}</span>
        ) : holding.valueUsd > 0 && holding.valueUsd < 0.01 ? (
          t("entity.address.balances.lessThanCent")
        ) : (
          formatUsd(holding.valueUsd, locale)
        )}
        <span dir="ltr" className="block text-xs text-muted-foreground sm:hidden">
          {amount}
        </span>
      </td>
    </tr>
  );
}
