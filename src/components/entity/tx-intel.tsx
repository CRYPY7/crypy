/**
 * Transaction Intelligence sections: the route assets took, the actions found (with evidence), the permissions
 * changed and the parties involved. Server-rendered; strings come from entity.tx.story.*.
 * Reusable templates: a connected route (any number of hops), or separate relationships when movements don't
 * connect. Nothing here is specific to one protocol or token.
 */
import Link from "next/link";
import {
  ArrowDown,
  ArrowDownUp,
  ArrowRight,
  Boxes,
  Droplets,
  FileCode2,
  Flame,
  KeyRound,
  ListChecks,
  Megaphone,
  Repeat,
  Send,
  ShieldCheck,
  Sparkles,
  User,
  Users,
  Wallet,
} from "lucide-react";
import { shortenId } from "@/lib/format/amount";
import { localePath } from "@/lib/routes";
import { type ActionType, type InvolvedParty, type PartyRole, type TxAction, involvedParties } from "@/lib/tx/actions";
import type { AssetAmount } from "@/lib/tx/assets";
import { type RouteEdge, type TxRoute, buildRoute } from "@/lib/tx/route";
import { cn } from "@/lib/utils";
import { CopyText, YouBadge } from "./tx-client";
import { AssetChip, Box, LevelChip, type StoryContext, Tip, formatAsset } from "./tx-story";

const s = (ctx: StoryContext, key: string, values?: Record<string, string | number>) =>
  ctx.t(`entity.tx.story.${key}`, values);

// ---------- shared analysis (computed once per page) ----------

interface Intel {
  route: TxRoute | null;
  parties: InvolvedParty[];
  byAddress: Map<string, InvolvedParty>;
}

const cache = new WeakMap<object, Intel>();

export function intelOf(ctx: StoryContext): Intel {
  const hit = cache.get(ctx.it);
  if (hit) return hit;
  const route = buildRoute(ctx.tx, ctx.it.set, ctx.chain.nativeSymbol);
  const fees = (route?.side ?? []).filter((e) => e.possibleFee).map((e) => e.to);
  const parties = involvedParties(ctx.tx, ctx.it.set, fees);
  const intel = { route, parties, byAddress: new Map(parties.map((p) => [p.address.toLowerCase(), p])) };
  cache.set(ctx.it, intel);
  return intel;
}

/** Whether the route template replaces the simple two-party flow. */
export function showsRoute(ctx: StoryContext): boolean {
  if (ctx.tx.status !== "success") return false;
  const route = intelOf(ctx).route;
  if (!route) return false;
  return route.mode === "path" ? route.path.length >= 2 : route.side.length >= 3;
}

// ---------- party labels ----------

/** Short, neutral name for an address: never "your wallet" (anyone can look up any transaction). */
export function whoLabel(ctx: StoryContext, address: string | undefined): string {
  if (!address) return "";
  const key = address.toLowerCase();
  if (key === ctx.tx.from.toLowerCase()) return s(ctx, "who.sender");
  const party = intelOf(ctx).byAddress.get(key);
  if (party?.pool) {
    return party.pool.verified && party.pool.dex
      ? s(ctx, "who.pool", { dex: party.pool.dex })
      : s(ctx, "who.poolUnverified");
  }
  if (party?.known) return party.known.name;
  const token = ctx.tx.tokens[key];
  if (token?.symbol) return s(ctx, "who.token", { symbol: token.symbol });
  return shortenId(address);
}

function nodeKind(
  ctx: StoryContext,
  address: string,
): { name: string; Icon: typeof User; badge?: string; tone?: string } {
  const key = address.toLowerCase();
  const party = intelOf(ctx).byAddress.get(key);
  if (key === ctx.tx.from.toLowerCase()) return { name: s(ctx, "who.senderWallet"), Icon: Wallet };
  if (party?.pool) {
    return party.pool.verified && party.pool.dex
      ? {
          name: s(ctx, "who.pool", { dex: party.pool.dex }),
          Icon: Droplets,
          badge: s(ctx, "route.verifiedPool"),
          tone: "low",
        }
      : { name: s(ctx, "who.poolUnverified"), Icon: Droplets, badge: s(ctx, "route.unverifiedPool"), tone: "high" };
  }
  if (party?.known) return { name: party.known.name, Icon: FileCode2, badge: s(ctx, "route.knownName") };
  if (party?.isContract === true) return { name: s(ctx, "flow.contract"), Icon: FileCode2 };
  if (party?.isContract === false) return { name: s(ctx, "flow.wallet"), Icon: User };
  return { name: s(ctx, "flow.address"), Icon: User };
}

