import "server-only";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import {
  CircleCheck,
  CircleX,
  Crown,
  Droplets,
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
import { formatUsd } from "@/lib/format/money";
import { localePath } from "@/lib/routes";
import { pct } from "@/lib/security/evaluate";
import type { CheckClass, SecurityCheck, SecurityReport } from "@/lib/security/types";
import { cn } from "@/lib/utils";
import { dexDeployments } from "@/server/chains/evm/security/dex-registry";
import { cachedTokenSecurity } from "@/server/services/lookups";
import { Notice } from "./entity-parts";
import { CopyText } from "./tx-client";

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
  return v;
}

/** Title and detail for a check, including the special cases (clones, empty pools, burned proxy admin). */
function checkText(check: SecurityCheck, t: T): { title: string; detail: string } {
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
  let detail = t(`${base}.detail`, values);
  if (check.id === "lp" && values.state === "owner") detail = t(`${K}.lpStates.owner`, values);
  if (check.id === "proxy" && values.admin === "burned") detail = t(`${K}.lpStates.proxyBurned`);
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
  const report = await cachedTokenSecurity(chainKey, address).catch(() => null);
  if (!report) return <Notice tone="warning">{t(`${K}.unavailable`)}</Notice>;
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

      <div className="grid items-start gap-4 lg:grid-cols-[1.35fr_1fr]">
        <div className="flex flex-col gap-4">
          <TradeCard t={t} report={report} locale={locale} dexes={dexes} />
          <OwnerCard t={t} report={report} locale={locale} />
          <ChecksCard t={t} checks={checks} />
        </div>
        <div className="flex flex-col gap-4">
          <LiquidityCard t={t} report={report} locale={locale} dexes={dexes} />
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
            {step(t(`${K}.trade.sell`), sellOk, trade.sellTax, sellOk === false ? trade.reason : undefined)}
          </div>
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
                  <span className="technical block text-xs text-muted-foreground" dir="ltr">
                    {t(`${K}.owner.found`, { functions: String(check.values?.functions ?? "") })}
                  </span>
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

function LiquidityCard({ t, report, locale, dexes }: { t: T; report: SecurityReport; locale: Locale; dexes: string }) {
  const all = [...report.facts.pools].sort((a, b) => (b.liquidityUsd ?? -1) - (a.liquidityUsd ?? -1));
  // Empty pools (under $1) are counted but not listed.
  const pools = all.filter((p) => p.liquidityUsd === null || p.liquidityUsd >= 1);
  const main = pools[0];
  const shown = pools.slice(0, 4);
  return (
    <Card
      id="sec-liquidity"
      title={t(`${K}.liquidity.title`)}
      icon={Droplets}
      right={<ClassChip t={t} cls="verified" />}
    >
      {!main ? (
        <p className="text-sm text-muted-foreground">
          {all.length > 0
            ? t(`${K}.liquidity.empty`, { count: all.length, dexes })
            : t(`${K}.liquidity.none`, { dexes })}
        </p>
      ) : (
        <>
          <ul className="flex flex-col gap-2">
            {shown.map((p) => (
              <li key={p.address} className="flex items-center gap-2 text-sm">
                <span className="min-w-0 flex-1 truncate">
                  <span className="font-medium">{p.dex}</span>{" "}
                  <span className="text-muted-foreground">
                    · <bdi>{report.facts.token.symbol}</bdi> / {p.pairedWith}
                  </span>
                </span>
                <span className="font-semibold tabular-nums">
                  {p.liquidityUsd !== null ? formatUsd(p.liquidityUsd, locale) : "—"}
                </span>
              </li>
            ))}
          </ul>
          {main.lp && (
            <>
              <div className="mt-4 flex h-2.5 overflow-hidden rounded-full bg-muted" aria-hidden="true">
                <span className="bg-critical" style={{ width: `${main.lp.owner * 100}%` }} />
                <span className="bg-low" style={{ width: `${main.lp.burned * 100}%` }} />
                <span className="bg-primary" style={{ width: `${main.lp.locked * 100}%` }} />
              </div>
              <p className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
                {(["owner", "burned", "locked", "other"] as const).map((k) => (
                  <span key={k}>
                    <b className="text-foreground">{pct(main.lp![k])}</b> {t(`${K}.liquidity.shares.${k}`)}
                  </span>
                ))}
              </p>
            </>
          )}
          <p className="mt-3 text-xs text-muted-foreground">{t(`${K}.liquidity.note`, { count: all.length, dexes })}</p>
        </>
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
