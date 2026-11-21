import "server-only";
import type { Metadata } from "next";
import Link from "next/link";
import type { ReactNode } from "react";
import { getTranslations } from "next-intl/server";
import { CircleAlert } from "lucide-react";
import { JsonLd } from "@/components/seo/json-ld";
import { cn } from "@/lib/utils";
import { ToolIcon } from "@/components/tool-icon";
import { siteUrl } from "@/config/env";
import { type ToolDefinition, getTool } from "@/config/tools";
import type { Locale } from "@/i18n/locales";
import { ogImage } from "@/lib/og";
import { pageAlternates } from "@/lib/metadata";
import { localePath } from "@/lib/routes";

/**
 * Shared tool page: header, the working tool (when live), how-to, features, FAQ and structured data.
 * Working tools have their own route (app/[locale]/tools/<id>/) so each page downloads only its own tool code.
 */
export async function toolMetadata(id: string, locale: Locale): Promise<Metadata> {
  const tool = getTool(id);
  if (!tool) return {};
  const t = await getTranslations(`tools.${tool.id}`);
  return { title: t("name"), description: t("description"), ...pageAlternates(locale, `/tools/${tool.id}`) };
}

/** Open Graph image for a tool. Latin font only for now: English text until reviewed non-Latin fonts ship (M9). */
export async function toolOgImage(id: string) {
  const tool = getTool(id);
  const t = await getTranslations({ locale: "en" });
  if (!tool) return ogImage({ eyebrow: "CRYPY", title: t("meta.title"), subtitle: t("meta.description") });
  return ogImage({
    eyebrow: t(`categories.${tool.category}`),
    title: t(`tools.${tool.id}.question`),
    subtitle: t(`tools.${tool.id}.description`),
  });
}

/** Tools that never send what you type anywhere (the timestamp converter reads block times from the chain). */
const BROWSER_ONLY: readonly string[] = ["unit-converter", "hex-converter", "address-formatter", "tx-decoder"];

