import type { MetadataRoute } from "next";
import { siteUrl } from "@/config/env";
import { toolIds } from "@/config/tools";
import { selectableLocales } from "@/i18n/locales";

/** Only reviewed languages are listed, so search engines never index unfinished translations. */
export default function sitemap(): MetadataRoute.Sitemap {
  const paths = ["", "/tools", "/legal/privacy", "/legal/terms", "/legal/risk", ...toolIds.map((id) => `/tools/${id}`)];
  const complete = selectableLocales.filter((config) => config.status === "complete");
  return complete.flatMap((config) =>
    paths.map((path) => ({
      url: new URL(`/${config.code}${path}`, siteUrl).toString(),
      alternates: {
        languages: Object.fromEntries(complete.map((c) => [c.code, new URL(`/${c.code}${path}`, siteUrl).toString()])),
      },
    })),
  );
}
