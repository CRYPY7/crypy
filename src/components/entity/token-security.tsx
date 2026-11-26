import "server-only";
import Link from "next/link";
import { getChain } from "@/config/chains";
import { getTranslations } from "next-intl/server";
import {
  CircleCheck,
  CircleX,
  Crown,
  FlaskConical,
  Info,
  ListChecks,
  ShieldAlert,
  ShieldCheck,
  Users,
} from "lucide-react";
import type { ReactNode } from "react";
import type { Locale } from "@/i18n/locales";
import { formatAmount, shortenId } from "@/lib/format/amount";
import { localePath } from "@/lib/routes";
import { pct } from "@/lib/security/evaluate";
import type { CheckClass, SecurityCheck, SecurityReport } from "@/lib/security/types";
import { cn } from "@/lib/utils";
import { dexDeployments } from "@/server/chains/evm/security/dex-registry";
import { cachedTokenSecurity } from "@/server/services/lookups";
import { CheckingNotice, NotCheckedNotice, SavedNotice } from "./freshness";
import { Notice } from "./entity-parts";
import { LiquidityHoldersCard } from "./token-liquidity";
import { CopyText } from "./tx-client";
import { observe } from "@/server/outcomes/record";
import { classifyTokenSecurity } from "@/lib/outcomes/classify";

type T = Awaited<ReturnType<typeof getTranslations>>;
const K = "entity.tokenSecurity";

const severityTone = {
  critical: "bg-critical/14 text-critical",
  high: "bg-high/14 text-high",
  medium: "bg-medium/14 text-medium",
  low: "bg-primary/14 text-primary",
  pass: "bg-low/14 text-low",
  unchecked: "bg-muted text-muted-foreground",
} as const;

const classTone: Record<CheckClass, string> = {
  verified: "border-low/40 text-low",
  simulated: "border-low/40 text-low",
  heuristic: "border-high/40 text-high",
  external: "border-primary/40 text-primary",
  unsupported: "border-border text-muted-foreground",
};

function ClassChip({ t, cls, provider }: { t: T; cls: CheckClass; provider?: string }) {
  return (
    <span
      title={t(`${K}.class.${cls}Tip`)}
      className={cn("shrink-0 rounded-full border px-2 py-0.5 text-[11px] leading-4 whitespace-nowrap", classTone[cls])}
    >
      {t(`${K}.class.${cls}`, { provider: provider ?? "" })}
    </span>
  );
}

function SeverityChip({ t, check }: { t: T; check: SecurityCheck }) {
  const key = check.status === "risk" ? check.severity! : check.status;
  return (
    <span className={cn("rounded-md px-2 py-0.5 text-xs font-semibold whitespace-nowrap", severityTone[key])}>
      {t(`${K}.severity.${key}`)}
    </span>
  );
}

function Card({
  id,
  title,
  icon: Icon,
  right,
  children,
}: {
  id: string;
  title: string;
  icon: typeof Info;
  right?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section aria-labelledby={id} className="rounded-2xl border bg-card p-4 sm:p-5">
      <div className="mb-3 flex items-center gap-2">
        <Icon className="size-[18px] text-primary" aria-hidden="true" />
        <h2 id={id} className="font-sans text-base font-semibold">
          {title}
        </h2>
        {right && <span className="ms-auto">{right}</span>}
      </div>
      {children}
    </section>
  );
}

function checkValues(check: SecurityCheck, t: T): Record<string, string | number> {
  const v = { ...(check.values ?? {}) };
  if (typeof v.reason === "string")
    v.reason = v.reason ? t(`${K}.trade.said`, { reason: v.reason }) : t(`${K}.trade.noReason`);
  if (typeof v.usd === "number") v.usd = new Intl.NumberFormat("en", { maximumFractionDigits: 0 }).format(v.usd);
  // Unix seconds → a UTC date (same "en" formatting as amounts in check texts).
  if (typeof v.date === "number")
    v.date = new Intl.DateTimeFormat("en", { dateStyle: "medium", timeZone: "UTC" }).format(new Date(v.date * 1000));
  return v;
}

