"use client";

import { CircleCheck, Loader2 } from "lucide-react";
import { useEffect, useState } from "react";
import { buttonVariants } from "@/components/ui/button-variants";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import type { RatedApproval } from "@/lib/approvals/evaluate";
import { formatAmount, shortenId } from "@/lib/format/amount";
import { cn } from "@/lib/utils";
import type { RevokeOutcome, RevokePreview, RevokeRequest, RevokeStep } from "@/wallets/types";
import { useWallet } from "@/wallets/wallet-root";
import { type ApprovalsChainInfo, type ApprovalsStrings, fill } from "./approvals-shared";

export interface RevokeTarget {
  id: string;
  request: RevokeRequest;
  approval: RatedApproval;
  chain: ApprovalsChainInfo;
}

type Phase = { name: "preview" } | { name: "running"; step: RevokeStep } | { name: "outcome"; outcome: RevokeOutcome };

/**
 * Revoke one approval, or several one after another (one wallet confirmation each). Shows exactly what the wallet
 * will be asked to sign, tested first; nothing is sent until the user clicks and confirms in their own wallet.
 */
export function RevokeDialog({
  queue,
  strings: s,
  locale,
  onRevoked,
  onClose,
}: {
  queue: RevokeTarget[];
  strings: ApprovalsStrings;
  locale: string;
  onRevoked: (id: string) => void;
  onClose: () => void;
}) {
  const { actions } = useWallet();
  const [index, setIndex] = useState(0);
  const [phase, setPhase] = useState<Phase>({ name: "preview" });
  const current = queue[index]!;
  const a = current.approval;
  const coin = current.chain.coin;

  const [nonce, setNonce] = useState(0);
  const [previews, setPreviews] = useState<Record<string, RevokePreview>>({});
  const previewKey = `${current.id}|${nonce}`;
  const preview = previews[previewKey] ?? null;

  useEffect(() => {
    if (!actions) return;
    let cancelled = false;
    const failed: RevokePreview = { to: current.request.token, call: "", fee: null, tested: false };
    actions
      .previewRevoke(current.request)
      .catch(() => failed)
      .then((result) => {
        if (!cancelled) setPreviews((all) => ({ ...all, [previewKey]: result }));
      });
    return () => {
      cancelled = true;
    };
  }, [actions, current, previewKey]);

  const retry = () => {
    setPhase({ name: "preview" });
    setNonce((n) => n + 1);
  };

  const run = async () => {
    if (!actions) return;
    setPhase({ name: "running", step: "checking" });
    const outcome = await actions
      .revoke(current.request, (step) => setPhase({ name: "running", step }))
      .catch((): RevokeOutcome => ({ status: "failed" }));
    if (outcome.status === "revoked") onRevoked(current.id);
    setPhase({ name: "outcome", outcome });
  };

  const hasNext = index + 1 < queue.length;
  const next = () => {
    setIndex((i) => i + 1);
    setPhase({ name: "preview" });
  };
  const busy = phase.name === "running";

  const stepText: Record<RevokeStep, string | undefined> = {
    checking: s.stepChecking,
    switching: s.stepSwitching,
    testing: s.stepTesting,
    confirm: s.stepConfirm,
    pending: s.stepPending,
    verifying: s.stepVerifying,
  };

  const allowanceNow =
    a.kind === "nft-all"
      ? s.allItems
      : a.unlimited
        ? s.unlimited
        : a.allowance !== null && a.token.decimals !== null
          ? `${formatAmount(a.allowance, a.token.decimals, locale, 4)} ${a.token.symbol}`
          : a.allowance;

  const title =
    phase.name === "outcome"
      ? phase.outcome.status === "revoked"
        ? s.doneTitle
        : phase.outcome.status === "wrong-account"
          ? s.wrongAccountTitle
          : phase.outcome.status === "wrong-network"
            ? s.wrongNetworkTitle
            : s.failTitle
      : queue.length > 1
        ? fill(s.queueTitle!, { done: index + 1, total: queue.length })
        : s.dialogTitle;

  return (
    <Dialog open onOpenChange={(open) => !open && !busy && onClose()}>
      <DialogContent className="sm:max-w-md" showCloseButton={!busy}>
        <DialogTitle>{title}</DialogTitle>
        <DialogDescription className="sr-only">{s.dialogTitle}</DialogDescription>

        {queue.length > 1 && (
          <ol className="flex flex-col gap-1 rounded-lg border p-2 text-xs">
            {queue.map((q, i) => (
              <li key={q.id} className={cn("flex justify-between gap-2", i === index && "font-semibold")}>
                <span>
                  {q.approval.token.symbol} → {shortenId(q.approval.spender.address)}
                </span>
                <span className="text-muted-foreground">{q.chain.name}</span>
              </li>
            ))}
          </ol>
        )}

        {phase.name !== "outcome" && (
          <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-sm">
            <dt className="text-muted-foreground">{a.kind === "nft-all" ? s.dialogCollection : s.dialogToken}</dt>
            <dd>
              {a.token.symbol} · {current.chain.name}{" "}
              <span className="technical text-xs text-muted-foreground">{shortenId(a.token.address)}</span>
            </dd>
            <dt className="text-muted-foreground">{s.dialogSpender}</dt>
            <dd className="technical text-xs">{shortenId(a.spender.address)}</dd>
            <dt className="text-muted-foreground">{s.dialogNow}</dt>
            <dd className="font-semibold">{allowanceNow}</dd>
            <dt className="text-muted-foreground">{s.dialogAfter}</dt>
            <dd className="font-semibold text-low">{a.kind === "nft-all" ? s.dialogAfterNft : "0"}</dd>
            {phase.name === "preview" && preview && (
              <>
                <dt className="text-muted-foreground">{s.dialogFee}</dt>
                <dd>
                  {preview.fee
                    ? fill(s.dialogFeeValue!, { fee: Number(preview.fee).toPrecision(2), symbol: coin })
                    : s.dialogFeeUnknown}
                </dd>
              </>
            )}
          </dl>
        )}

        {phase.name === "preview" && !preview && (
          <p className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 aria-hidden="true" className="size-4 animate-spin" />
            {s.dialogPreparing}
          </p>
        )}

        {phase.name === "preview" && preview && (
          <>
            {preview.call && (
              <div className="rounded-lg bg-muted p-3 text-xs">
                <p className="mb-1 font-semibold">{s.dialogWalletShows}</p>
                <p className="technical break-all">
                  {s.dialogContract} {shortenId(preview.to)} · {s.dialogFunction} {preview.call} ·{" "}
                  {fill(s.dialogValue!, { symbol: coin })}
                </p>
              </div>
            )}
            <p className={cn("rounded-lg px-3 py-2 text-xs", preview.tested ? "bg-low/14" : "bg-high/14")}>
              {preview.tested ? s.dialogTested : s.dialogNotTested}
            </p>
            <button
              type="button"
              disabled={!preview.tested}
              onClick={run}
              className={cn(buttonVariants({ size: "lg" }), "w-full")}
            >
              {s.dialogOpen}
            </button>
            <p className="text-xs text-muted-foreground">{s.dialogMatch}</p>
            {queue.length > 1 && <p className="text-xs text-muted-foreground">{s.queueNote}</p>}
          </>
        )}

        {phase.name === "running" && (
          <p role="status" className="flex items-center gap-2 text-sm">
            <Loader2 aria-hidden="true" className="size-4 animate-spin" />
            {stepText[phase.step]}
          </p>
        )}

        {phase.name === "outcome" && (
          <Outcome
            outcome={phase.outcome}
            s={s}
            coin={coin}
            owner={current.request.owner}
            chainName={current.chain.name}
            locale={locale}
          />
        )}

        {phase.name === "outcome" && (
          <div className="flex flex-wrap justify-end gap-2">
            {phase.outcome.status === "revoked" ? (
              hasNext ? (
                <>
                  <button type="button" onClick={onClose} className={buttonVariants({ variant: "outline" })}>
                    {s.stop}
                  </button>
                  <button type="button" onClick={next} className={buttonVariants()}>
                    {s.next}
                  </button>
                </>
              ) : (
                <button type="button" onClick={onClose} className={buttonVariants()}>
                  {s.done}
                </button>
              )
            ) : (
              <>
                <button type="button" onClick={onClose} className={buttonVariants({ variant: "outline" })}>
                  {s.close}
                </button>
                {hasNext && (
                  <button type="button" onClick={next} className={buttonVariants({ variant: "outline" })}>
                    {s.next}
                  </button>
                )}
                <button type="button" onClick={retry} className={buttonVariants()}>
                  {phase.outcome.status === "wrong-account" ? s.wrongAccountDone : s.tryAgain}
                </button>
              </>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function Outcome({
  outcome,
  s,
  coin,
  owner,
  chainName,
  locale,
}: {
  outcome: RevokeOutcome;
  s: ApprovalsStrings;
  coin: string;
  owner: string;
  chainName: string;
  locale: string;
}) {
  if (outcome.status === "revoked")
    return (
      <div className="flex flex-col gap-2 text-sm">
        <p className={cn("flex items-center gap-2 font-semibold", outcome.cleared ? "text-low" : "text-high")}>
          <CircleCheck aria-hidden="true" className="size-5" />
          {outcome.cleared ? s.doneCleared : s.doneNotCleared}
        </p>
        <p className="text-muted-foreground">
          {fill(s.doneReadAgain!, { block: Number(outcome.block).toLocaleString(locale) })}
        </p>
        <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1">
          <dt className="text-muted-foreground">{s.doneTx}</dt>
          <dd className="technical text-xs">{shortenId(outcome.hash)}</dd>
          {outcome.feePaid && (
            <>
              <dt className="text-muted-foreground">{s.doneFee}</dt>
              <dd>
                {Number(outcome.feePaid).toPrecision(2)} {coin}
              </dd>
            </>
          )}
        </dl>
      </div>
    );
  const text =
    outcome.status === "wrong-account"
      ? fill(s.wrongAccount!, {
          connected: outcome.connected ? shortenId(outcome.connected) : "—",
          owner: shortenId(owner),
        })
      : outcome.status === "wrong-network"
        ? fill(s.wrongNetwork!, { chain: chainName })
        : outcome.status === "rejected"
          ? s.rejected
          : outcome.status === "test-failed"
            ? s.testFailed
            : s.failed;
  return <p className="text-sm">{text}</p>;
}
