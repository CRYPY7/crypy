import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { locale as localeParam } from "next/root-params";
import { isLocale } from "@/i18n/locales";
import { localePath } from "@/lib/routes";

export default async function NotFound() {
  const raw = await localeParam();
  const locale = isLocale(raw) ? raw : "en";
  const t = await getTranslations({ locale, namespace: "notFound" });
  return (
    <div className="mx-auto max-w-xl px-4 py-24 text-center">
      <h1 className="text-3xl font-bold">{t("title")}</h1>
      <p className="mt-3 text-muted-foreground">{t("text")}</p>
      <Link href={localePath(locale)} className="mt-6 inline-block font-semibold text-primary">
        {t("home")}
      </Link>
    </div>
  );
}
