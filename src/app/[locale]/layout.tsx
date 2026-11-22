import type { Metadata, Viewport } from "next";
import { Inter, Space_Grotesk } from "next/font/google";
import { notFound } from "next/navigation";
import { locale as localeParam } from "next/root-params";
import { getTranslations } from "next-intl/server";
import "../globals.css";
import { Providers } from "@/components/providers";
import { LanguageNotice, SiteFooter, SiteHeader } from "@/components/layout/site-chrome";
import { ToolsSidebar, sidebarInitScript } from "@/components/layout/sidebar";
import { MobileTabBar } from "@/components/layout/mobile-tab-bar";
import { ToolsDialogLoader } from "@/components/layout/tools-dialog-loader";
import { ToolIcon } from "@/components/tool-icon";
import { siteUrl } from "@/config/env";
import { isLocale, localeConfigs, locales } from "@/i18n/locales";
import { pageAlternates } from "@/lib/metadata";
import { chains } from "@/config/chains";
import { WalletRoot } from "@/wallets/wallet-root";
import { learnPath, localePath, toolPath } from "@/lib/routes";
import { getCategoryLabels, getToolViews } from "@/lib/tools-view";

// Self-hosted at build time: no requests to Google from the visitor's browser.
const inter = Inter({ subsets: ["latin"], variable: "--font-inter", display: "swap" });
const spaceGrotesk = Space_Grotesk({
  subsets: ["latin"],
  weight: ["600", "700"],
  variable: "--font-space-grotesk",
  display: "swap",
});

export function generateStaticParams() {
  return locales.map((locale) => ({ locale }));
}

export async function generateMetadata(): Promise<Metadata> {
  const locale = await localeParam();
  if (!isLocale(locale)) return {};
  const t = await getTranslations("meta");
  return {
    metadataBase: siteUrl,
    title: { default: t("title"), template: `%s · ${t("siteName")}` },
    description: t("description"),
    applicationName: t("siteName"),
    ...pageAlternates(locale),
    openGraph: { siteName: t("siteName"), type: "website", locale },
  };
}

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: dark)", color: "#0b0d12" },
    { media: "(prefers-color-scheme: light)", color: "#f6f7f9" },
  ],
};

export default async function LocaleLayout({ children }: LayoutProps<"/[locale]">) {
  const locale = await localeParam();
  if (!isLocale(locale)) notFound();

  const t = await getTranslations();
  const [tools, categories] = await Promise.all([getToolViews(locale), getCategoryLabels()]);
  const icons = Object.fromEntries(
    tools.map((tool) => [tool.id, <ToolIcon key={tool.id} name={tool.icon} className="size-5" />]),
  );

  return (
    <html
      lang={locale}
      dir={localeConfigs[locale].dir}
      className={`${inter.variable} ${spaceGrotesk.variable}`}
      suppressHydrationWarning
    >
      <head>
        {/* Restores the collapsed sidebar before first paint (tiny, no network). */}
        <script dangerouslySetInnerHTML={{ __html: sidebarInitScript }} />
      </head>
      <body className="min-h-dvh">
        <Providers>
          <WalletRoot
            locale={locale}
            strings={{
              connect: t("wallet.connect"),
              connecting: t("wallet.connecting"),
              title: t("wallet.title"),
              intro: t("wallet.intro"),
              detected: t("wallet.detected"),
              noneDetected: t("wallet.noneDetected"),
              walletConnect: t("wallet.walletConnect"),
              walletConnectUnavailable: t("wallet.walletConnectUnavailable"),
              scanQr: t("wallet.scanQr"),
              openIn: t.raw("wallet.openIn") as string,
              copyLink: t("wallet.copyLink"),
              back: t("wallet.back"),
              connectedAs: t("wallet.connectedAs"),
              network: t("wallet.network"),
              unsupportedNetwork: t("wallet.unsupportedNetwork"),
              viewMyAddress: t("wallet.viewMyAddress"),
              disconnect: t("wallet.disconnect"),
              close: t("wallet.close"),
              rejected: t("wallet.rejected"),
              failed: t("wallet.failed"),
              chains: Object.fromEntries(chains.map((chain) => [chain.evmChainId, t(`chains.${chain.key}`)])),
            }}
          >
            <a
              href="#main"
              className="sr-only z-50 rounded-md bg-primary px-4 py-2 text-primary-foreground focus:not-sr-only focus:fixed focus:start-4 focus:top-4"
            >
              {t("common.skipToContent")}
            </a>
            {/* Phones and tablets: notice above the header. Desktop: inside the content column, so only the
                fixed header sits above the sidebar. */}
            <div className="lg:hidden">
              <LanguageNotice locale={locale} />
            </div>
            <SiteHeader locale={locale} />
            <div className="lg:flex">
              <ToolsSidebar locale={locale} />
              <div className="min-w-0 flex-1">
                <div className="hidden lg:block">
                  <LanguageNotice locale={locale} />
                </div>
                <main id="main" className="pb-24 md:pb-0">
                  {children}
                </main>
                <SiteFooter locale={locale} />
              </div>
            </div>
            <MobileTabBar
              strings={{
                label: t("nav.primary"),
                home: t("nav.home"),
                tools: t("nav.tools"),
                portfolio: t("nav.portfolio"),
                alerts: t("nav.alerts"),
                learn: t("nav.learn"),
              }}
              hrefs={{
                home: localePath(locale),
                portfolio: toolPath(locale, "portfolio"),
                alerts: toolPath(locale, "watchlist"),
                learn: learnPath(locale),
              }}
            />
            <ToolsDialogLoader
              tools={tools}
              categories={categories}
              icons={icons}
              strings={{
                title: t("toolsDialog.title"),
                description: t("toolsDialog.description"),
                searchLabel: t("toolsDialog.searchLabel"),
                searchPlaceholder: t("toolsDialog.searchPlaceholder"),
                noResults: t.raw("toolsDialog.noResults") as string,
                noWalletNeeded: t("toolsDialog.noWalletNeeded"),
                shortcut: t("toolsDialog.shortcut"),
                close: t("toolsDialog.close"),
              }}
            />
          </WalletRoot>
        </Providers>
      </body>
    </html>
  );
}