function AddressLine({ ctx, address }: { ctx: StoryContext; address: string }) {
  return (
    <span className="flex items-center gap-1.5">
      <Link
        href={localePath(ctx.locale, `/address/${address}`)}
        prefetch={false}
        className="technical text-[13px] text-primary hover:underline"
        title={address}
        dir="ltr"
      >
        {shortenId(address)}
      </Link>
      <CopyText
        text={address}
        label={s(ctx, "flow.copy")}
        copiedLabel={ctx.t("entity.copied")}
        iconOnly
        className="inline-flex text-muted-foreground hover:text-foreground"
      />
    </span>
  );
}

// ---------- route ----------

function RouteNode({ ctx, address, transforms }: { ctx: StoryContext; address: string; transforms: RouteEdge[] }) {
  const { name, Icon, badge, tone } = nodeKind(ctx, address);
  const isSender = address.toLowerCase() === ctx.tx.from.toLowerCase();
  return (
    <div className={cn("w-full min-w-0 rounded-xl border bg-card p-3 sm:w-80", isSender && "border-primary/60")}>
      <div className="flex items-center gap-2.5">
        <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
          <Icon className="size-4" aria-hidden="true" />
        </span>
        <div className="min-w-0">
          <p className="flex flex-wrap items-center gap-1.5 text-sm font-semibold">
            <span className="truncate">{name}</span>
            {isSender && <YouBadge address={address} label={s(ctx, "who.you")} />}
          </p>
          <AddressLine ctx={ctx} address={address} />
        </div>
      </div>
      {badge && (
        <span
          className={cn(
            "mt-2 inline-block rounded px-1.5 py-0.5 text-[11px]",
            tone === "low"
              ? "bg-low/14 text-low"
              : tone === "high"
                ? "bg-high/14 text-high"
                : "bg-muted text-muted-foreground",
          )}
        >
          {badge}
        </span>
      )}
      {transforms.map((edge) => (
        <p key={edge.logIndex} className="mt-2 flex items-center gap-1.5 text-xs text-muted-foreground">
          <Repeat className="size-3.5 shrink-0" aria-hidden="true" />
          <bdi>
            {s(ctx, edge.kind === "unwrap" ? "route.unwrapped" : "route.wrapped", {
              amount: formatAsset(ctx, edge.asset),
            })}
          </bdi>
        </p>
      ))}
    </div>
  );
}

function RouteArrow({ ctx, edge }: { ctx: StoryContext; edge: RouteEdge }) {
  const note =
    edge.kind === "reported"
      ? edge.evidence === "chain"
        ? s(ctx, "route.reportedMatched")
        : s(ctx, "route.reported")
      : edge.kind === "internal"
        ? s(ctx, "route.measured")
        : edge.kind === "native"
          ? s(ctx, "route.sentWithCall")
          : null;
  const dashed = edge.kind === "reported" && edge.evidence !== "chain";
  return (
    <div className="flex items-stretch gap-3 ps-6">
      <span aria-hidden="true" className="flex flex-col items-center text-primary">
        <span className={cn("w-0 flex-1 border-s-2 border-current", dashed && "border-dashed")} />
        <ArrowDown className="-mt-1 size-4" />
      </span>
      <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 py-2">
        <AssetChip ctx={ctx} asset={edge.asset} />
        {note && <span className="text-xs text-muted-foreground">{note}</span>}
        {edge.logIndex >= 0 && edge.logIndex < Number.MAX_SAFE_INTEGER && (
          <span className="text-xs text-muted-foreground tabular-nums">#{edge.logIndex}</span>
        )}
      </div>
    </div>
  );
}

