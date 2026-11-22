import "server-only";
import { getTranslations } from "next-intl/server";
import { getGuides } from "@/content/learn";
import type { Locale } from "@/i18n/locales";
import { learnPath } from "@/lib/routes";
import type { GuideCardData } from "./guide-card";

/** Card data for every guide, in the visitor's language (English where a guide isn't translated yet). */
export async function guideCards(locale: Locale): Promise<GuideCardData[]> {
  const t = await getTranslations();
  return getGuides(locale).map((guide) => ({
    slug: guide.slug,
    href: learnPath(locale, guide.slug),
    topic: guide.topic,
    topicLabel: t(`learn.topics.${guide.topic}`),
    title: guide.title,
    summary: guide.summary,
    readTime: t("learn.readTime", { minutes: guide.minutes }),
    toolLine: `${t("learn.toolLabel")} ${guide.tool ? t(`tools.${guide.tool}.name`) : t("learn.noTool")}`,
  }));
}
