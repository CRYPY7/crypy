import "server-only";
import { getTranslations } from "next-intl/server";
import { ChainIcon } from "@/components/chain-icon";
import { chains } from "@/config/chains";
import { partialNotes, txFeatures, txSupport } from "@/config/tx-support";
import type { Locale } from "@/i18n/locales";
import { localePath } from "@/lib/routes";
import { cn } from "@/lib/utils";
import { TxChecker, type TxCheckerStrings } from "./widget";

export async function TxCheckerWorkspace({ locale }: { locale: Locale }) {
  const t = await getTranslations();
  const raw = t.raw("utilities.tx-checker") as TxCheckerStrings & { supportTitle: string };
  const supported = chains.filter((chain) => txSupport[chain.key]);
  const tone = {
    supported: "bg-low/14 text-low",
    partial: "bg-high/14 text-high",
    planned: "bg-muted text-muted-foreground",
  };
  return (
    <div className="flex flex-col gap-6">
      <TxChecker
        strings={raw}
        txPathPrefix={`${localePath(locale, "/tx")}/`}
        searchPath={localePath(locale, "/search")}
      />
      <section aria-labelledby="tx-support" className="flex flex-col gap-3">
        <h2 id="tx-support" className="font-sans text-lg font-semibold">
          {raw.supportTitle}
        </h2>
        <div className="overflow-x-auto rounded-xl border bg-card">
          <table className="w-full min-w-[480px] text-sm">
            <thead>
              <tr className="text-xs text-muted-foreground">
                <th scope="col" className="px-4 py-2.5 text-start font-medium">
                  {t("utilities.tx-checker.feature")}
                </th>
                {supported.map((chain) => (
                  <th key={chain.key} scope="col" className="px-4 py-2.5 text-start font-medium">
                    <span className="inline-flex items-center gap-1.5">
                      <ChainIcon chain={chain.key} size={14} />
                      {t(`chains.${chain.key}`)}
                    </span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {txFeatures.map((feature) => (
                <tr key={feature} className="border-t">
                  <th scope="row" className="px-4 py-2.5 text-start font-normal">
                    {t(`utilities.tx-checker.features.${feature}`)}
                    {partialNotes[feature] && (
                      <span className="block text-xs text-muted-foreground">
                        {t(`utilities.tx-checker.notes.${partialNotes[feature]}`)}
                      </span>
                    )}
                  </th>
                  {supported.map((chain) => {
                    const level = txSupport[chain.key]![feature];
                    return (
                      <td key={chain.key} className="px-4 py-2.5">
                        <span className={cn("rounded px-2 py-0.5 text-xs font-medium", tone[level])}>
                          {t(`utilities.tx-checker.levels.${level}`)}
                        </span>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