export async function ToolPage({
  tool,
  locale,
  children,
  wide = false,
}: {
  tool: ToolDefinition;
  locale: Locale;
  /** The working tool, for live tools. */
  children?: ReactNode;
  /** Wide tools (tables) use the full content width; reading text stays at a comfortable width. */
  wide?: boolean;
}) {
  const t = await getTranslations();
  const features = t.raw(`tools.${tool.id}.features`) as string[];
  const howTo = t.has(`tools.${tool.id}.howTo`) ? (t.raw(`tools.${tool.id}.howTo`) as string[]) : [];
  const faq = t.has(`tools.${tool.id}.faq`) ? (t.raw(`tools.${tool.id}.faq`) as { q: string; a: string }[]) : [];
  const live = tool.status === "live" && Boolean(children);

  const url = (path: string) => new URL(localePath(locale, path), siteUrl).toString();
  return (
    <article className={cn("mx-auto px-4 py-10 sm:px-6", wide ? "max-w-7xl" : "max-w-3xl")}>
      <JsonLd
        data={[
          {
            "@context": "https://schema.org",
            "@type": "BreadcrumbList",
            itemListElement: [
              { "@type": "ListItem", position: 1, name: t("meta.siteName"), item: url("") },
              { "@type": "ListItem", position: 2, name: t("toolPage.backToTools"), item: url("/tools") },
              { "@type": "ListItem", position: 3, name: t(`tools.${tool.id}.name`), item: url(`/tools/${tool.id}`) },
            ],
          },
          {
            "@context": "https://schema.org",
            "@type": "WebApplication",
            name: t(`tools.${tool.id}.name`),
            description: t(`tools.${tool.id}.description`),
            url: url(`/tools/${tool.id}`),
            applicationCategory: "FinanceApplication",
            operatingSystem: "Any",
            inLanguage: locale,
            isAccessibleForFree: true,
          },
          ...(faq.length > 0
            ? [
                {
                  "@context": "https://schema.org",
                  "@type": "FAQPage",
                  mainEntity: faq.map((item) => ({
                    "@type": "Question",
                    name: item.q,
                    acceptedAnswer: { "@type": "Answer", text: item.a },
                  })),
                },
              ]
            : []),
        ]}
      />
      <Link href={localePath(locale, "/tools")} className="text-sm text-muted-foreground hover:text-foreground">
        <span aria-hidden="true" className="inline-block rtl:-scale-x-100">
          ←
        </span>{" "}
        {t("toolPage.backToTools")}
      </Link>

      <header className="mt-6 flex items-start gap-4">
        <span className="grid size-14 shrink-0 place-items-center rounded-2xl bg-primary/12 text-primary">
          <ToolIcon name={tool.icon} className="size-7" />
        </span>
        <div>
          <p className="text-sm font-semibold tracking-wider text-muted-foreground uppercase">
            {t(`categories.${tool.category}`)}
          </p>
          <h1 className="text-3xl font-bold sm:text-4xl">{t(`tools.${tool.id}.name`)}</h1>
          <p className="mt-2 text-lg text-muted-foreground">{t(`tools.${tool.id}.question`)}</p>
        </div>
      </header>

      <p className="mt-6 max-w-3xl text-base">{t(`tools.${tool.id}.description`)}</p>
      {live ? (
        <>
          {BROWSER_ONLY.includes(tool.id) && (
            <p className="mt-2 text-sm text-muted-foreground">{t("toolPage.runsLocally")}</p>
          )}
          <section className="mt-6" aria-label={t(`tools.${tool.id}.name`)}>
            {children}
          </section>
        </>
      ) : (
        <>
          <p className="mt-2 text-sm text-muted-foreground">
            {t("common.youNeed")} <span className="text-foreground">{t(`tools.${tool.id}.input`)}</span>
          </p>
          {tool.requiresAccount && (
            <p className="mt-1 text-sm text-muted-foreground">{t("toolPage.requiresAccount")}</p>
          )}
          <div role="status" className="mt-8 flex gap-3 rounded-xl border border-border-strong bg-card p-5">
            <CircleAlert className="mt-0.5 size-5 shrink-0 text-high" aria-hidden="true" />
            <div>
              <h2 className="font-sans text-base font-semibold">{t("toolPage.notLiveTitle")}</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                {t("toolPage.notLiveText", { milestone: tool.milestone })}
              </p>
            </div>
          </div>
        </>
      )}

      {howTo.length > 0 && (
        <section className="mt-10 max-w-3xl">
          <h2 className="text-xl font-semibold">{t("toolPage.howToUse")}</h2>
          <ol className="mt-3 flex list-decimal flex-col gap-2 ps-5">
            {howTo.map((step) => (
              <li key={step}>{step}</li>
            ))}
          </ol>
        </section>
      )}

      <section className="mt-10 max-w-3xl">
        <h2 className="text-xl font-semibold">{t("toolPage.whatYouGet")}</h2>
        <ul className="mt-3 flex list-disc flex-col gap-2 ps-5">
          {features.map((feature) => (
            <li key={feature}>{feature}</li>
          ))}
        </ul>
      </section>

      {faq.length > 0 && (
        <section className="mt-10 max-w-3xl">
          <h2 className="text-xl font-semibold">{t("toolPage.faq")}</h2>
          <div className="mt-3 flex flex-col gap-2">
            {faq.map((item) => (
              <details key={item.q} className="group rounded-xl border border-border bg-card px-4 py-3">
                <summary className="cursor-pointer list-none font-medium marker:hidden">
                  <span className="flex items-center justify-between gap-3">
                    {item.q}
                    <span
                      aria-hidden="true"
                      className="text-muted-foreground transition-transform group-open:rotate-45"
                    >
                      +
                    </span>
                  </span>
                </summary>
                <p className="mt-2 text-muted-foreground">{item.a}</p>
              </details>
            ))}
          </div>
        </section>
      )}
    </article>
  );
}