/** Title and detail for a check, including the special cases (clones, empty pools, burned proxy admin). */
export function checkText(check: SecurityCheck, t: T): { title: string; detail: string } {
  const values = checkValues(check, t);
  const base = `${K}.checks.${check.id}.${check.status}`;
  if (check.id === "proxy" && values.kind === "minimal") {
    return { title: t(`${K}.checks.proxyClone.title`), detail: t(`${K}.checks.proxyClone.detail`) };
  }
  if (check.id === "liquidity" && (values.state === "none" || values.state === "empty")) {
    return {
      title: t(`${K}.checks.liquidityState.${values.state}.title`),
      detail: t(`${K}.checks.liquidityState.${values.state}.detail`, values),
    };
  }
  if (check.id === "sell" && values.state === "feeRejected")
    return { title: t(`${K}.checks.sell.feeRejected.title`), detail: t(`${K}.checks.sell.feeRejected.detail`, values) };
  if (check.id.startsWith("power.") && values.access === "open")
    return { title: t(`${K}.checks.powerOpen.title`, values), detail: t(`${K}.checks.powerOpen.detail`) };
  // Pick the one sentence that fits before formatting it: the general sentence may need values a special case
  // doesn't have (each missing value logs a formatting error on the server).
  let detail =
    check.id === "lp" && values.state === "owner"
      ? t(`${K}.lpStates.owner`, values)
      : check.id === "proxy" && values.admin === "burned"
        ? t(`${K}.lpStates.proxyBurned`)
        : t(`${base}.detail`, values);
  if (check.id.startsWith("power.") && (values.access === "role" || values.access === "restricted"))
    detail = `${detail} ${t(`${K}.checks.powerOthers`)}`;
  return { title: t(`${base}.title`, values), detail };
}

function CheckRow({ t, check }: { t: T; check: SecurityCheck }) {
  const { title, detail } = checkText(check, t);
  const provider = check.values?.provider;
  return (
    <li className="flex items-start gap-3 py-3 text-sm">
      <span className="w-24 shrink-0">
        <SeverityChip t={t} check={check} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block font-semibold">
          <bdi>{title}</bdi>
        </span>
        <span className="block text-muted-foreground">
          <bdi>{detail}</bdi>
        </span>
      </span>
      <ClassChip t={t} cls={check.class} provider={typeof provider === "string" ? provider : undefined} />
    </li>
  );
}

function utcTime(ms: number, locale: string): string {
  return new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "short", timeZone: "UTC" }).format(
    new Date(ms),
  );
}

function plainReport(report: SecurityReport, t: T, url: string): string {
  const lines = [
    `${report.facts.token.name} (${report.facts.token.symbol}) — ${t(`${K}.level.${report.level}`)}`,
    url,
    ...report.checks.map((c) => {
      const key = c.status === "risk" ? c.severity! : c.status;
      return `- [${t(`${K}.severity.${key}`)}] ${checkText(c, t).title}`;
    }),
    t(`${K}.disclaimer`),
  ];
  return lines.join("\n");
}

export async function TokenSecuritySection({
  chainKey,
  address,
  locale,
}: {
  chainKey: string;
  address: string;
  locale: Locale;
}) {
  const t = await getTranslations();
  const chain = getChain(chainKey);
  // Chains added before their security checks are verified (e.g. Base, Arbitrum, Polygon): say so plainly.
  if (!chain?.capabilities.tokenSecurity)
    return <Notice>{t(`${K}.notOnChain`, { chain: t(`chains.${chainKey}`) })}</Notice>;
  const report = await observe(
    "token-security",
    () => cachedTokenSecurity(chainKey, address),
    classifyTokenSecurity,
  ).catch(() => null);
  const f = t.raw("entity.freshness") as Record<string, string>;
  const retry = { retry: f.checkAgain!, retrying: f.retrying! };
  if (!report)
    return (
      <NotCheckedNotice
        title={t("entity.freshness.notCheckedTitle", { chain: t(`chains.${chainKey}`) })}
        body={t(`${K}.unavailable`)}
        labels={retry}
      />
    );
  return (
    <div className="flex flex-col gap-4">
      {report.savedAt && report.refreshing && (
        <CheckingNotice
          at={report.savedAt}
          locale={locale}
          title={f.tokenCheckingTitle!}
          pending={f.tokenCheckingPending!}
          body={f.tokenCheckingBody!}
        />
      )}
      {report.savedAt && !report.refreshing && (
        <SavedNotice
          at={report.savedAt}
          locale={locale}
          title={f.tokenTitle!}
          pending={f.tokenPending!}
          body={f.tokenBody}
          labels={retry}
        />
      )}
      <TokenSecurityReportView report={report} chainKey={chainKey} locale={locale} />
    </div>
  );
}

