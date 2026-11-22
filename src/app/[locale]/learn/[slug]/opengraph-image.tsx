import { getTranslations } from "next-intl/server";
import { getGuide } from "@/content/learn";
import { guideSlugs } from "@/content/learn/slugs";
import { ogImage, ogSize } from "@/lib/og";

export const size = ogSize;
export const contentType = "image/png";
export const alt = "CRYPY guide";

export function generateStaticParams() {
  return guideSlugs.map((slug) => ({ slug }));
}

// English for every language until reviewed non-Latin fonts ship (M9), like the other preview images.
export default async function Image({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const guide = getGuide(slug, "en");
  const t = await getTranslations({ locale: "en", namespace: "learn" });
  if (!guide) return ogImage({ eyebrow: "CRYPY", title: t("title"), subtitle: t("intro") });
  return ogImage({
    eyebrow: `${t("topics." + guide.topic)} · ${t("readTime", { minutes: guide.minutes })}`,
    title: guide.title,
    subtitle: guide.summary,
  });
}
