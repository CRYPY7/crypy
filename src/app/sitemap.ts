import type { MetadataRoute } from "next";
import { connection } from "next/server";
import { liveChains } from "@/config/chains";
import { siteUrl } from "@/config/env";
import { chainSlugs, findCuratedToken } from "@/config/seo-pages";
import { toolIds } from "@/config/tools";
import { guideMetas } from "@/content/learn";
import { selectableLocales } from "@/i18n/locales";
import { allSavedChecks } from "@/server/services/token-checks";

/**
 * Only reviewed languages are listed, so search engines never index unfinished translations. Built per request
 * (cheap): token check pages are listed only once their first daily check is saved, with that check's date.
 */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  await connection();
  const saved = await allSavedChecks().catch(() => []);
  const paths: { path: string; lastModified?: string }[] = [
    ...[
      "",
      "/tools",
      "/legal/privacy",
      "/legal/terms",
      "/legal/risk",
      ...toolIds.map((id) => `/tools/${id}`),
      "/learn",
      ...liveChains.filter((chain) => chain.capabilities.fees).map((chain) => `/gas/${chainSlugs[chain.key]}`),
      "/tokens",
    ].map((path) => ({ path })),
    // Guides carry their real "updated" date, so search engines know when to read them again.
    ...guideMetas.map((guide) => ({ path: `/learn/${guide.slug}`, lastModified: guide.updated })),
    ...saved
      .filter((check) => findCuratedToken(check.chain, check.slug))
      .map((check) => ({
        path: `/tokens/${chainSlugs[check.chain]}/${check.slug}`,
        lastModified: check.checkedAt.toISOString(),
      })),
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