/**
 * The full report: summary, liquidity, trade test, owner, every check, holders and the second opinion. Used for live
 * checks (token page) and for saved daily checks (curated token pages), so both always look the same.
 */
export async function TokenSecurityReportView({
  report,
  chainKey,
  locale,
}: {
  report: SecurityReport;
  chainKey: string;
  locale: Locale;
}) {
  const t = await getTranslations();
  const { facts, counts, checks } = report;
  const risks = checks.filter((c) => c.status === "risk");
  const top = risks
    .filter((c) => c.severity !== "low")
    .slice(0, 3)
    .map((c) => checkText(c, t).title.toLowerCase());
  const ago = utcTime(facts.checkedAt, locale);
  const dexes = [...new Set((dexDeployments[chainKey as keyof typeof dexDeployments] ?? []).map((d) => d.name))].join(
    ", ",
  );
  const levelTone = {
    serious: "border-critical/40 bg-critical/5 text-critical",
    risks: "border-high/40 bg-high/5 text-high",
    warnings: "border-medium/40 bg-medium/5 text-medium",
    "none-found": "border-low/40 bg-low/5 text-low",
  }[report.level];
  const LevelIcon = report.level === "none-found" ? ShieldCheck : ShieldAlert;
  const url = `${localePath(locale, `/token/${chainKey}/${facts.address}`)}`;

  return (
    <div className="flex flex-col gap-4">
      {/* Summary */}
      <section aria-labelledby="sec-summary" className={cn("rounded-2xl border p-4 sm:p-5", levelTone)}>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start">
          <span className="flex size-12 shrink-0 items-center justify-center rounded-xl bg-current/15">
            <LevelIcon className="size-6" aria-hidden="true" />
          </span>
          <div className="min-w-0 flex-1 text-foreground">
            <h2 id="sec-summary" className="text-xl font-bold">
              {t(`${K}.level.${report.level}`)}
            </h2>
            <p className="mt-1 text-sm text-foreground/85">
              {top.length > 0 ? `${t(`${K}.topRisks`, { list: top.join("; ") })} ` : `${t(`${K}.noneFoundNote`)} `}
              {t(`${K}.levelNote`)}
            </p>
          </div>
          <div className="flex shrink-0 flex-col items-start gap-2 text-xs text-muted-foreground sm:items-end">
            <span>{t(`${K}.checked`, { time: ago, block: facts.block ?? "—" })}</span>
            <CopyText
              text={plainReport(report, t, url)}
              label={t(`${K}.copyReport`)}
              copiedLabel={t(`${K}.copied`)}
              className="inline-flex items-center gap-1.5 rounded-lg border bg-background px-2.5 py-1 text-xs text-foreground hover:border-primary"
            />
          </div>
        </div>
        <ul className="mt-4 grid grid-cols-3 gap-2 sm:grid-cols-6">
          {(
            [
              ["critical", counts.critical, "critical"],
              ["high", counts.high, "high"],
              ["medium", counts.medium, "medium"],
              ["low", counts.low, "low"],
              ["passed", counts.passed, "pass"],
              ["unchecked", counts.unchecked, "unchecked"],
            ] as const
          ).map(([key, n, tone]) => (
            <li key={key} className={cn("rounded-xl px-3 py-2", severityTone[tone])}>
              <span className="block text-xl font-bold tabular-nums">{n}</span>
              <span className="block text-xs text-muted-foreground">{t(`${K}.counts.${key}`)}</span>
            </li>
          ))}
        </ul>
      </section>

      <LiquidityHoldersCard
        t={t}
        report={report}
        locale={locale}
        dexes={dexes}
        right={<ClassChip t={t} cls="verified" />}
      />

      <div className="grid items-start gap-4 lg:grid-cols-[1.4fr_1fr]">
        <div className="flex flex-col gap-4">
          <TradeCard t={t} report={report} locale={locale} dexes={dexes} />
          <OwnerCard t={t} report={report} locale={locale} />
          <ChecksCard t={t} checks={checks} />
        </div>
        <div className="flex flex-col gap-4">
          <HoldersCard t={t} report={report} locale={locale} />
          <SecondCard t={t} report={report} />
          <Card id="sec-facts" title={t(`${K}.facts.title`)} icon={Info}>
            <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
              <dt className="text-muted-foreground">{t(`${K}.facts.supply`)}</dt>
              <dd className="text-end tabular-nums">
                {formatAmount(facts.token.totalSupply, facts.token.decimals, locale, 2)} <bdi>{facts.token.symbol}</bdi>
              </dd>
              <dt className="text-muted-foreground">{t(`${K}.facts.decimals`)}</dt>
              <dd className="text-end tabular-nums">{facts.token.decimals}</dd>
              <dt className="text-muted-foreground">{t(`${K}.facts.contract`)}</dt>
              <dd className="technical truncate text-end text-xs" dir="ltr" title={facts.address}>
                {facts.address}
              </dd>
            </dl>
          </Card>
          <p className="text-xs leading-relaxed text-muted-foreground">{t(`${K}.disclaimer`)}</p>
        </div>
      </div>
    </div>
  );
}

