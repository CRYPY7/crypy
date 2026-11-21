import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { type ChainPickerStrings, ChainPicker } from "@/components/entity/chain-picker";
import { Notice } from "@/components/entity/entity-parts";
import { CHAINS_PARAM, type ChainScope } from "@/lib/chains/selection";

/**
 * The chain picker plus one line saying what was scanned and what wasn't, with a way to scan the rest.
 * `safety`: on safety pages (approvals), used chains that were left out get a warning, so a narrowed scan
 * never looks like a full one.
 */
export async function ChainScopeBar({
  scope,
  path,
  safety = false,
}: {
  scope: ChainScope;
  /** This page's path without a query, for the "scan these too" links. */
  path: string;
  safety?: boolean;
}) {
  const t = await getTranslations();
  const name = (key: string) => t(`chains.${key}`);
  const list = (keys: string[]) => keys.map(name).join(", ");
  const link = (value: string) => `${path}?${CHAINS_PARAM}=${value}`;
  const left = [...scope.usedNotScanned, ...scope.unusedNotScanned];
  const linkClass = "font-medium text-primary underline-offset-4 hover:underline";

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <ChainPicker
          selection={scope.selection}
          chains={scope.chains.map((c) => ({ ...c, name: name(c.key) }))}
          scanCount={scope.scan.length}
          strings={t.raw("entity.chainScope.picker") as ChainPickerStrings}
        />
        <p
          className="flex flex-wrap items-center gap-x-2.5 gap-y-1 text-sm text-muted-foreground"
          data-testid="scanned"
        >
          {scope.scan.length > 0 ? (
            <span>
              {t.rich(
                scope.selection.mode === "pick" && left.length > 0
                  ? "entity.chainScope.scannedOnly"
                  : "entity.chainScope.scanned",
                {
                  chains: list(scope.scan),
                  b: (chunks) => <b className="text-foreground">{chunks}</b>,
                },
              )}
            </span>
          ) : (
            <span>{t("entity.chainScope.noneUsed")}</span>
          )}
          {scope.unusedNotScanned.length > 0 && scope.scan.length > 0 && (
            <>
              <span aria-hidden="true">·</span>
              <span>{t("entity.chainScope.notUsed", { chains: list(scope.unusedNotScanned) })}</span>
            </>
          )}
          {left.length > 0 && (
            <Link href={link("all")} prefetch={false} className={linkClass}>
              {scope.scan.length === 0 || scope.selection.mode === "pick"
                ? t("entity.chainScope.scanAll")
                : t("entity.chainScope.scanToo")}
            </Link>
          )}
        </p>
      </div>
      {safety && scope.usedNotScanned.length > 0 && (
        <Notice tone="warning" title={t("entity.chainScope.leftOutTitle", { chains: list(scope.usedNotScanned) })}>
          <span className="flex flex-wrap items-center justify-between gap-3">
            <span>{t("entity.chainScope.leftOut", { chains: list(scope.usedNotScanned) })}</span>
            <Link
              href={link([...scope.scan, ...scope.usedNotScanned].join(","))}
              prefetch={false}
              className="rounded-lg bg-primary px-3 py-2 text-sm font-semibold text-primary-foreground"
            >
              {t("entity.chainScope.checkToo", { chains: list(scope.usedNotScanned) })}
            </Link>
          </span>
        </Notice>
      )}
    </div>
  );
}
