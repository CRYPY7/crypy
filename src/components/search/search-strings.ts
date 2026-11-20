import "server-only";
import { getTranslations } from "next-intl/server";
import { chains } from "@/config/chains";
import type { SearchStrings } from "./universal-search";

export async function getSearchStrings(): Promise<SearchStrings> {
  const t = await getTranslations();
  return {
    label: t("search.label"),
    placeholder: t("search.placeholder"),
    submit: t("search.submit"),
    checking: t("search.checking"),
    lookupAnyway: t("search.lookupAnyway"),
    close: t("search.close"),
    choose: t("search.result.choose"),
    partial: t.raw("search.partial") as string,
    result: {
      invalid: t("search.result.invalid"),
      empty: t("search.result.empty"),
      "bad-checksum": t("search.result.bad-checksum"),
      "not-found-tx": t("search.result.not-found-tx"),
      unavailable: t("search.result.unavailable"),
      "rate-limited": t("search.result.rate-limited"),
      error: t("search.result.error"),
    },
    chains: Object.fromEntries(chains.map((chain) => [chain.key, t(`chains.${chain.key}`)])),
    nativeSymbols: Object.fromEntries(chains.map((chain) => [chain.key, chain.nativeSymbol])),
    found: t.raw("search.found") as SearchStrings["found"],
  };
}