function TradeCard({ t, report, locale, dexes }: { t: T; report: SecurityReport; locale: Locale; dexes: string }) {
  const trade = report.facts.trade;
  const ran = trade.venue && !["no-pool", "unsupported-pool", "no-liquidity", "error"].includes(trade.outcome);
  const step = (label: string, ok: boolean | null, tax: number | null, reason?: string | null) => (
    <div className={cn("rounded-xl border p-3", ok === false && "border-critical/50 bg-critical/5")}>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p
        className={cn(
          "mt-1 flex items-center gap-1.5 font-semibold",
          ok === true ? "text-low" : ok === false ? "text-critical" : "text-muted-foreground",
        )}
      >
        {ok === true ? (
          <CircleCheck className="size-4" aria-hidden="true" />
        ) : ok === false ? (
          <CircleX className="size-4" aria-hidden="true" />
        ) : null}
        {t(`${K}.trade.${ok === true ? "worked" : ok === false ? "blocked" : "notRun"}`)}
      </p>
      {tax !== null && <p className="mt-1 text-sm">{t(`${K}.trade.tax`, { tax: pct(tax) })}</p>}
      {reason !== undefined && ok === false && (
        <p className="mt-1 text-xs break-words">
          {reason ? t(`${K}.trade.said`, { reason }) : t(`${K}.trade.noReason`)}
        </p>
      )}
    </div>
  );
  const o = trade.outcome;
  const buyOk = !ran ? null : o === "buy-failed" || o === "buy-nothing" || o === "quote-failed" ? false : true;
  const transferOk = !ran || buyOk === false ? null : o === "transfer-failed" ? false : true;
  const sellOk =
    !ran || buyOk === false || transferOk === false
      ? null
      : o === "sell-failed" || o === "approve-failed"
        ? false
        : true;
  return (
    <Card
      id="sec-trade"
      title={t(`${K}.trade.title`)}
      icon={FlaskConical}
      right={<ClassChip t={t} cls={ran ? "simulated" : "unsupported"} />}
    >
      {ran ? (
        <>
          <p className="mb-3 text-sm text-muted-foreground">{t(`${K}.trade.intro`, { dex: trade.venue!.dex })}</p>
          <div className="grid gap-2 sm:grid-cols-3">
            {step(t(`${K}.trade.buy`), buyOk, trade.buyTax, buyOk === false ? trade.reason : undefined)}
            {step(
              t(`${K}.trade.transfer`),
              transferOk,
              trade.transferTax,
              transferOk === false ? trade.reason : undefined,
            )}
            {step(
              t(`${K}.trade.sell`),
              sellOk,
              trade.feeRejected != null ? null : trade.sellTax,
              sellOk === false && trade.feeRejected == null ? trade.reason : undefined,
            )}
          </div>
          {trade.feeRejected != null && (
            <p className="mt-3 text-sm text-critical">{t(`${K}.trade.feeRejected`, { tax: pct(trade.feeRejected) })}</p>
          )}
          {trade.venue!.via && (
            <p className="mt-3 text-xs text-muted-foreground">{t(`${K}.trade.via`, { symbol: trade.venue!.via })}</p>
          )}
          <p className="mt-3 text-xs text-muted-foreground">
            {t(`${K}.trade.footer`, {
              amount: formatAmount(trade.amountIn ?? "0", 18, locale, 6),
              symbol: trade.nativeSymbol,
              pool: shortenId(trade.venue!.pool),
            })}
          </p>
        </>
      ) : (
        <p className="text-sm text-muted-foreground">
          {t(
            `${K}.trade.why.${o === "no-pool" ? "noPool" : o === "unsupported-pool" ? "unsupportedPool" : o === "no-liquidity" ? "noLiquidity" : "error"}`,
            { dexes },
          )}
        </p>
      )}
    </Card>
  );
}

