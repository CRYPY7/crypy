import { notFound } from "next/navigation";
import * as rootParams from "next/root-params";
import { getRequestConfig } from "next-intl/server";
import { type Locale, defaultLocale, isLocale } from "./locales";
import { loadMessages } from "./messages";

export default getRequestConfig(async ({ locale: requested }) => {
  // Route handlers cannot read root params yet, so an explicit locale wins when given.
  const candidate = requested ?? (await rootParams.locale());
  if (!isLocale(candidate)) notFound();
  const locale: Locale = candidate ?? defaultLocale;

  return {
    locale,
    messages: await loadMessages(locale),
  };
});