function SideList({ ctx, edges }: { ctx: StoryContext; edges: RouteEdge[] }) {
  if (edges.length === 0) return null;
  const shown = edges.slice(0, 8);
  return (
    <ul className="mt-3 flex flex-col gap-1.5 border-t pt-3 text-sm">
      {shown.map((edge) => (
        <li key={`${edge.logIndex}-${edge.to}`} className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <span className="text-muted-foreground">{whoLabel(ctx, edge.from)}</span>
          <ArrowRight className="size-3.5 text-muted-foreground rtl:rotate-180" aria-hidden="true" />
          <bdi className="font-semibold tabular-nums">{formatAsset(ctx, edge.asset)}</bdi>
          <ArrowRight className="size-3.5 text-muted-foreground rtl:rotate-180" aria-hidden="true" />
          <Link
            href={localePath(ctx.locale, `/address/${edge.to}`)}
            prefetch={false}
            className="technical text-primary hover:underline"
            dir="ltr"
          >
            {whoLabel(ctx, edge.to)}
          </Link>
          {edge.possibleFee ? (
            <LevelChip ctx={ctx} level="interpreted" label={s(ctx, "route.possibleFee")} />
          ) : (
            <span className="text-xs text-muted-foreground">#{edge.logIndex >= 0 ? edge.logIndex : "—"}</span>
          )}
        </li>
      ))}
      {edges.length > shown.length && (
        <li className="text-xs text-muted-foreground">
          {s(ctx, "route.more", { count: edges.length - shown.length })}
        </li>
      )}
    </ul>
  );
}

export function StoryRoute(ctx: StoryContext) {
  if (!showsRoute(ctx)) return null;
  const route = intelOf(ctx).route!;
  const { tx } = ctx;
  const called = tx.to && intelOf(ctx).byAddress.get(tx.to.toLowerCase());

  let body: React.ReactNode;
  if (route.mode === "path") {
    // Group the path into nodes; wraps/unwraps happen inside a node and are shown on its card.
    const items: React.ReactNode[] = [];
    let pending: RouteEdge[] = [];
    let node = route.path[0]!.from;
    route.path.forEach((edge, i) => {
      if (edge.kind === "wrap" || edge.kind === "unwrap") {
        pending.push(edge);
        return;
      }
      items.push(<RouteNode key={`n${i}`} ctx={ctx} address={node} transforms={pending} />);
      items.push(<RouteArrow key={`e${i}`} ctx={ctx} edge={edge} />);
      pending = [];
      node = edge.to;
    });
    items.push(<RouteNode key="last" ctx={ctx} address={node} transforms={pending} />);
    body = <div className="flex flex-col items-stretch">{items}</div>;
  } else {
    body = <p className="text-sm text-muted-foreground">{s(ctx, "route.relationsIntro")}</p>;
  }

  return (
    <section aria-labelledby="tx-route" className="rounded-2xl border bg-background p-4 md:p-5">
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <ArrowDownUp className="size-[18px] text-primary" aria-hidden="true" />
        <h2 id="tx-route" className="font-sans text-base font-semibold">
          {s(ctx, route.mode === "path" ? "route.title" : "route.relationsTitle")}
        </h2>
        <span className="text-xs text-muted-foreground">{s(ctx, "route.hint")}</span>
      </div>
      {body}
      <SideList ctx={ctx} edges={route.side} />
      {called && (
        <p className="mt-3 flex flex-wrap items-center gap-2 border-t pt-3 text-xs text-muted-foreground">
          <FileCode2 className="size-3.5" aria-hidden="true" />
          {s(ctx, "route.called", { name: called.known?.name ?? shortenId(called.address) })}
        </p>
      )}
    </section>
  );
}

// ---------- actions ----------