function OwnerCard({ t, report, locale }: { t: T; report: SecurityReport; locale: Locale }) {
  const { owner } = report.facts;
  const state =
    owner.owner === null ? "none" : owner.renounced ? "renounced" : owner.ownerIsContract ? "contract" : "wallet";
  const powers = report.checks.filter((c) => c.id.startsWith("power."));
  const sourceDetails = (power: string) =>
    (report.facts.powers.find((p) => p.power === power && p.basis === "source")?.details ?? []).slice(0, 4);
  return (
    <Card id="sec-owner" title={t(`${K}.owner.title`)} icon={Crown}>
      <div className="flex items-center gap-3 rounded-xl border bg-background px-3 py-2.5">
        <Crown className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
        <div className="min-w-0">
          <p className="text-sm font-semibold">{t(`${K}.owner.state.${state}`)}</p>
          {owner.owner && !owner.renounced && (
            <Link
              href={localePath(locale, `/address/${owner.owner}`)}
              prefetch={false}
              className="technical text-xs text-primary hover:underline"
              dir="ltr"
            >
              {shortenId(owner.owner)}
            </Link>
          )}
        </div>
        <span className="ms-auto">
          <ClassChip t={t} cls="verified" />
        </span>
      </div>
      {powers.length > 0 ? (
        <ul className="mt-2 divide-y">
          {powers.map((check) => {
            const power = check.id.slice(6);
            const usable = check.values?.usable;
            return (
              <li key={check.id} className="flex items-start gap-3 py-3 text-sm">
                <span className="w-24 shrink-0">
                  <SeverityChip t={t} check={check} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block font-semibold">{t(`${K}.owner.power.${power}`)}</span>
                  {sourceDetails(power).length > 0 ? (
                    <span className="block text-xs text-muted-foreground">
                      {t(`${K}.owner.fromSourceTitle`)}
                      {sourceDetails(power).map((d) => (
                        <span key={d.signature} className="mt-0.5 block">
                          <span className="technical" dir="ltr">
                            {d.signature}
                          </span>{" "}
                          · {t(`${K}.owner.whoCalls`, { access: t(`${K}.owner.access.${d.access}`) })}
                          {d.limits.map((l) => (
                            <span key={l} className="block">
                              {t(`${K}.owner.limitLabel`)}{" "}
                              <span className="technical" dir="ltr">
                                {l}
                              </span>
                            </span>
                          ))}
                        </span>
                      ))}
                    </span>
                  ) : (
                    <span className="technical block text-xs text-muted-foreground" dir="ltr">
                      {t(`${K}.owner.found`, { functions: String(check.values?.functions ?? "") })}
                    </span>
                  )}
                  {usable === "no" && <span className="block text-xs text-low">{t(`${K}.owner.notUsable`)}</span>}
                  {usable === "contract" && (
                    <span className="block text-xs text-muted-foreground">{t(`${K}.owner.byContract`)}</span>
                  )}
                </span>
                <ClassChip t={t} cls="heuristic" />
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="mt-3 text-sm text-muted-foreground">{t(`${K}.owner.nothing`)}</p>
      )}
      <p className="mt-2 text-xs text-muted-foreground">{t(`${K}.owner.note`)}</p>
    </Card>
  );
}

function ChecksCard({ t, checks }: { t: T; checks: SecurityCheck[] }) {
  const first = checks.slice(0, 8);
  const rest = checks.slice(8);
  return (
    <Card id="sec-checks" title={t(`${K}.allChecks`, { count: checks.length })} icon={ListChecks}>
      <ul className="divide-y border-t">
        {first.map((c) => (
          <CheckRow key={c.id} t={t} check={c} />
        ))}
      </ul>
      {rest.length > 0 && (
        <details className="border-t pt-2">
          <summary className="cursor-pointer text-sm text-primary">
            {t(`${K}.showAll`, { count: checks.length })}
          </summary>
          <ul className="divide-y">
            {rest.map((c) => (
              <CheckRow key={c.id} t={t} check={c} />
            ))}
          </ul>
        </details>
      )}
    </Card>
  );
}

function HoldersCard({ t, report, locale }: { t: T; report: SecurityReport; locale: Locale }) {
  const ext = report.facts.external;
  const h = ext?.holders;
  const provider = ext?.provider ?? "GoPlus";
  if (!h) {
    return (
      <Card id="sec-holders" title={t(`${K}.holders.title`)} icon={Users} right={<ClassChip t={t} cls="unsupported" />}>
        <p className="text-sm text-muted-foreground">{t(`${K}.holders.none`, { provider })}</p>
      </Card>
    );
  }
  const ago = utcTime(ext!.fetchedAt, locale);
  const tiles = [
    [t(`${K}.holders.count`), h.count !== null ? new Intl.NumberFormat(locale).format(h.count) : "—"],
    [t(`${K}.holders.top10`), h.top10 !== null ? pct(h.top10) : "—"],
    [t(`${K}.holders.owner`), h.ownerShare !== null ? pct(h.ownerShare) : "—"],
  ] as const;
  return (
    <Card
      id="sec-holders"
      title={t(`${K}.holders.title`)}
      icon={Users}
      right={<ClassChip t={t} cls="external" provider={provider} />}
    >
      <div className="grid grid-cols-3 gap-2">
        {tiles.map(([label, value]) => (
          <div key={label} className="rounded-xl border p-2.5">
            <p className="text-lg font-bold tabular-nums">{value}</p>
            <p className="text-xs text-muted-foreground">{label}</p>
          </div>
        ))}
      </div>
      <p className="mt-3 text-xs text-muted-foreground">{t(`${K}.holders.source`, { provider, time: ago })}</p>
    </Card>
  );
}

function SecondCard({ t, report }: { t: T; report: SecurityReport }) {
  const c = report.comparison;
  const provider = c?.provider ?? "GoPlus";
  return (
    <Card
      id="sec-second"
      title={t(`${K}.second.title`)}
      icon={Users}
      right={<ClassChip t={t} cls={c ? "external" : "unsupported"} provider={provider} />}
    >
      {!c ? (
        <p className="text-sm text-muted-foreground">{t(`${K}.second.none`, { provider })}</p>
      ) : (
        <>
          <p className="text-sm">{t(`${K}.second.agree`, { provider, agree: c.agree, shared: c.shared })}</p>
          {c.differences.length > 0 && (
            <ul className="mt-2 flex flex-col gap-1 rounded-xl bg-high/8 px-3 py-2 text-sm">
              {c.differences.map((d) => (
                <li key={d.id}>
                  <b>{t(`${K}.second.different`)}</b>{" "}
                  {t(`${K}.second.diff`, {
                    what: t(`${K}.second.ids.${d.id}`),
                    ours: /^\d/.test(d.ours) ? `${d.ours}%` : d.ours,
                    theirs: /^\d/.test(d.theirs) ? `${d.theirs}%` : d.theirs,
                    provider,
                  })}
                </li>
              ))}
            </ul>
          )}
          <p className="mt-2 text-xs text-muted-foreground">{t(`${K}.second.separate`, { provider })}</p>
        </>
      )}
    </Card>
  );
}
