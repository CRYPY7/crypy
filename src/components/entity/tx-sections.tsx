import Link from "next/link";
import type { getTranslations } from "next-intl/server";
import { ArrowRight, FileCode2, KeyRound } from "lucide-react";
import type { ChainConfig } from "@/config/chains";
import type { Locale } from "@/i18n/locales";
import type { TxApproval, TxDetails, TxToken, TxTransfer } from "@/lib/chains/types";
import { formatAmount, shortenId } from "@/lib/format/amount";
import { formatUsd } from "@/lib/format/money";
import { localePath, toolPath } from "@/lib/routes";
import { cn } from "@/lib/utils";
import type { DecodeResult, DecodedValue } from "@/modules/tools/tx-decoder/decode";
import { permissionGroups } from "@/lib/tx/actions";

type T = Awaited<ReturnType<typeof getTranslations>>;

export interface TxView {
  tx: TxDetails;
  chain: ChainConfig;
  locale: Locale;
  t: T;
  explorerName: string;
}

/** Amounts that may be tiny (fees): up to 8 decimals, and "< 0.00000001" instead of a misleading 0. */
export function formatSmall(raw: string, decimals: number, locale: string): string {
  const text = formatAmount(raw, decimals, locale, 8);
  return /^[0.,\s]+$/.test(text) && BigInt(raw) > 0n ? `< ${formatAmount("1", 8, locale, 8)}` : text;
}

/** USD text that never shows a positive amount as "$0.00". */
export function usdText(value: number, locale: string): string {
  return value > 0 && value < 0.01 ? `< ${formatUsd(0.01, locale)}` : formatUsd(value, locale);
}

export function usdOf(raw: string, decimals: number, price: number | undefined): number | null {
  if (price === undefined) return null;
  return (Number(BigInt(raw)) / 10 ** decimals) * price;
}

function functionName(call: DecodeResult | null): string | null {
  if (call?.status !== "decoded") return null;
  return /^(?:function\s+)?(\w+)\s*\(/.exec(call.signature)?.[1] ?? null;
}

export function AddressLink({ address, locale, short = false }: { address: string; locale: Locale; short?: boolean }) {
  return (
    <Link
      href={localePath(locale, `/address/${address}`)}
      prefetch={false}
      className="technical text-sm text-primary hover:underline"
      title={address}
      dir="ltr"
    >
      {short ? shortenId(address) : address}
    </Link>
  );
}

function tokenLabel(token: TxToken | undefined, t: T): string {
  if (!token) return t("entity.tx.transfers.unknownToken");
  return token.symbol || token.name || shortenId(token.address);
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid gap-1 border-b py-3 last:border-b-0 sm:grid-cols-[12rem_1fr] sm:gap-4">
      <dt className="text-sm text-muted-foreground">{label}</dt>
      <dd className="min-w-0 text-sm break-words">{children}</dd>
    </div>
  );
}

function Badge({ children, tone = "muted" }: { children: React.ReactNode; tone?: "muted" | "low" | "high" }) {
  return (
    <span
      className={cn(
        "ms-2 rounded px-1.5 py-0.5 text-xs font-medium",
        tone === "low" && "bg-low/14 text-low",
        tone === "high" && "bg-high/14 text-high",
        tone === "muted" && "bg-muted text-muted-foreground",
      )}
    >
      {children}
    </span>
  );
}

function transferAmount(transfer: TxTransfer, token: TxToken | undefined, locale: string, t: T): string {
  if (transfer.standard === "erc721") return t("entity.tx.transfers.nft", { id: shortenId(transfer.tokenId!, 8, 4) });
  const amount =
    token?.decimals !== null && token?.decimals !== undefined
      ? formatSmall(transfer.amount, token.decimals, locale)
      : transfer.amount;
  if (transfer.standard === "erc1155")
    return `${amount} × ${t("entity.tx.transfers.nft", { id: shortenId(transfer.tokenId!, 8, 4) })}`;
  return amount;
}

