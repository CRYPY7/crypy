import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { locale as localeParam } from "next/root-params";
import { getTranslations } from "next-intl/server";
import { LanguageMenu } from "@/components/layout/header-controls";
import { ThemeChoice } from "@/components/settings/theme-choice";
import { isLocale, selectableLocales } from "@/i18n/locales";
import { pageAlternates } from "@/lib/metadata";

export async function generateMetadata(): Promise<Metadata> {
  const locale = await localeParam();
  if (!isLocale(locale)) return {};
  const t = await getTranslations("settings");
  return { title: t("title"), ...pageAlternates(locale, "/settings") };
}

export default async function SettingsPage() {
  const locale = await localeParam();
  if (!isLocale(locale)) notFound();
  const t = await getTranslations();

  return (
    <div className="mx-auto max-w-2xl px-4 py-10 sm:px-6">
      <h1 className="text-3xl font-bold">{t("settings.title")}</h1>

      <section className="mt-8 rounded-xl border bg-card p-5">
        <h2 className="font-sans text-lg font-semibold">{t("settings.languageTitle")}</h2>
        <p className="mt-1 mb-4 text-sm text-muted-foreground">{t("settings.languageText")}</p>
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
      </section>

      <section className="mt-6 rounded-xl border bg-card p-5">
        <h2 className="font-sans text-lg font-semibold">{t("settings.themeTitle")}</h2>
        <p className="mt-1 mb-4 text-sm text-muted-foreground">{t("settings.themeText")}</p>
        <ThemeChoice
          label={t("settings.themeTitle")}
          options={[
            { value: "dark", label: t("settings.dark") },
            { value: "light", label: t("settings.light") },
            { value: "system", label: t("settings.system") },
          ]}
        />
      </section>
    </div>
  );
}
