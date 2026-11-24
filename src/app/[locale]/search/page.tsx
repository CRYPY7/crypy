import type { Metadata } from "next";
import { ChainIcon } from "@/components/chain-icon";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { locale as localeParam } from "next/root-params";
import { getTranslations } from "next-intl/server";
import { Suspense } from "react";
import { EntitySkeleton, Notice } from "@/components/entity/entity-parts";
import { isLocale } from "@/i18n/locales";
import { localePath } from "@/lib/routes";
import { pageRequestAllowed } from "@/server/page-guard";
import { cachedResolve } from "@/server/services/lookups";
import { observe } from "@/server/outcomes/record";
import { classifySearch } from "@/lib/outcomes/classify";

/**
 * /en/search?q=… — works without JavaScript and is the target of the search-engine
 * "site search" box. Resolves the input and redirects to the right page.
 */
export const metadata: Metadata = { robots: { index: false, follow: false } };

export default function SearchPage(props: PageProps<"/[locale]/search">) {
  return (
    <div className="mx-auto max-w-3xl px-4 py-10 sm:px-6">
      <Suspense fallback={<EntitySkeleton />}>
        <SearchResult {...props} />
      </Suspense>
    </div>
  );
}

async function SearchResult({ searchParams }: PageProps<"/[locale]/search">) {
  const [query, locale] = await Promise.all([searchParams, localeParam()]);
  if (!isLocale(locale)) notFound();
  const t = await getTranslations();
  const q = typeof query.q === "string" ? query.q.trim().slice(0, 200) : "";

  if (!q) return <Notice>{t("search.result.empty")}</Notice>;
  if (!(await pageRequestAllowed())) return <Notice tone="warning">{t("search.result.rate-limited")}</Notice>;

  const result = await observe("search", () => cachedResolve(q), classifySearch).catch(() => null);
  if (!result || result.status === "unavailable")
    return <Notice tone="warning">{t("search.result.unavailable")}</Notice>;
  if (result.status === "invalid") return <Notice tone="warning">{t("search.result.invalid")}</Notice>;
  if (result.status === "bad-checksum") {
    return (
      <Notice tone="danger">
        {t("search.result.bad-checksum")}{" "}
        <Link
          href={localePath(locale, `/address/${q.toLowerCase()}`)}
          prefetch={false}
          className="font-medium text-primary underline-offset-4 hover:underline"
        >
          {t("search.lookupAnyway")}
        </Link>
      </Notice>
    );
  }
  if (result.status === "not-found") return <Notice tone="warning">{t("search.result.not-found-tx")}</Notice>;
  if (result.target) redirect(localePath(locale, result.target));

  return (
    <div className="flex flex-col gap-4">
      <p>{t("search.result.choose")}</p>
      <ul className="flex flex-col gap-2">
        {result.choices.map((choice) => (
          <li key={choice.path}>
            <Link
              href={localePath(locale, choice.path)}
              className="block rounded-xl border bg-card p-4 font-semibold hover:border-primary"
            >
              <ChainIcon chain={choice.chain} size={18} className="me-2" />
              {t(`chains.${choice.chain}`)}
              <span className="ms-2 text-sm font-normal text-muted-foreground">
                {t(`search.found.kinds.${choice.lookup?.delegated ? "delegated" : choice.kind}`)}
                {choice.lookup?.token && ` · ${choice.lookup.token.symbol}`}
              </span>
            </Link>
          </li>
        ))}
      </ul>
      {result.status === "address" && (
        <Link href={localePath(locale, result.overview)} className="font-semibold text-primary hover:underline">
          {t("search.found.overview")}
        </Link>
      )}
    </div>
  );
}
