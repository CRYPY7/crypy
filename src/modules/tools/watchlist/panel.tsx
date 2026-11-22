"use client";

import {
  Bell,
  Coins,
  Download,
  KeyRound,
  LogOut,
  Pencil,
  Plus,
  Send,
  ShieldCheck,
  Trash2,
  TriangleAlert,
  Wallet,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { ChainIcon } from "@/components/chain-icon";
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { checkWalletInput, cleanLabel } from "@/lib/portfolio/input";
import { cn } from "@/lib/utils";
import { type AddressRules, MAX_WATCH_ITEMS, type TokenRules, type WatchItem } from "@/lib/watchlist/rules";
import { Panel, fill, inputClass } from "@/modules/tools/shared/ui";
import { useWallet } from "@/wallets/wallet-root";
import type { WatchlistProps } from "./widget";

type Strings = Record<string, string>;
const AMOUNTS = [null, 100, 1_000, 10_000, 100_000, 1_000_000] as const;
const short = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`;

async function api<T>(
  path: string,
  init?: RequestInit,
): Promise<{ ok: true; data: T } | { ok: false; status: number }> {
  try {
    const response = await fetch(path, {
      ...init,
      credentials: "same-origin",
      headers: { Accept: "application/json", ...(init?.body ? { "Content-Type": "application/json" } : {}) },
    });
    const body = (await response.json().catch(() => null)) as { ok?: boolean; data?: T } | null;
    return body?.ok && body.data !== undefined ? { ok: true, data: body.data } : { ok: false, status: response.status };
  } catch {
    return { ok: false, status: 0 };
  }
}

export default function WatchlistPanel({
  strings: s,
  chainNames,
  tokenChains,
  locale,
  addressPrefix,
  tokenPrefix,
}: WatchlistProps) {
  const [account, setAccount] = useState<string | null | undefined>(undefined);
  const [items, setItems] = useState<WatchItem[] | null>(null);
  const [problem, setProblem] = useState<string | null>(null);

  /** Bumped after signing in, to read the session and watchlist again. */
  const [version, setVersion] = useState(0);

  useEffect(() => {
    let active = true;
    void (async () => {
      const session = await api<{ address: string | null }>("/api/v1/auth/session");
      if (!active) return;
      if (!session.ok) {
        setAccount(null);
        setProblem(s.errUnavailable!);
        return;
      }
      setAccount(session.data.address);
      if (!session.data.address) return;
      const list = await api<{ items: WatchItem[] }>("/api/v1/watchlist");
      if (!active) return;
      if (list.ok) setItems(list.data.items);
      else setProblem(s.errUnavailable!);
    })();
    return () => {
      active = false;
    };
  }, [s, version]);

  if (account === undefined) {
    return (
      <Panel>
        <p className="text-muted-foreground" aria-busy="true">
          {s.loading}
        </p>
      </Panel>
    );
  }
  if (!account) return <SignIn s={s} problem={problem} onSignedIn={() => setVersion((v) => v + 1)} />;

  return (
    <SignedIn
      s={s}
      account={account}
      items={items}
      setItems={setItems}
      chainNames={chainNames}
      tokenChains={tokenChains}
      locale={locale}
      addressPrefix={addressPrefix}
      tokenPrefix={tokenPrefix}
      onSignedOut={() => {
        setItems(null);
        setAccount(null);
      }}
    />
  );
}

/** Board 40, steps 1–2: sign in with a signed message. Nothing happens until the person clicks. */
function SignIn({ s, problem, onSignedIn }: { s: Strings; problem: string | null; onSignedIn: () => void }) {
  const { state, openWallet, closeWallet, actions } = useWallet();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(problem);
  const pending = useRef(false);
  const connected = state.status === "connected" && !!state.address;

  const start = useCallback(async () => {
    if (!actions) return;
    setBusy(true);
    setError(null);
    const outcome = await actions.signIn();
    setBusy(false);
    if (outcome.status === "signed-in") onSignedIn();
    else
      setError(
        {
          "no-wallet": s.errNoWallet!,
          "unsupported-chain": s.errChain!,
          rejected: s.errRejected!,
          "rate-limited": s.errRateLimited!,
          failed: s.errSignInFailed!,
        }[outcome.status],
      );
  }, [actions, onSignedIn, s]);

  // "Sign in" pressed before a wallet was connected: continue once the person has connected one.
  useEffect(() => {
    if (pending.current && connected && actions) {
      pending.current = false;
      // Show the page again so the person sees what they're signing in to while the wallet asks.
      closeWallet();
      void start();
    }
  }, [connected, actions, start, closeWallet]);

  const click = () => {
    if (connected && actions) void start();
    else {
      pending.current = true;
      openWallet();
    }
  };

  return (
    <Panel className="flex flex-col gap-5">
      <div>
        <h2 className="text-xl font-semibold">{s.signInTitle}</h2>
        <p className="mt-1 text-muted-foreground">{s.signInIntro}</p>
      </div>
      <ol className="flex flex-col gap-4">
        <li className="flex gap-3">
          <Step n={1} />
          <div className="min-w-0">
            <p className="font-medium">{s.step1Title}</p>
            <p className="text-sm text-muted-foreground">{s.step1Text}</p>
          </div>
        </li>
        <li className="flex gap-3">
          <Step n={2} />
          <div className="min-w-0">
            <p className="font-medium">{s.step2Title}</p>
            <p className="text-sm text-muted-foreground">{fill(s.step2Text!, { site: window.location.host })}</p>
            <p className="mt-2 flex items-start gap-2 rounded-xl border border-medium/40 bg-medium/8 p-3 text-sm">
              <TriangleAlert className="mt-0.5 size-4 shrink-0 text-medium" aria-hidden="true" />
              {s.step2Warning}
            </p>
          </div>
        </li>
      </ol>
      <div className="flex flex-wrap items-center gap-3">
        <button type="button" onClick={click} disabled={busy} className={primaryButton}>
          <KeyRound className="size-4" aria-hidden="true" />
          {busy ? s.signingIn : connected ? s.signIn : s.connectAndSignIn}
        </button>
        {connected && state.address && (
          <span className="technical text-sm text-muted-foreground" dir="ltr">
            {short(state.address)}
          </span>
        )}
      </div>
      {error && (
        <p role="alert" className="text-sm text-critical">
          {error}
        </p>
      )}
      <p className="text-sm text-muted-foreground">{s.noAccountNeeded}</p>
    </Panel>
  );
}

function Step({ n }: { n: number }) {
  return (
    <span className="grid size-7 shrink-0 place-items-center rounded-full bg-primary/12 text-sm font-semibold text-primary">
      {n}
    </span>
  );
}

function SignedIn({
  s,
  account,
  items,
  setItems,
  chainNames,
  tokenChains,
  locale,
  addressPrefix,
  tokenPrefix,
  onSignedOut,
}: {
  s: Strings;
  account: string;
  items: WatchItem[] | null;
  setItems: (update: (prev: WatchItem[] | null) => WatchItem[] | null) => void;
  chainNames: Record<string, string>;
  tokenChains: string[];
  locale: string;
  addressPrefix: string;
  tokenPrefix: string;
  onSignedOut: () => void;
}) {
  const [adding, setAdding] = useState(false);
  const [renaming, setRenaming] = useState<WatchItem | null>(null);
  const [error, setError] = useState<string | null>(null);
  const list = items ?? [];
  const full = list.length >= MAX_WATCH_ITEMS;

  const patch = async (item: WatchItem, body: { label?: string; rules?: AddressRules | TokenRules }) => {
    const before = item;
    setItems((prev) => prev?.map((i) => (i.id === item.id ? ({ ...i, ...body } as WatchItem) : i)) ?? prev);
    const result = await api<{ item: WatchItem }>(`/api/v1/watchlist/${item.id}`, {
      method: "PATCH",
      body: JSON.stringify(body),
    });
    if (result.ok) setItems((prev) => prev?.map((i) => (i.id === item.id ? result.data.item : i)) ?? prev);
    else {
      setItems((prev) => prev?.map((i) => (i.id === item.id ? before : i)) ?? prev);
      setError(s.errSave!);
    }
  };

  const remove = async (item: WatchItem) => {
    const result = await api(`/api/v1/watchlist/${item.id}`, { method: "DELETE" });
    if (result.ok) setItems((prev) => prev?.filter((i) => i.id !== item.id) ?? prev);
    else setError(s.errSave!);
  };

  return (
    <div className="flex flex-col gap-4">
      <div
        className="flex items-start gap-3 rounded-2xl border border-medium/40 bg-medium/8 p-4 text-sm"
        data-testid="alerts-not-live"
      >
        <Bell className="mt-0.5 size-5 shrink-0 text-medium" aria-hidden="true" />
        <div>
          <p className="font-medium">{s.betaTitle}</p>
          <p className="text-muted-foreground">{s.betaText}</p>
        </div>
      </div>

      <Panel className="p-0 sm:p-0">
        <div className="flex flex-wrap items-center justify-between gap-3 px-4 pt-4 sm:px-6 sm:pt-5">
          <div>
            <h2 className="text-lg font-semibold">{s.watchTitle}</h2>
            <p className="text-sm text-muted-foreground" data-testid="watch-count">
              {fill(s.watching!, { count: list.length, max: MAX_WATCH_ITEMS })}
            </p>
          </div>
          <button type="button" onClick={() => setAdding(true)} disabled={full || !items} className={primaryButton}>
            <Plus className="size-4" aria-hidden="true" />
            {s.watchAnother}
          </button>
        </div>
        {error && (
          <p role="alert" className="px-4 pt-2 text-sm text-critical sm:px-6">
            {error}
          </p>
        )}
        {!items ? (
          <p className="px-4 py-6 text-muted-foreground sm:px-6" aria-busy="true">
            {s.loading}
          </p>
        ) : list.length === 0 ? (
          <div className="px-4 py-8 text-center sm:px-6">
            <p className="font-medium">{s.emptyTitle}</p>
            <p className="mt-1 text-sm text-muted-foreground">{s.emptyText}</p>
            <button
              type="button"
              className="mt-3 text-sm text-primary hover:underline"
              onClick={() =>
                void (async () => {
                  const result = await api<{ item: WatchItem }>("/api/v1/watchlist", {
                    method: "POST",
                    body: JSON.stringify({ kind: "address", target: account, label: s.myWallet }),
                  });
                  if (result.ok) setItems((prev) => [...(prev ?? []), result.data.item]);
                  else setError(s.errSave!);
                })()
              }
            >
              {fill(s.watchMine!, { address: short(account) })}
            </button>
          </div>
        ) : (
          <ul className="mt-3 divide-y divide-border border-t border-border">
            {list.map((item) => (
              <ItemRow
                key={item.id}
                item={item}
                own={item.kind === "address" && item.target.toLowerCase() === account.toLowerCase()}
                s={s}
                chainNames={chainNames}
                locale={locale}
                href={
                  item.kind === "token"
                    ? `${tokenPrefix}${item.chain}/${item.target}`
                    : `${addressPrefix}${item.target}`
                }
                onRules={(rules) => void patch(item, { rules })}
                onRename={() => setRenaming(item)}
                onRemove={() => void remove(item)}
              />
            ))}
          </ul>
        )}
      </Panel>

      <Panel className="flex items-start gap-3">
        <Send className="mt-0.5 size-5 shrink-0 text-muted-foreground" aria-hidden="true" />
        <div>
          <h2 className="font-semibold">{s.whereTitle}</h2>
          <p className="text-sm text-muted-foreground">{s.whereText}</p>
        </div>
      </Panel>

      <AccountPanel s={s} account={account} onSignedOut={onSignedOut} />

      {adding && (
        <AddDialog
          s={s}
          chainNames={chainNames}
          tokenChains={tokenChains}
          onClose={() => setAdding(false)}
          onAdded={(item) => {
            setItems((prev) => [...(prev ?? []), item]);
            setAdding(false);
          }}
        />
      )}
      {renaming && (
        <RenameDialog
          s={s}
          item={renaming}
          onClose={() => setRenaming(null)}
          onSave={(label) => {
            void patch(renaming, { label });
            setRenaming(null);
          }}
        />
      )}
    </div>
  );
}

function ItemRow({
  item,
  own,
  s,
  chainNames,
  locale,
  href,
  onRules,
  onRename,
  onRemove,
}: {
  item: WatchItem;
  own: boolean;
  s: Strings;
  chainNames: Record<string, string>;
  locale: string;
  href: string;
  onRules: (rules: AddressRules | TokenRules) => void;
  onRename: () => void;
  onRemove: () => void;
}) {
  const name = item.label || (item.kind === "token" ? s.unnamedToken! : s.unnamedWallet!);
  const usd = (n: number) =>
    new Intl.NumberFormat(locale, { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(n);
  const amountLabel = (v: number | null) => (v === null ? s.anyAmount! : fill(s.above!, { amount: usd(v) }));

  return (
    <li className="flex flex-col gap-3 px-4 py-4 sm:px-6" data-testid="watch-item">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="flex min-w-0 items-start gap-3">
          <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary">
            {item.kind === "token" ? (
              <Coins className="size-5" aria-hidden="true" />
            ) : (
              <Wallet className="size-5" aria-hidden="true" />
            )}
          </span>
          <div className="min-w-0">
            <a href={href} className="font-medium hover:underline">
              {name}
            </a>
            <p className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
              <span className="technical" dir="ltr">
                {short(item.target)}
              </span>
              {item.kind === "token" ? (
                <span className="flex items-center gap-1">
                  <ChainIcon chain={item.chain} size={14} />
                  {chainNames[item.chain] ?? item.chain} · {s.badgeToken}
                </span>
              ) : (
                <span className={cn("rounded-full px-2 py-0.5", own ? "bg-low/14 text-low" : "bg-muted")}>
                  {own ? s.badgeOwn : s.badgeWatchOnly}
                </span>
              )}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-1">
          <IconButton label={fill(s.rename!, { name })} onClick={onRename}>
            <Pencil className="size-4" aria-hidden="true" />
          </IconButton>
          <IconButton label={fill(s.remove!, { name })} onClick={onRemove}>
            <Trash2 className="size-4" aria-hidden="true" />
          </IconButton>
        </div>
      </div>

      {item.kind === "address" ? (
        <AddressRulesEditor
          rules={item.rules as AddressRules}
          own={own}
          s={s}
          amountLabel={amountLabel}
          onChange={onRules}
          name={name}
        />
      ) : (
        <div className="flex flex-col gap-2">
          <RuleSwitch
            label={s.ruleSecurity!}
            hint={s.ruleSecurityHint!}
            checked={(item.rules as TokenRules).security.on}
            onChange={(on) => onRules({ ...(item.rules as TokenRules), security: { on } })}
          />
          <RuleSwitch
            label={s.ruleLiquidity!}
            hint={s.ruleLiquidityHint!}
            checked={(item.rules as TokenRules).liquidity.on}
            onChange={(on) => onRules({ ...(item.rules as TokenRules), liquidity: { on } })}
          />
        </div>
      )}
    </li>
  );
}

function AddressRulesEditor({
  rules,
  own,
  s,
  amountLabel,
  onChange,
  name,
}: {
  rules: AddressRules;
  own: boolean;
  s: Strings;
  amountLabel: (v: number | null) => string;
  onChange: (rules: AddressRules) => void;
  name: string;
}) {
  const amountSelect = (which: "sent" | "received") => (
    <select
      aria-label={fill(s.amountFor!, { rule: which === "sent" ? s.ruleSent! : s.ruleReceived!, name })}
      value={rules[which].minUsd === null ? "any" : String(rules[which].minUsd)}
      disabled={!rules[which].on}
      onChange={(e) =>
        onChange({
          ...rules,
          [which]: { ...rules[which], minUsd: e.target.value === "any" ? null : Number(e.target.value) },
        })
      }
      className="h-9 rounded-lg border border-input bg-card px-2 text-sm disabled:opacity-50"
    >
      {AMOUNTS.map((v) => (
        <option key={String(v)} value={v === null ? "any" : String(v)}>
          {amountLabel(v)}
        </option>
      ))}
    </select>
  );
  return (
    <div className="flex flex-col gap-2">
      <RuleSwitch
        label={s.ruleSent!}
        hint={own ? s.ruleSentOwnHint! : s.ruleSentHint!}
        checked={rules.sent.on}
        onChange={(on) => onChange({ ...rules, sent: { ...rules.sent, on } })}
        extra={amountSelect("sent")}
      />
      <RuleSwitch
        label={s.ruleReceived!}
        hint={s.ruleReceivedHint!}
        checked={rules.received.on}
        onChange={(on) => onChange({ ...rules, received: { ...rules.received, on } })}
        extra={amountSelect("received")}
      />
      <RuleSwitch
        label={s.ruleApprovals!}
        hint={s.ruleApprovalsHint!}
        checked={rules.approvals.on}
        onChange={(on) => onChange({ ...rules, approvals: { on } })}
      />
      <RuleSwitch
        label={s.ruleDrop!}
        hint={fill(s.ruleDropHint!, { percent: rules.valueDrop.percent })}
        checked={rules.valueDrop.on}
        onChange={(on) => onChange({ ...rules, valueDrop: { ...rules.valueDrop, on } })}
      />
    </div>
  );
}

function RuleSwitch({
  label,
  hint,
  checked,
  onChange,
  extra,
}: {
  label: string;
  hint: string;
  checked: boolean;
  onChange: (on: boolean) => void;
  extra?: React.ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-border p-3">
      <div className="flex min-w-0 flex-1 basis-56 items-start gap-3">
        <button
          type="button"
          role="switch"
          aria-checked={checked}
          aria-label={label}
          onClick={() => onChange(!checked)}
          className={cn(
            "relative mt-0.5 h-6 w-10 shrink-0 rounded-full transition-colors",
            checked ? "bg-primary" : "bg-muted-foreground/30",
          )}
        >
          <span
            className={cn(
              "absolute top-0.5 size-5 rounded-full bg-white transition-all",
              checked ? "start-[1.125rem]" : "start-0.5",
            )}
          />
        </button>
        <div className="min-w-0">
          <p className="text-sm font-medium">{label}</p>
          <p className="text-xs text-muted-foreground">{hint}</p>
        </div>
      </div>
      {extra}
    </div>
  );
}

function AccountPanel({ s, account, onSignedOut }: { s: Strings; account: string; onSignedOut: () => void }) {
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const signOut = async () => {
    await api("/api/v1/auth/sign-out", { method: "POST" });
    onSignedOut();
  };
  const remove = async () => {
    const result = await api("/api/v1/account", { method: "DELETE" });
    if (result.ok) onSignedOut();
    else setError(s.errSave!);
  };

  return (
    <Panel className="flex flex-col gap-3">
      <div className="flex items-start gap-3">
        <ShieldCheck className="mt-0.5 size-5 shrink-0 text-low" aria-hidden="true" />
        <div>
          <h2 className="font-semibold">{s.accountTitle}</h2>
          <p className="text-sm">
            {s.signedInAs}{" "}
            <span className="technical font-medium" dir="ltr" data-testid="signed-in-address">
              {short(account)}
            </span>
          </p>
          <p className="text-sm text-muted-foreground">{s.accountText}</p>
        </div>
      </div>
      <div className="flex flex-wrap gap-2">
        <button type="button" onClick={() => void signOut()} className={secondaryButton}>
          <LogOut className="size-4" aria-hidden="true" />
          {s.signOut}
        </button>
        <a href="/api/v1/account/export" className={secondaryButton} download>
          <Download className="size-4" aria-hidden="true" />
          {s.download}
        </a>
        <button type="button" onClick={() => setConfirming(true)} className={cn(secondaryButton, "text-critical")}>
          <Trash2 className="size-4" aria-hidden="true" />
          {s.deleteAccount}
        </button>
      </div>
      {confirming && (
        <div
          className="flex flex-col gap-2 rounded-xl border border-critical/40 bg-critical/8 p-3"
          role="alertdialog"
          aria-label={s.deleteConfirmTitle}
        >
          <p className="font-medium">{s.deleteConfirmTitle}</p>
          <p className="text-sm text-muted-foreground">{s.deleteConfirmText}</p>
          <div className="flex gap-2">
            <button type="button" onClick={() => setConfirming(false)} className={secondaryButton}>
              {s.cancel}
            </button>
            <button
              type="button"
              onClick={() => void remove()}
              className={cn(primaryButton, "bg-critical hover:bg-critical/90")}
            >
              {s.deleteConfirm}
            </button>
          </div>
        </div>
      )}
      {error && (
        <p role="alert" className="text-sm text-critical">
          {error}
        </p>
      )}
    </Panel>
  );
}

function AddDialog({
  s,
  chainNames,
  tokenChains,
  onClose,
  onAdded,
}: {
  s: Strings;
  chainNames: Record<string, string>;
  tokenChains: string[];
  onClose: () => void;
  onAdded: (item: WatchItem) => void;
}) {
  const [kind, setKind] = useState<"address" | "token">("address");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const addressRef = useRef<HTMLInputElement>(null);

  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const checked = checkWalletInput(String(form.get("target") ?? ""));
    if (checked.kind !== "ok") {
      if (checked.kind === "secret" && addressRef.current) addressRef.current.value = "";
      setError(
        { secret: s.errSecret!, checksum: s.errChecksum!, empty: s.errEmpty!, invalid: s.errInvalid! }[checked.kind],
      );
      return;
    }
    setBusy(true);
    const body =
      kind === "token"
        ? {
            kind,
            chain: String(form.get("chain")),
            target: checked.address,
            label: cleanLabel(String(form.get("label") ?? "")),
          }
        : { kind, target: checked.address, label: cleanLabel(String(form.get("label") ?? "")) };
    const result = await api<{ item: WatchItem }>("/api/v1/watchlist", { method: "POST", body: JSON.stringify(body) });
    setBusy(false);
    if (result.ok) onAdded(result.data.item);
    else setError(result.status === 409 ? s.errDuplicateOrFull! : result.status === 401 ? s.errSignedOut! : s.errSave!);
  };

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogTitle>{s.addTitle}</DialogTitle>
        <DialogDescription>{s.addText}</DialogDescription>
        <form onSubmit={(e) => void submit(e)} className="flex flex-col gap-3" noValidate>
          <div role="radiogroup" aria-label={s.kindLabel} className="grid grid-cols-2 gap-2">
            {(["address", "token"] as const).map((k) => (
              <button
                key={k}
                type="button"
                role="radio"
                aria-checked={kind === k}
                onClick={() => setKind(k)}
                className={cn(
                  "rounded-xl border px-3 py-2 text-sm",
                  kind === k ? "border-primary bg-primary/10 font-medium" : "border-border",
                )}
              >
                {k === "address" ? s.kindAddress : s.kindToken}
              </button>
            ))}
          </div>
          {kind === "token" && (
            <div>
              <label htmlFor="watch-chain" className="mb-1 block text-sm font-medium">
                {s.chainLabel}
              </label>
              <select id="watch-chain" name="chain" className={inputClass}>
                {tokenChains.map((c) => (
                  <option key={c} value={c}>
                    {chainNames[c] ?? c}
                  </option>
                ))}
              </select>
            </div>
          )}
          <div>
            <label htmlFor="watch-target" className="mb-1 block text-sm font-medium">
              {kind === "token" ? s.tokenLabel : s.addressLabel}
            </label>
            <input
              ref={addressRef}
              id="watch-target"
              name="target"
              autoComplete="off"
              spellCheck={false}
              dir="ltr"
              placeholder="0x…"
              aria-invalid={error ? true : undefined}
              aria-describedby="watch-target-error"
              onChange={() => error && setError(null)}
              className={cn(inputClass, "technical text-sm")}
            />
            <p id="watch-target-error" role="alert" className="mt-2 text-sm text-critical empty:hidden">
              {error}
            </p>
          </div>
          <div>
            <label htmlFor="watch-label" className="mb-1 block text-sm font-medium">
              {s.labelLabel}
            </label>
            <input
              id="watch-label"
              name="label"
              maxLength={40}
              placeholder={s.labelPlaceholder}
              className={inputClass}
            />
          </div>
          <p className="rounded-xl bg-muted p-3 text-xs text-muted-foreground">{s.neverSecret}</p>
          <div className="flex justify-end gap-2">
            <DialogClose className={secondaryButton}>{s.cancel}</DialogClose>
            <button type="submit" disabled={busy} className={primaryButton}>
              {s.add}
            </button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function RenameDialog({
  s,
  item,
  onClose,
  onSave,
}: {
  s: Strings;
  item: WatchItem;
  onClose: () => void;
  onSave: (label: string) => void;
}) {
  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogTitle>{s.renameTitle}</DialogTitle>
        <form
          className="flex flex-col gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            onSave(cleanLabel(String(new FormData(e.currentTarget).get("label") ?? "")));
          }}
        >
          <label htmlFor="watch-rename" className="sr-only">
            {s.labelLabel}
          </label>
          <input id="watch-rename" name="label" maxLength={40} defaultValue={item.label} className={inputClass} />
          <div className="flex justify-end gap-2">
            <DialogClose className={secondaryButton}>{s.cancel}</DialogClose>
            <button type="submit" className={primaryButton}>
              {s.save}
            </button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function IconButton({ label, onClick, children }: { label: string; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      className="grid size-9 place-items-center rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground"
    >
      {children}
    </button>
  );
}

const primaryButton =
  "inline-flex h-10 items-center gap-2 rounded-xl bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50";
const secondaryButton =
  "inline-flex h-10 items-center gap-2 rounded-xl border border-border px-4 text-sm font-medium hover:bg-muted disabled:opacity-50";
