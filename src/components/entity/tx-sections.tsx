import Link from "next/link";
import type { getTranslations } from "next-intl/server";
import { ArrowRight, CircleCheck, CircleX, Clock, FileCode2, KeyRound } from "lucide-react";
import { ChainIcon } from "@/components/chain-icon";
import type { ChainConfig } from "@/config/chains";
import type { Locale } from "@/i18n/locales";
import type { TxApproval, TxDetails, TxToken, TxTransfer } from "@/lib/chains/types";
import { formatAmount, shortenId } from "@/lib/format/amount";
import { formatUsd } from "@/lib/format/money";
import { localePath, toolPath } from "@/lib/routes";
import { cn } from "@/lib/utils";
import type { DecodeResult, DecodedValue } from "@/modules/tools/tx-decoder/decode";

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

/** One plain-language paragraph at the top of the page. */
export function TxSummary({ tx, chain, locale, t }: TxView) {
  const from = shortenId(tx.from);
  const toToken = tx.to ? tx.tokens[tx.to.toLowerCase()] : undefined;
  const to = tx.to ? (toToken?.symbol ? `${toToken.symbol} (${shortenId(tx.to)})` : shortenId(tx.to)) : "";
  const value = BigInt(tx.value) > 0n ? `${formatSmall(tx.value, 18, locale)} ${chain.nativeSymbol}` : null;
  const sentences: string[] = [];
  let tone: "ok" | "bad" | "wait" = "ok";

  if (tx.status === "pending") {
    tone = "wait";
    sentences.push(t("entity.tx.summary.pending"));
  } else if (tx.status === "reverted") {
    tone = "bad";
    sentences.push(t("entity.tx.summary.failed"));
  } else if (!tx.to) {
    sentences.push(t("entity.tx.summary.creation", { from }));
  } else if (!tx.call) {
    sentences.push(t("entity.tx.summary.native", { from, to, amount: value ?? `0 ${chain.nativeSymbol}` }));
  } else {
    const fn = functionName(tx.call);
    sentences.push(
      fn ? t("entity.tx.summary.call", { from, to, fn }) : t("entity.tx.summary.callUnknown", { from, to }),
    );
    if (value) sentences.push(t("entity.tx.summary.withValue", { amount: value }));
  }
  if (tx.status === "success") {
    if (tx.transfers.length > 0) sentences.push(t("entity.tx.summary.moved", { count: tx.transfers.length }));
    if (tx.approvals.length > 0) sentences.push(t("entity.tx.summary.permissions", { count: tx.approvals.length }));
  }

  const Icon = tone === "ok" ? CircleCheck : tone === "bad" ? CircleX : Clock;
  return (
    <section
      aria-labelledby="tx-summary"
      className={cn(
        "flex items-start gap-3 rounded-xl border p-5",
        tone === "bad" ? "border-critical/40 bg-critical/6" : tone === "wait" ? "border-high/40 bg-high/6" : "bg-card",
      )}
    >
      <Icon
        className={cn(
          "mt-0.5 size-5 shrink-0",
          tone === "ok" ? "text-low" : tone === "bad" ? "text-critical" : "text-high",
        )}
        aria-hidden="true"
      />
      <div>
        <h2 id="tx-summary" className="text-sm font-semibold text-muted-foreground">
          {t("entity.tx.summary.title")}
        </h2>
        <p className="mt-1 text-base">{sentences.join(" ")}</p>
      </div>
    </section>
  );
}