const actionIcon: Partial<Record<ActionType, typeof Send>> = {
  "pool-swap": Droplets,
  "router-swap": Megaphone,
  "liquidity-add": Droplets,
  "liquidity-remove": Droplets,
  wrap: Repeat,
  unwrap: Repeat,
  mint: Sparkles,
  burn: Flame,
  "contract-creation": Sparkles,
  "smart-wallet": ShieldCheck,
  "user-operation": ShieldCheck,
  "permission-used": KeyRound,
  "permission-granted": KeyRound,
  "permission-modified": KeyRound,
  "permission-set": KeyRound,
  "permission-revoked": KeyRound,
};

export function actionText(ctx: StoryContext, a: TxAction): string {
  const asset = (x: AssetAmount | undefined | null) => (x ? formatAsset(ctx, x) : "?");
  const tokenSymbol = (x: AssetAmount | undefined) => x?.symbol || (x ? shortenId(x.token) : "");
  const values: Record<string, string> = {
    from: whoLabel(ctx, a.from),
    to: whoLabel(ctx, a.to),
    amount: asset(a.asset),
    in: asset(a.assetIn),
    out: asset(a.assetOut),
    pool: whoLabel(ctx, a.pool),
    owner: whoLabel(ctx, a.owner),
    spender: whoLabel(ctx, a.spender),
    after: a.unlimited ? s(ctx, "flow.unlimited") : asset(a.after),
    token: tokenSymbol(a.after),
    router: whoLabel(ctx, a.router),
    native: ctx.chain.nativeSymbol,
    result: s(ctx, a.success === false ? "actions.failedResult" : "actions.okResult"),
  };
  let key: string = a.type;
  if (a.type === "pool-swap" && (!a.assetIn || !a.assetOut)) key = "pool-swap-unknown";
  if ((a.type === "liquidity-add" || a.type === "liquidity-remove") && (!a.assetIn || !a.assetOut))
    key = `${a.type}-unknown`;
  const text = s(ctx, `actions.${key}`, values);
  return a.type === "router-swap" && a.app ? `${text} ${s(ctx, "actions.app", { app: a.app })}` : text;
}

export function StoryActions(props: StoryContext & { idSuffix?: string }) {
  const { idSuffix = "", ...ctx } = props;
  const { tx, it } = ctx;
  if (tx.status !== "success") return null;
  const { actions, coverage } = it.set;
  // One plain action is already the headline; the list adds value from two actions or any unexplained event.
  if (actions.length <= 1 && coverage.unexplained.length === 0) return null;
  const shown = actions.slice(0, 10);
  const rest = actions.slice(10);
  const row = (a: TxAction, i: number) => {
    const Icon = actionIcon[a.type] ?? Send;
    return (
      <li key={i} className="flex items-start gap-3 py-2.5 text-sm">
        <Icon className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden="true" />
        <span className="min-w-0 flex-1">
          <bdi>{actionText(ctx, a)}</bdi>
          {a.logs.length > 0 && (
            <span className="ms-2 text-xs text-muted-foreground tabular-nums">
              {a.logs.map((l) => `#${l}`).join(" ")}
            </span>
          )}
        </span>
        <LevelChip ctx={ctx} level={a.evidence} />
      </li>
    );
  };
  return (
    <Box
      id={`tx-actions${idSuffix}`}
      title={s(ctx, "actions.title", { count: actions.length })}
      icon={ListChecks}
      right={
        coverage.total > 0 ? (
          <span className="text-xs text-muted-foreground">
            {s(ctx, "actions.coverage", { explained: coverage.explained, total: coverage.total })}
            <Tip text={s(ctx, "actions.coverageTip")} />
          </span>
        ) : undefined
      }
    >
      <ul className="divide-y border-t">{shown.map(row)}</ul>
      {rest.length > 0 && (
        <details className="border-t pt-2">
          <summary className="cursor-pointer text-sm text-primary">
            {s(ctx, "actions.more", { count: rest.length })}
          </summary>
          <ul className="divide-y">{rest.map((a, i) => row(a, i + shown.length))}</ul>
        </details>
      )}
      {coverage.unexplained.length > 0 && (
        <div className="mt-3 rounded-lg border bg-background px-3 py-2.5 text-xs">
          <p className="font-medium">{s(ctx, "actions.unexplainedTitle", { count: coverage.unexplained.length })}</p>
          <ul className="mt-1 flex flex-col gap-0.5 text-muted-foreground">
            {coverage.unexplained.slice(0, 6).map((e) => (
              <li key={e.index}>
                #{e.index} · {whoLabel(ctx, e.address)} ·{" "}
                <span className="technical" dir="ltr">
                  {e.topic}
                </span>
              </li>
            ))}
          </ul>
          <p className="mt-1.5 text-muted-foreground">{s(ctx, "actions.unexplainedNote")}</p>
        </div>
      )}
    </Box>
  );
}

