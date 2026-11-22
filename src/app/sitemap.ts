import type { MetadataRoute } from "next";
import { siteUrl } from "@/config/env";
import { toolIds } from "@/config/tools";
import { guideMetas } from "@/content/learn";
import { selectableLocales } from "@/i18n/locales";

/** Only reviewed languages are listed, so search engines never index unfinished translations. */
export default function sitemap(): MetadataRoute.Sitemap {
  const paths: { path: string; lastModified?: string }[] = [
    ...[
      "",
      "/tools",
      "/legal/privacy",
      "/legal/terms",
      "/legal/risk",
      ...toolIds.map((id) => `/tools/${id}`),
      "/learn",
    ].map((path) => ({ path })),
    // Guides carry their real "updated" date, so search engines know when to read them again.
    ...guideMetas.map((guide) => ({ path: `/learn/${guide.slug}`, lastModified: guide.updated })),
  ];
  const complete = selectableLocales.filter((config) => config.status === "complete");
  return complete.flatMap((config) =>
    paths.map(({ path, lastModified }) => ({
      url: new URL(`/${config.code}${path}`, siteUrl).toString(),
      ...(lastModified ? { lastModified } : {}),
      alternates: {
        languages: Object.fromEntries(complete.map((c) => [c.code, new URL(`/${c.code}${path}`, siteUrl).toString()])),
      },
    })),
  );
}