export function FailureReason({ tx, t }: TxView) {
  if (tx.status !== "reverted") return null;
  return (
    <section aria-labelledby="tx-failure" className="rounded-xl border border-critical/40 bg-card p-5">
      <h2 id="tx-failure" className="font-sans text-lg font-semibold">
        {t("entity.tx.failure.title")}
      </h2>
      {tx.revertReason && tx.revertReason !== "none" ? (
        <p className="mt-2 text-sm">
          {t("entity.tx.failure.reason")}{" "}
          <code className="rounded bg-muted px-1.5 py-0.5 break-all" dir="ltr">
            {tx.revertReason}
          </code>
        </p>
      ) : (
        <p className="mt-2 text-sm text-muted-foreground">
          {tx.revertReason === "none" ? t("entity.tx.failure.none") : t("entity.tx.failure.unknown")}
        </p>
      )}
    </section>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid gap-1 border-b py-3 last:border-b-0 sm:grid-cols-[13rem_1fr] sm:gap-4">
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

export function TxOverview({ tx, chain, locale, t }: TxView) {
  const native = chain.nativeSymbol;
  const nativePrice = tx.prices.native;
  const usd = (raw: string) => {
    const value = usdOf(raw, 18, nativePrice);
    return value !== null && value > 0 ? (
      <span className="text-muted-foreground"> · {usdText(value, locale)}</span>
    ) : null;
  };
  const pendingText = <span className="text-muted-foreground">{t("entity.tx.facts.pendingValue")}</span>;
  const percent =
    tx.gasUsed !== null
      ? new Intl.NumberFormat(locale, { style: "percent", maximumFractionDigits: 1 }).format(
          Number(tx.gasUsed) / Number(tx.gasLimit),
        )
      : "";
  const time =
    tx.timestamp !== null
      ? new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "medium", timeZone: "UTC" }).format(
          new Date(tx.timestamp * 1000),
        ) + " UTC"
      : null;
  const contractBadge = (isContract: boolean | null) =>
    isContract === null ? null : (
      <Badge tone={isContract ? "high" : "low"}>
        {isContract ? t("entity.tx.facts.contract") : t("entity.tx.facts.wallet")}
      </Badge>
    );
  const toToken = tx.to ? tx.tokens[tx.to.toLowerCase()] : undefined;

  return (
    <section aria-label={t("entity.tx.title")} className="rounded-xl border bg-card px-5 py-2">
      <dl>
        <Row label={t("entity.tx.facts.time")}>{time ?? pendingText}</Row>
        <Row label={t("entity.tx.block")}>
          {tx.blockNumber ? (
            <span className="technical">
              {new Intl.NumberFormat(locale).format(BigInt(tx.blockNumber))}
              {tx.confirmations !== null && (
                <span className="ms-2 font-sans text-muted-foreground">
                  · {t("entity.tx.confirmations", { count: tx.confirmations })}
                </span>
              )}
            </span>
          ) : (
            pendingText
          )}
        </Row>
        <Row label={t("entity.tx.from")}>
          <AddressLink address={tx.from} locale={locale} />
        </Row>
        <Row label={t("entity.tx.to")}>
          {tx.to ? (
            <>
              <AddressLink address={tx.to} locale={locale} />
              {contractBadge(tx.toIsContract)}
              {toToken?.symbol && (
                <Link
                  href={localePath(locale, `/token/${chain.key}/${tx.to}`)}
                  prefetch={false}
                  className="ms-2 text-sm text-primary hover:underline"
                >
                  {toToken.name || toToken.symbol} ({toToken.symbol})
                </Link>
              )}
            </>
          ) : (
            <span>{t("entity.tx.contractCreation")}</span>
          )}
        </Row>
        {tx.createdContract && (
          <Row label={t("entity.tx.facts.created")}>
            <AddressLink address={tx.createdContract} locale={locale} />
          </Row>
        )}
        <Row label={t("entity.tx.facts.value")}>
          <span className="tabular-nums">
            {formatSmall(tx.value, 18, locale)} {native}
          </span>
          {usd(tx.value)}
        </Row>
        <Row label={t("entity.tx.facts.fee")}>
          {tx.fee === null ? (
            pendingText
          ) : tx.fee === "0" ? (
            t("entity.tx.facts.freeFee")
          ) : (
            <>
              <span className="tabular-nums">
                {formatSmall(tx.fee, 18, locale)} {native}
              </span>
              {usd(tx.fee)}
            </>
          )}
        </Row>
        {tx.burnt && (
          <Row label={t("entity.tx.facts.burnt")}>
            <span className="tabular-nums">
              {formatSmall(tx.burnt, 18, locale)} {native}
            </span>
          </Row>
        )}
        <Row label={tx.gasUsed === null ? t("entity.tx.facts.gasLimit") : t("entity.tx.facts.gasUsed")}>
          <span className="tabular-nums">
            {tx.gasUsed === null
              ? new Intl.NumberFormat(locale).format(BigInt(tx.gasLimit))
              : t("entity.tx.facts.gasUsedValue", {
                  used: new Intl.NumberFormat(locale).format(BigInt(tx.gasUsed)),
                  limit: new Intl.NumberFormat(locale).format(BigInt(tx.gasLimit)),
                  percent,
                })}
          </span>
        </Row>
        {tx.gasPrice !== null && (
          <Row label={tx.status === "pending" ? t("entity.tx.facts.maxGasPrice") : t("entity.tx.facts.gasPrice")}>
            <span className="tabular-nums">
              {t("entity.tx.facts.gwei", { value: formatAmount(tx.gasPrice, 9, locale, 4) })}
            </span>
          </Row>
        )}
        <Row label={t("entity.tx.facts.nonce")}>
          <span className="tabular-nums">{tx.nonce}</span>
        </Row>
        <Row label={t("entity.tx.facts.type")}>
          {t.has(`entity.tx.types.${tx.type}`) ? t(`entity.tx.types.${tx.type}`) : tx.type}
        </Row>
      </dl>
    </section>
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
      <div className="overflow-x-auto rounded-xl border bg-card">
        <table className="w-full min-w-[640px] text-sm">
          <thead>
            <tr className="text-start text-xs text-muted-foreground">
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
                {t("entity.tx.transfers.value")}
              </th>
            </tr>
          </thead>
          <tbody>
            {tx.transfers.map((transfer, index) => {
              const token = tx.tokens[transfer.token.toLowerCase()];
              const value =
                transfer.standard !== "erc721" && transfer.standard !== "erc1155" && token?.decimals != null
                  ? usdOf(transfer.amount, token.decimals, tx.prices[transfer.token.toLowerCase()])
                  : null;
              return (
                <tr key={index} className="border-t">
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
  if (approval.revoke) return t("entity.tx.approvals.removed");
  if (approval.kind === "all") return t("entity.tx.approvals.all");
  if (approval.kind === "nft") return t("entity.tx.approvals.nft", { id: shortenId(approval.amount, 8, 4) });
  if (approval.unlimited) return t("entity.tx.approvals.unlimited");
  return token?.decimals != null ? formatSmall(approval.amount, token.decimals, locale) : approval.amount;
}

export function TxApprovals({ tx, chain, locale, t }: TxView) {
  if (tx.approvals.length === 0) return null;
  const granted = tx.status === "success" && tx.approvals.some((a) => !a.revoke);
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
              <span
                className={cn(
                  "ms-auto rounded px-2 py-0.5 text-xs font-semibold",
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

export function TxFootnote({ tx, chain, t }: TxView) {
  const interpreted = tx.transfers.length + tx.approvals.length;
  const other = tx.otherEvents;
  return (
    <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
      <ChainIcon chain={chain.key} size={14} />
      {t("entity.tx.source", { chain: t(`chains.${chain.key}`) })} {t("entity.tx.events", { count: tx.logCount })}{" "}
      {other > 0 && !tx.logsTruncated && t("entity.tx.otherEvents", { count: other })}{" "}
      {(tx.prices.native !== undefined || interpreted > 0) && t("entity.tx.pricesNote")}
    </p>
  );
}