// ---------- permissions ----------

function permissionAmount(ctx: StoryContext, token: string, raw: string): string {
  if (BigInt(raw) >= 1n << 255n) return s(ctx, "flow.unlimited");
  const info = ctx.tx.tokens[token.toLowerCase()];
  return formatAsset(ctx, {
    token,
    standard: "erc20",
    raw,
    decimals: info?.decimals ?? null,
    symbol: info?.symbol || info?.name || "",
  });
}

export function StoryPermissions(ctx: StoryContext) {
  const { tx, it, locale } = ctx;
  const groups = it.set.permissions;
  if (tx.status !== "success" || groups.length === 0) return null;
  const checked = new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "short", timeZone: "UTC" }).format(
    new Date(tx.checkedAt),
  );
  return (
    <Box id="tx-permissions" title={s(ctx, "permissions.title")} icon={KeyRound}>
      <div className="flex flex-col gap-4">
        {groups.slice(0, 5).map((g, gi) => {
          const symbol = ctx.tx.tokens[g.token.toLowerCase()]?.symbol || shortenId(g.token);
          const lastChange = g.steps.at(-1)!.change;
          const status = g.onlyUsed ? "used" : lastChange;
          const amountKind = g.kind === "amount";
          return (
            <div key={gi} className={cn(gi > 0 && "border-t pt-4")}>
              <p className="flex flex-wrap items-center gap-2 text-sm">
                <span className="font-semibold">
                  <bdi>{s(ctx, "permissions.heading", { token: symbol, spender: whoLabel(ctx, g.spender) })}</bdi>
                </span>
                <span
                  className={cn(
                    "rounded px-2 py-0.5 text-xs font-medium",
                    status === "used" || status === "revoked"
                      ? "bg-low/14 text-low"
                      : g.steps.some((st) => st.unlimited)
                        ? "bg-critical/14 text-critical"
                        : "bg-high/14 text-high",
                  )}
                >
                  {s(ctx, `permissions.status.${status}`)}
                </span>
              </p>
              {amountKind ? (
                <dl className="mt-2 grid grid-cols-[auto_1fr_auto] items-center gap-x-4 gap-y-1.5 text-sm">
                  <dt className="text-muted-foreground">{s(ctx, "permissions.before")}</dt>
                  <dd className="tabular-nums">
                    <bdi>{g.before ? permissionAmount(ctx, g.token, g.before.raw) : s(ctx, "permissions.unknown")}</bdi>
                  </dd>
                  <dd>
                    {g.before ? (
                      <LevelChip
                        ctx={ctx}
                        level={g.before.evidence}
                        label={s(ctx, g.before.evidence === "chain" ? "permissions.readBefore" : "permissions.derived")}
                      />
                    ) : (
                      <LevelChip ctx={ctx} level="unknown" />
                    )}
                  </dd>
                  {g.steps.map((step) => (
                    <div key={step.logIndex} className="contents">
                      <dt className="ps-3 text-muted-foreground">
                        #{step.logIndex} {s(ctx, `permissions.change.${step.change}`)}
                      </dt>
                      <dd className="tabular-nums">
                        <bdi>{permissionAmount(ctx, g.token, step.value)}</bdi>
                        {step.usedBy !== null && (
                          <span className="ms-2 text-xs text-muted-foreground">
                            {s(ctx, "permissions.usedBy", { index: step.usedBy })}
                          </span>
                        )}
                      </dd>
                      <dd>
                        <LevelChip ctx={ctx} level={step.evidence} />
                      </dd>
                    </div>
                  ))}
                  <dt className="font-medium">{s(ctx, "permissions.after")}</dt>
                  <dd className="font-semibold tabular-nums">
                    <bdi>{permissionAmount(ctx, g.token, g.after)}</bdi>
                  </dd>
                  <dd>
                    <LevelChip ctx={ctx} level="event" />
                  </dd>
                  <dt className="font-medium">{s(ctx, "permissions.today")}</dt>
                  <dd className="font-semibold tabular-nums">
                    <bdi>{g.now !== null ? permissionAmount(ctx, g.token, g.now) : s(ctx, "permissions.notRead")}</bdi>
                  </dd>
                  <dd>
                    {g.now !== null ? (
                      <LevelChip ctx={ctx} level="chain" label={s(ctx, "permissions.readNow")} />
                    ) : (
                      <LevelChip ctx={ctx} level="unknown" />
                    )}
                  </dd>
                </dl>
              ) : (
                <p className="mt-1 text-sm text-muted-foreground">
                  {g.steps.map((st) => s(ctx, `permissions.change.${st.change}`)).join(" → ")}
                </p>
              )}
              {amountKind && g.now !== null && (
                <p className="mt-2 text-xs text-muted-foreground">
                  {s(ctx, "permissions.todayNote", { time: `${checked} UTC` })}
                </p>
              )}
            </div>
          );
        })}
      </div>
      <p className="mt-3 border-t pt-3 text-xs text-muted-foreground">{s(ctx, "permissions.eventsNote")}</p>
    </Box>
  );
}

