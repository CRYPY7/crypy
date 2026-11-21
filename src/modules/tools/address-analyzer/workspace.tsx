import "server-only";
import { getTranslations } from "next-intl/server";
import type { Locale } from "@/i18n/locales";
import { localePath } from "@/lib/routes";
import { type ApprovalCheckerStrings, ApprovalCheckerForm } from "../approval-checker/widget";

/** Any address → its Activity tab. Shares the address form with the Approval Checker. */
export async function AddressAnalyzerWorkspace({ locale }: { locale: Locale }) {
  const t = await getTranslations();
  return (
    <ApprovalCheckerForm
      strings={t.raw("utilities.address-analyzer") as ApprovalCheckerStrings}
      addressPathPrefix={`${localePath(locale, "/address")}/`}
      searchPath={localePath(locale, "/search")}
      section="activity"
    />
  );
}
