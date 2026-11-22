import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { locale as localeParam } from "next/root-params";
import { getTranslations } from "next-intl/server";
import { isLocale } from "@/i18n/locales";
import { pageAlternates } from "@/lib/metadata";

const docs = ["privacy", "terms", "risk"] as const;
type LegalDoc = (typeof docs)[number];
const isDoc = (value: string): value is LegalDoc => (docs as readonly string[]).includes(value);

export function generateStaticParams() {
  return docs.map((doc) => ({ doc }));
}

export async function generateMetadata({ params }: PageProps<"/[locale]/legal/[doc]">): Promise<Metadata> {
  const [{ doc }, locale] = await Promise.all([params, localeParam()]);
  if (!isDoc(doc) || !isLocale(locale)) return {};
  const t = await getTranslations(`legal.${doc}`);
  return { title: t("title"), description: t("description"), ...pageAlternates(locale, `/legal/${doc}`) };
}

export default async function LegalPage({ params }: PageProps<"/[locale]/legal/[doc]">) {
  const [{ doc }, locale] = await Promise.all([params, localeParam()]);
  if (!isDoc(doc) || !isLocale(locale)) notFound();
  const t = await getTranslations("legal");
  const paragraphs = t.raw(`${doc}.body`) as string[];

  return (
    <article className="mx-auto max-w-2xl px-4 py-10 sm:px-6">
      <h1 className="text-3xl font-bold">{t(`${doc}.title`)}</h1>
      <p role="note" className="mt-4 rounded-lg border border-high/40 p-3 text-sm">
        {t("draftNotice")}
      </p>
      <div className="mt-6 flex flex-col gap-4 leading-relaxed">
        {paragraphs.map((paragraph) => (
          <p key={paragraph}>{paragraph}</p>
        ))}
      </div>
    </article>
  );
}