// ---------- parties ----------

const roleIcon: Partial<Record<PartyRole, typeof User>> = {
  sender: Wallet,
  pool: Droplets,
  router: Megaphone,
  token: Boxes,
  spender: KeyRound,
  "smart-account": ShieldCheck,
  burn: Flame,
};

export function StoryParties(ctx: StoryContext) {
  const { tx } = ctx;
  if (tx.status !== "success") return null;
  const parties = intelOf(ctx).parties;
  if (parties.length < 4) return null;
  const shown = parties.slice(0, 8);
  const row = (p: InvolvedParty) => {
    const Icon = roleIcon[p.roles[0]!] ?? (p.isContract ? FileCode2 : User);
    const name = p.roles.includes("sender") ? s(ctx, "who.senderWallet") : whoLabel(ctx, p.address);
    return (
      <li key={p.address} className="flex items-start gap-3 py-2.5 text-sm">
        <Icon className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden="true" />
        <div className="min-w-0 flex-1">
          <p className="flex flex-wrap items-center gap-1.5">
            <span className="font-medium">
              <bdi>{name}</bdi>
            </span>
            {p.roles.includes("sender") && <YouBadge address={p.address} label={s(ctx, "who.you")} />}
            {p.isContract !== null && (
              <span className="text-xs text-muted-foreground">
                · {s(ctx, p.isContract ? "flow.contract" : "flow.wallet")}
              </span>
            )}
          </p>
          <AddressLine ctx={ctx} address={p.address} />
        </div>
        <span className="flex max-w-[50%] flex-wrap justify-end gap-1">
          {p.roles.map((role) => (
            <span
              key={role}
              className={cn(
                "rounded px-1.5 py-0.5 text-[11px]",
                role === "possible-fee" ? "bg-high/14 text-high" : "bg-muted text-muted-foreground",
              )}
            >
              {s(ctx, `roles.${role}`)}
            </span>
          ))}
        </span>
      </li>
    );
  };
  return (
    <Box id="tx-parties" title={s(ctx, "parties.title", { count: parties.length })} icon={Users}>
      <ul className="divide-y border-t">{shown.map(row)}</ul>
      {parties.length > shown.length && (
        <details className="border-t pt-2">
          <summary className="cursor-pointer text-sm text-primary">
            {s(ctx, "parties.more", { count: parties.length - shown.length })}
          </summary>
          <ul className="divide-y">{parties.slice(shown.length).map(row)}</ul>
        </details>
      )}
      <p className="mt-2 text-xs text-muted-foreground">{s(ctx, "parties.note")}</p>
    </Box>
  );
}