export function TxTransfers({ tx, chain, locale, t, explorerName }: TxView) {
  if (tx.transfers.length === 0) return null;
  return (
    <section aria-labelledby="tx-transfers" className="flex flex-col gap-3">
      <h2 id="tx-transfers" className="font-sans text-lg font-semibold">
        {t("entity.tx.transfers.title")}
      </h2>
      <div
        tabIndex={0}
        role="group"
        aria-labelledby="tx-transfers"
        className="overflow-x-auto rounded-xl border bg-card"
      >
        <table className="w-full min-w-[640px] text-sm">
          <thead>
            <tr className="text-start text-xs text-muted-foreground">
              <th scope="col" className="px-4 py-2.5 text-start font-medium">
                {t("entity.tx.transfers.event")}
              </th>
              <th scope="col" className="px-4 py-2.5 text-start font-medium">
                {t("entity.tx.transfers.token")}
              </th>
              <th scope="col" className="px-4 py-2.5 text-start font-medium">
                {t("entity.tx.transfers.from")}
              </th>
              <th scope="col" className="px-2 py-2.5" aria-hidden="true" />
              <th scope="col" className="px-4 py-2.5 text-start font-medium">
                {t("entity.tx.transfers.to")}
              </th>
              <th scope="col" className="px-4 py-2.5 text-end font-medium">
                {t("entity.tx.transfers.amount")}
              </th>
              <th scope="col" className="px-4 py-2.5 text-end font-medium">
                {t(tx.pricesAtTx ? "entity.tx.transfers.valueAtTx" : "entity.tx.transfers.valueToday")}
              </th>
            </tr>
          </thead>
          <tbody>
            {tx.transfers.map((transfer, index) => {
              const token = tx.tokens[transfer.token.toLowerCase()];
              const value =
                transfer.standard !== "erc721" && transfer.standard !== "erc1155" && token?.decimals != null
                  ? usdOf(transfer.amount, token.decimals, (tx.pricesAtTx ?? tx.prices)[transfer.token.toLowerCase()])
                  : null;
              return (
                <tr key={index} className="border-t">
                  <td className="w-12 px-4 py-2.5 text-muted-foreground tabular-nums">#{transfer.logIndex}</td>
                  <td className="px-4 py-2.5">
                    <Link
                      href={localePath(locale, `/token/${chain.key}/${transfer.token}`)}
                      prefetch={false}
                      className="font-semibold text-primary hover:underline"
                    >
                      <bdi>{tokenLabel(token, t)}</bdi>
                    </Link>
                    {(transfer.standard === "wrap" || transfer.standard === "unwrap") && (
                      <Badge>{t(`entity.tx.transfers.${transfer.standard}`)}</Badge>
                    )}
                  </td>
                  <td className="px-4 py-2.5">
                    <AddressLink address={transfer.from} locale={locale} short />
                  </td>
                  <td className="px-2 py-2.5 text-muted-foreground">
                    <ArrowRight className="size-4 rtl:-scale-x-100" aria-hidden="true" />
                  </td>
                  <td className="px-4 py-2.5">
                    <AddressLink address={transfer.to} locale={locale} short />
                  </td>
                  <td className="px-4 py-2.5 text-end tabular-nums">{transferAmount(transfer, token, locale, t)}</td>
                  <td className="px-4 py-2.5 text-end text-muted-foreground tabular-nums">
                    {value !== null ? usdText(value, locale) : "—"}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {tx.logsTruncated && (
        <p className="text-sm text-muted-foreground">
          {t("entity.tx.transfers.truncated", { explorer: explorerName })}
        </p>
      )}
    </section>
  );
}

function allowanceText(approval: TxApproval, token: TxToken | undefined, locale: string, t: T): string {
  if (approval.revoke && approval.kind !== "amount") return t("entity.tx.approvals.removed");
  if (approval.kind === "amount" && approval.amount === "0") return "0";
  if (approval.kind === "all") return t("entity.tx.approvals.all");
  if (approval.kind === "nft") return t("entity.tx.approvals.nft", { id: shortenId(approval.amount, 8, 4) });
  if (approval.unlimited) return t("entity.tx.approvals.unlimited");
  return token?.decimals != null ? formatSmall(approval.amount, token.decimals, locale) : approval.amount;
}

export function TxApprovals({ tx, chain, locale, t }: TxView) {
  if (tx.approvals.length === 0) return null;
  // What each event did to the permission (granted, changed, used by a transfer, removed).
  const steps = new Map(
    tx.status === "success"
      ? permissionGroups(tx).flatMap((g) => g.steps.map((step) => [step.logIndex, step] as const))
      : [],
  );
  // Warn only when a permission was actually given or raised, never for one that was only used up.
  const granted =
    tx.status === "success" && [...steps.values()].some((step) => step.change !== "used" && step.change !== "revoked");
  return (
    <section aria-labelledby="tx-approvals" className="flex flex-col gap-3">
      <h2 id="tx-approvals" className="font-sans text-lg font-semibold">
        {t("entity.tx.approvals.title")}
      </h2>
      {granted && (
        <div role="note" className="flex gap-3 rounded-xl border border-high/50 bg-high/8 p-4 text-sm">
          <KeyRound className="mt-0.5 size-5 shrink-0 text-high" aria-hidden="true" />
          <div>
            <p className="font-semibold">{t("entity.tx.approvals.alertTitle")}</p>
            <p className="mt-1 text-muted-foreground">{t("entity.tx.approvals.alertText")}</p>
          </div>
        </div>
      )}
      <ul className="flex flex-col divide-y rounded-xl border bg-card">
        {tx.approvals.map((approval, index) => {
          const token = tx.tokens[approval.token.toLowerCase()];
          return (
            <li key={index} className="flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-3 text-sm">
              <span className="text-muted-foreground tabular-nums">#{approval.logIndex}</span>
              <Link
                href={localePath(locale, `/token/${chain.key}/${approval.token}`)}
                prefetch={false}
                className="font-semibold text-primary hover:underline"
              >
                <bdi>{tokenLabel(token, t)}</bdi>
              </Link>
              <span className="text-muted-foreground">
                {t("entity.tx.approvals.owner")} <AddressLink address={approval.owner} locale={locale} short />
              </span>
              <span className="text-muted-foreground">
                {t("entity.tx.approvals.spender")} <AddressLink address={approval.spender} locale={locale} short />
              </span>
              {steps.get(approval.logIndex) && (
                <span className="ms-auto text-xs text-muted-foreground">
                  {t(`entity.tx.story.permissions.change.${steps.get(approval.logIndex)!.change}`)}
                </span>
              )}
              <span
                className={cn(
                  "rounded px-2 py-0.5 text-xs font-semibold",
                  !steps.get(approval.logIndex) && "ms-auto",
                  approval.revoke
                    ? "bg-low/14 text-low"
                    : approval.unlimited
                      ? "bg-critical/14 text-critical"
                      : "bg-muted",
                )}
              >
                {allowanceText(approval, token, locale, t)}
              </span>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function ParamValue({ value, locale, t }: { value: DecodedValue; locale: Locale; t: T }): React.ReactNode {
  switch (value.kind) {
    case "address":
      return <AddressLink address={value.value} locale={locale} />;
    case "number":
      return (
        <span className="technical break-all">
          {value.value}
          {value.unlimited && <Badge tone="high">{t("utilities.tx-decoder.unlimited")}</Badge>}
          {value.time && (
            <span className="ms-2 font-sans text-muted-foreground">
              {value.time.replace("T", " ").slice(0, 19)} UTC
            </span>
          )}
        </span>
      );
    case "bool":
      return t(value.value ? "utilities.tx-decoder.yes" : "utilities.tx-decoder.no");
    case "bytes":
      return (
        <span className="technical break-all">
          {value.value.length > 74 ? `${value.value.slice(0, 74)}…` : value.value}
        </span>
      );
    case "list":
      return (
        <ul className="flex flex-col gap-1">
          {value.items.slice(0, 20).map((item, i) => (
            <li key={i}>
              <ParamValue value={item} locale={locale} t={t} />
            </li>
          ))}
          {value.items.length > 20 && (
            <li className="text-muted-foreground">{t("entity.tx.call.more", { count: value.items.length - 20 })}</li>
          )}
        </ul>
      );
    case "call":
      return value.result.status === "decoded" ? (
        <code className="technical">{functionName(value.result)}</code>
      ) : (
        <span className="technical">{"selector" in value.result ? value.result.selector : ""}</span>
      );
  }
}

export function TxCall({ tx, locale, t }: TxView) {
  const call = tx.call;
  if (!call || call.status === "native-transfer" || call.status === "invalid") return null;
  return (
    <section aria-labelledby="tx-call" className="flex flex-col gap-3">
      <h2 id="tx-call" className="flex items-center gap-2 font-sans text-lg font-semibold">
        <FileCode2 className="size-5 text-primary" aria-hidden="true" />
        {t("entity.tx.call.title")}
      </h2>
      <div className="rounded-xl border bg-card p-5 text-sm">
        {call.status === "decoded" ? (
          <>
            <p>
              <code className="technical text-base font-semibold">{functionName(call)}</code>
              <span className="ms-2 text-muted-foreground">{call.standard}</span>
            </p>
            <p className="mt-1 text-muted-foreground">{t(`utilities.tx-decoder.functions.${call.key}`)}</p>
            {call.warnings
              .filter((w) => w !== "approval")
              .map((warning) => (
                <p key={warning} className="mt-3 rounded-lg border border-high/40 bg-high/8 px-3 py-2">
                  {t(`utilities.tx-decoder.warnings.${warning}`)}
                </p>
              ))}
            {call.params.length > 0 && (
              <dl className="mt-4 border-t">
                {call.params.map((param) => (
                  <Row key={param.name} label={`${param.name} (${param.type})`}>
                    <ParamValue value={param.value} locale={locale} t={t} />
                  </Row>
                ))}
              </dl>
            )}
          </>
        ) : (
          <>
            <p>
              {t("entity.tx.call.selector")}: <code className="technical">{call.selector}</code>
            </p>
            <p className="mt-1 text-muted-foreground">
              {call.status === "mismatch" ? t("entity.tx.call.mismatch") : t("entity.tx.call.unknown")}
            </p>
          </>
        )}
        <p className="mt-4">
          <Link href={toolPath(locale, "tx-decoder")} prefetch={false} className="text-primary hover:underline">
            {t("entity.tx.call.decoder")}
          </Link>
        </p>
      </div>
    </section>
  );
}

export function TxInput({ tx, t, explorerName }: TxView) {
  if (tx.input.bytes === 0) return null;
  return (
    <details className="rounded-xl border bg-card p-5 text-sm">
      <summary className="cursor-pointer font-semibold">
        {t("entity.tx.input.title")}{" "}
        <span className="font-normal text-muted-foreground">
          · {t("entity.tx.input.bytes", { count: tx.input.bytes })}
        </span>
      </summary>
      <pre
        className="technical mt-3 max-h-72 overflow-auto rounded-lg bg-muted p-3 text-xs break-all whitespace-pre-wrap"
        dir="ltr"
      >
        {tx.input.preview}
      </pre>
      {tx.input.truncated && (
        <p className="mt-2 text-muted-foreground">{t("entity.tx.input.truncated", { explorer: explorerName })}</p>
      )}
    </details>
  );
}
