import type { MetadataRoute } from "next";
import { getTranslations } from "next-intl/server";

/** Web app manifest: name, colours and icons when CRYPY is added to a phone's home screen. */
export default async function manifest(): Promise<MetadataRoute.Manifest> {
  const t = await getTranslations({ locale: "en", namespace: "meta" });
  return {
    name: t("title"),
    short_name: t("siteName"),
    description: t("description"),
    start_url: "/en",
    display: "standalone",
    background_color: "#0b0d12",
    theme_color: "#0b0d12",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
      { src: "/icons/maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
