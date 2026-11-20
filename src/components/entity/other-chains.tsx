import Link from "next/link";
import { ChainIcon } from "@/components/chain-icon";
import { getTranslations } from "next-intl/server";
import type { ChainKey } from "@/config/chains";
import { getChain } from "@/config/chains";
import type { Locale } from "@/i18n/locales";
import { isActiveLookup } from "@/lib/chains/types";
import { formatAmount } from "@/lib/format/amount";
import { localePath } from "@/lib/routes";
import { cachedResolve } from "@/server/services/lookups";

/** "Same address on other chains": what this address is elsewhere, linked. Server-rendered. */
export async function OtherChains({
  address,
  current,
  locale,
}: {
  address: string;
  current: ChainKey;
  locale: Locale;
}) {
  const [t, result] = await Promise.all([getTranslations(), cachedResolve(address).catch(() => null)]);
  if (!result || result.status !== "address") return null;
  const others = result.lookups.filter((lookup) => lookup.chain !== current && isActiveLookup(lookup));

  return (
    <nav
      aria-label={t("entity.otherChains.label")}
      className="flex flex-wrap items-center gap-2 rounded-xl border bg-card px-4 py-3 text-sm"
    >
      <span className="text-muted-foreground">{t("entity.otherChains.label")}</span>
      {others.length === 0 && <span className="text-muted-foreground">{t("entity.otherChains.none")}</span>}
      {others.map((lookup) => {
        const kind = lookup.delegated ? "delegated" : lookup.kind;
        const path =
          lookup.kind === "token"
            ? `/token/${lookup.chain}/${result.address}`
            : `/address/${result.address}?chain=${lookup.chain}`;
        const balance = lookup.nativeBalance;
        const fact =
          lookup.kind === "token" && lookup.token
            ? lookup.token.symbol
            : balance && BigInt(balance.raw) > 0n
              ? `${formatAmount(balance.raw, balance.decimals, locale, 4)} ${getChain(lookup.chain)?.nativeSymbol ?? ""}`
              : null;
        return (
          <Link
            key={lookup.chain}
            href={localePath(locale, path)}
            prefetch={false}
            className="rounded-full border px-3 py-1.5 hover:border-primary"
          >
            <ChainIcon chain={lookup.chain} size={14} className="me-1.5" />
            {t(`chains.${lookup.chain}`)} · <span className="font-medium">{t(`entity.kinds.${kind}`)}</span>
            {fact && <span className="text-muted-foreground"> · {fact}</span>}
          </Link>
        );
      })}
      <Link
        href={localePath(locale, `/address/${result.address}`)}
        prefetch={false}
        className="ms-auto font-semibold text-primary hover:underline"
      >
        {t("entity.otherChains.overview")} →
      </Link>
    </nav>
  );
}
