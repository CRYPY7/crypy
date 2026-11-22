import Link from "next/link";
import { notFound } from "next/navigation";
import { locale as localeParam } from "next/root-params";
import { getTranslations } from "next-intl/server";
import { FileText, Lock, ShieldCheck } from "lucide-react";
import { UniversalSearch } from "@/components/search/universal-search";
import { getSearchStrings } from "@/components/search/search-strings";
import { ChainIcon } from "@/components/chain-icon";
import { GasWidget } from "@/components/home/gas-widget";
import { RecentList } from "@/components/recent/recent";
import { chains } from "@/config/chains";
import { ToolIcon } from "@/components/tool-icon";
import { ToolsGrid } from "@/components/tools/tools-grid";
import { UseMyWalletLink } from "@/wallets/connect-button";
import { isLocale } from "@/i18n/locales";
import { localePath } from "@/lib/routes";
import { JsonLd } from "@/components/seo/json-ld";
import { siteUrl } from "@/config/env";
import { getCategoryLabels, getToolViews } from "@/lib/tools-view";

const goalStyle: Record<string, string> = {
  security: "bg-critical/12 text-critical",
  wallet: "bg-primary/12 text-primary",
  network: "bg-low/12 text-low",
};

export default async function HomePage() {
  const locale = await localeParam();
  if (!isLocale(locale)) notFound();

  const t = await getTranslations();
  const [tools, categories, searchStrings] = await Promise.all([
    getToolViews(locale),
    getCategoryLabels(),
    getSearchStrings(),
  ]);
  const featured = tools.filter((tool) => tool.featured);

  const trust = [
    { icon: Lock, title: t("home.trust.seedTitle"), text: t("home.trust.seedText") },
    { icon: ShieldCheck, title: t("home.trust.connectTitle"), text: t("home.trust.connectText") },
    { icon: FileText, title: t("home.trust.sourceTitle"), text: t("home.trust.sourceText") },
  ];

  const home = new URL(`/${locale}`, siteUrl).toString();
  return (
    <>
      <JsonLd
        data={[
          {
            "@context": "https://schema.org",
            "@type": "WebSite",
            name: t("meta.siteName"),
            url: home,
            inLanguage: locale,
            description: t("meta.description"),
            potentialAction: {
              "@type": "SearchAction",
              target: { "@type": "EntryPoint", urlTemplate: `${home}/search?q={search_term_string}` },
              "query-input": "required name=search_term_string",
            },
          },
          {
            "@context": "https://schema.org",
            "@type": "Organization",
            name: t("meta.siteName"),
            url: siteUrl.toString(),
            logo: new URL("/icon.svg", siteUrl).toString(),
          },
        ]}
      />
      <section data-page="home" className="mx-auto max-w-4xl px-4 pt-14 pb-12 text-center sm:px-6 md:pt-20">
        <p className="mb-4 text-xs font-semibold tracking-widest text-primary uppercase sm:text-sm">
          {t("home.eyebrow")}
        </p>
        <h1 className="text-balance text-4xl leading-tight font-bold tracking-tight sm:text-5xl">{t("home.title")}</h1>
        <p className="mx-auto mt-5 max-w-2xl text-pretty text-base text-muted-foreground sm:text-lg">
          {t("home.subtitle")}
        </p>

        <UniversalSearch strings={searchStrings} locale={locale} className="mx-auto mt-9 max-w-3xl" />

        <div className="mt-3 flex justify-center empty:hidden">
          <UseMyWalletLink label={t("wallet.useMyWallet")} locale={locale} />
        </div>
        <div className="mt-4 flex flex-wrap justify-center gap-2 text-sm text-muted-foreground">
          <span>{t("search.detects")}</span>
          <span className="rounded-full bg-muted px-2.5 text-foreground">{t("search.types.address")}</span>
          <span className="rounded-full bg-muted px-2.5 text-foreground">{t("search.types.token")}</span>
          <span className="rounded-full bg-muted px-2.5 text-foreground">{t("search.types.tx")}</span>
        </div>
        <div className="mt-3 flex flex-wrap items-center justify-center gap-3 text-sm text-muted-foreground">
          <span>{t("home.worksOn")}</span>
          {chains.map((chain) => (
            <span key={chain.key} className="inline-flex items-center gap-1.5 font-medium text-foreground">
              <ChainIcon chain={chain.key} size={18} />
              {t(`chains.${chain.key}`)}
            </span>
          ))}
        </div>
        {/* Space kept for the gas line, which loads after the page, so the text below doesn't jump. */}
        <div className="mt-6 flex min-h-[9.625rem] items-start justify-center sm:min-h-[6.125rem] lg:min-h-[4.375rem]">
          <GasWidget
            locale={locale}
            href={localePath(locale, "/tools/gas-tracker")}
            labels={{
              title: t("home.gas.title"),
              send: t("home.gas.send"),
              open: t("home.gas.open"),
              gwei: t("home.gas.gwei"),
            }}
          />
        </div>
        <RecentList title={t("nav.recent")} clear={t("nav.clearRecent")} locale={locale} />

        <ul className="mt-10 grid gap-3 text-start sm:grid-cols-3">
          {trust.map(({ icon: Icon, title, text }) => (
            <li key={title} className="flex items-start gap-3 rounded-xl border p-4">
              <Icon className="mt-0.5 size-5 shrink-0 text-low" aria-hidden="true" />
              <span>
                <span className="block font-semibold">{title}</span>
                <span className="block text-sm text-muted-foreground">{text}</span>
              </span>
            </li>
          ))}
        </ul>
      </section>

      <section aria-labelledby="goals-title" className="mx-auto max-w-7xl px-4 pb-10 sm:px-6">
        <h2 id="goals-title" className="text-2xl font-semibold sm:text-3xl">
          {t("home.goals.title")}
        </h2>
        <p className="mt-1 mb-5 text-muted-foreground">{t("home.goals.subtitle")}</p>
        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {featured.map((tool) => (
            <li key={tool.id}>
              <Link
                href={tool.href}
                className="flex h-full gap-4 rounded-2xl border border-border-strong bg-card p-5 transition-colors hover:border-primary/60"
              >
                <span
                  className={`grid size-12 shrink-0 place-items-center rounded-xl ${goalStyle[tool.category] ?? "bg-muted"}`}
                >
                  <ToolIcon name={tool.icon} className="size-6" />
                </span>
                <span className="flex min-w-0 flex-col gap-1">
                  <span className="font-heading text-lg leading-snug font-semibold">{tool.question}</span>
                  <span className="text-sm text-muted-foreground">{tool.description}</span>
                  <span className="mt-1 text-sm font-semibold text-primary">
                    {tool.cta}{" "}
                    <span aria-hidden="true" className="inline-block rtl:-scale-x-100">
                      →
                    </span>
                  </span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </section>

      <section aria-labelledby="all-tools-title" className="mx-auto max-w-7xl px-4 py-6 sm:px-6">
        <h2 id="all-tools-title" className="mb-4 text-2xl font-semibold sm:text-3xl">
          {t("home.allTools.title")}
        </h2>
        <ToolsGrid
          tools={tools}
          categories={categories}
          strings={{
            all: t("categories.all"),
            filterLabel: t("home.allTools.filterLabel"),
            youNeed: t("common.youNeed"),
            open: t("common.open"),
          }}
        />
      </section>
    </>
  );
}
