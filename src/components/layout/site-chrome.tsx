import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { type Locale, localeConfigs, selectableLocales } from "@/i18n/locales";
import { localePath, toolPath } from "@/lib/routes";
import { AllToolsButton, LanguageMenu, ThemeToggle } from "./header-controls";
import { UniversalSearch } from "@/components/search/universal-search";
import { getSearchStrings } from "@/components/search/search-strings";
import { ConnectButton } from "@/wallets/connect-button";

export function Logo({ label }: { label: string }) {
  return (
    <span className="flex items-center gap-2.5">
      <svg width="28" height="28" viewBox="0 0 28 28" fill="none" aria-hidden="true" className="text-primary">
        <path d="M14 2 25 8v12L14 26 3 20V8z" stroke="currentColor" strokeWidth="2" />
        <path
          d="M9.5 14.5l3 3 6-7"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
      <span className="font-heading text-xl font-bold tracking-wider" translate="no">
        CRYPY
      </span>
      <span className="sr-only">{label}</span>
    </span>
  );
}

export async function SiteHeader({ locale }: { locale: Locale }) {
  const t = await getTranslations();
  const searchStrings = await getSearchStrings();

  return (
    <header className="z-40 border-b bg-background lg:sticky lg:top-0 lg:h-16">
      <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-3 px-4 py-3 sm:px-6 lg:h-full lg:max-w-none lg:flex-nowrap lg:px-5 lg:py-0">
        <Link href={localePath(locale)} className="rounded-md">
          <Logo label={t("nav.homeLink")} />
        </Link>
        <nav aria-label={t("nav.main")} className="hidden items-center gap-1 md:flex md:ms-2 lg:hidden">
          <AllToolsButton label={t("nav.allTools")} />
          <Link
            href={toolPath(locale, "portfolio")}
            className="rounded-lg px-3 py-2 text-sm font-medium text-muted-foreground hover:text-foreground"
          >
            {t("nav.portfolio")}
          </Link>
          <Link
            href={toolPath(locale, "watchlist")}
            className="rounded-lg px-3 py-2 text-sm font-medium text-muted-foreground hover:text-foreground"
          >
            {t("nav.watchlist")}
          </Link>
          <Link
            href={toolPath(locale, "gas-tracker")}
            className="rounded-lg px-3 py-2 text-sm font-medium text-muted-foreground hover:text-foreground"
          >
            {t("nav.gas")}
          </Link>
        </nav>
        <UniversalSearch
          locale={locale}
          variant="compact"
          strings={{ ...searchStrings, placeholder: t("search.compactPlaceholder") }}
          className="header-search order-last hidden w-full lg:order-none lg:ms-6 lg:block lg:w-auto lg:max-w-xl lg:min-w-48 lg:flex-1"
        />
        <div className="ms-auto flex shrink-0 items-center gap-2">
          <LanguageMenu
            current={locale}
            label={t("nav.language")}
            betaLabel={t("common.betaTranslation")}
            options={selectableLocales.map((config) => ({
              code: config.code,
              nativeName: config.nativeName,
              beta: config.status === "beta",
            }))}
          />
          <ThemeToggle label={t("nav.switchTheme")} />
          <ConnectButton label={t("wallet.connect")} connectingLabel={t("wallet.connecting")} />
        </div>
      </div>
    </header>
  );
}

export async function SiteFooter({ locale }: { locale: Locale }) {
  const t = await getTranslations();
  return (
    <footer className="mt-16 border-t">
      <div className="mx-auto flex max-w-6xl flex-wrap justify-between gap-x-8 gap-y-4 px-4 py-8 text-sm text-muted-foreground sm:px-6">
        <p className="max-w-md">{t("footer.disclaimer")}</p>
        <nav aria-label={t("nav.footer")} className="flex flex-wrap gap-x-5 gap-y-2">
          <Link href={localePath(locale, "/legal/privacy")} className="hover:text-foreground">
            {t("footer.privacy")}
          </Link>
          <Link href={localePath(locale, "/legal/terms")} className="hover:text-foreground">
            {t("footer.terms")}
          </Link>
          <Link href={localePath(locale, "/legal/risk")} className="hover:text-foreground">
            {t("footer.risk")}
          </Link>
          <Link href={localePath(locale, "/settings")} className="hover:text-foreground">
            {t("nav.settings")}
          </Link>
        </nav>
        <p className="w-full">
          <span className="sr-only">{t("footer.languages")}: </span>
          {selectableLocales.map((config, index) => (
            <span key={config.code} lang={config.code}>
              {index > 0 && " · "}
              <Link href={localePath(config.code)} hrefLang={config.code} className="hover:text-foreground">
                {config.nativeName}
              </Link>
            </span>
          ))}
        </p>
      </div>
    </footer>
  );
}

/** Shown on routes for languages that are not yet reviewed (development and RTL testing only). */
export async function LanguageNotice({ locale }: { locale: Locale }) {
  if (localeConfigs[locale].status === "complete") return null;
  const t = await getTranslations("common");
  return (
    <div role="note" className="border-b bg-muted px-4 py-2 text-center text-sm">
      {localeConfigs[locale].status === "beta" ? t("betaTranslation") : t("languageNotReady")}
    </div>
  );
}
