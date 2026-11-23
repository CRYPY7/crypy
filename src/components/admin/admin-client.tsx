"use client";

import { KeyRound, LogOut } from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { BODY_MAX, TITLE_MAX, type UpdateState } from "@/lib/health/updates";
import { useWallet } from "@/wallets/wallet-root";

/**
 * Browser parts of the admin dashboard (M9 Part 5, boards 53–54). Signing in uses the existing wallet sign-in (one
 * plain-text message, never a transaction). Whether the wallet is an admin is decided on the server only.
 */
const primary =
  "inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50";
const secondary =
  "inline-flex h-11 items-center justify-center gap-2 rounded-xl border border-border px-4 text-sm font-medium hover:bg-muted disabled:opacity-50";
const field =
  "w-full rounded-lg border border-border bg-background px-3 text-sm focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ring";

async function send(path: string, method: string, body: unknown): Promise<number> {
  try {
    const response = await fetch(path, {
      method,
      credentials: "same-origin",
      headers: { Accept: "application/json", "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    return response.status;
  } catch {
    return 0;
  }
}

export function AdminSignIn({ strings: s }: { strings: Record<string, string> }) {
  const router = useRouter();
  const { state, openWallet, closeWallet, actions } = useWallet();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const pending = useRef(false);
  const connected = state.status === "connected" && !!state.address;

  const start = useCallback(async () => {
    if (!actions) return;
    setBusy(true);
    setError(null);
    const outcome = await actions.signIn();
    setBusy(false);
    if (outcome.status === "signed-in") router.refresh();
    else
      setError(
        {
          "no-wallet": s.errNoWallet!,
          "unsupported-chain": s.errChain!,
          rejected: s.errRejected!,
          "rate-limited": s.errRateLimited!,
          failed: s.errFailed!,
        }[outcome.status],
      );
  }, [actions, router, s]);

  useEffect(() => {
    if (pending.current && connected && actions) {
      pending.current = false;
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
    <div className="flex flex-col gap-3">
      <button type="button" onClick={click} disabled={busy} className={`${primary} self-start`}>
        <KeyRound className="size-4" aria-hidden="true" />
        {busy ? s.busy : connected ? s.buttonConnected : s.button}
      </button>
      {error && (
        <p role="alert" className="text-sm text-critical">
          {error}
        </p>
      )}
    </div>
  );
}

export function SignOutButton({ label }: { label: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  return (
    <button
      type="button"
      disabled={busy}
      className={secondary}
      onClick={async () => {
        setBusy(true);
        await send("/api/v1/auth/sign-out", "POST", {});
        router.refresh();
      }}
    >
      <LogOut className="size-4" aria-hidden="true" />
      {label}
    </button>
  );
}

export function UpdateForm({
  strings: s,
  states,
  components,
}: {
  strings: Record<string, string>;
  states: { value: UpdateState; label: string }[];
  components: { value: string; label: string }[];
}) {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [state, setState] = useState<UpdateState>("ongoing");
  const [component, setComponent] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setMessage(null);
    const status = await send("/api/v1/admin/status-updates", "POST", {
      title,
      body,
      state,
      component: component || null,
    });
    setBusy(false);
    if (status === 200) {
      setTitle("");
      setBody("");
      setMessage({ ok: true, text: s.published! });
      router.refresh();
    } else setMessage({ ok: false, text: status === 401 || status === 403 ? s.signedOut! : s.error! });
  };

  return (
    <form onSubmit={submit} className="flex flex-col gap-4">
      <div className="grid gap-3 md:grid-cols-[2fr_1fr_1.4fr]">
        <label className="flex flex-col gap-1.5 text-sm text-muted-foreground">
          {s.fieldTitle}
          <input
            className={`${field} h-11 text-foreground`}
            value={title}
            maxLength={TITLE_MAX}
            required
            minLength={3}
            onChange={(e) => setTitle(e.target.value)}
          />
        </label>
        <label className="flex flex-col gap-1.5 text-sm text-muted-foreground">
          {s.fieldState}
          <select
            className={`${field} h-11 text-foreground`}
            value={state}
            onChange={(e) => setState(e.target.value as UpdateState)}
          >
            {states.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1.5 text-sm text-muted-foreground">
          {s.fieldAffects}
          <select
            className={`${field} h-11 text-foreground`}
            value={component}
            onChange={(e) => setComponent(e.target.value)}
          >
            {components.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </label>
      </div>
      <label className="flex flex-col gap-1.5 text-sm text-muted-foreground">
        {s.fieldBody}
        <textarea
          className={`${field} min-h-24 py-2 text-foreground`}
          value={body}
          maxLength={BODY_MAX}
          required
          minLength={3}
          rows={3}
          onChange={(e) => setBody(e.target.value)}
        />
      </label>
      <div className="flex flex-wrap items-center gap-3">
        <p className="text-sm text-muted-foreground">{s.hint}</p>
        <button type="submit" disabled={busy} className={`${primary} sm:ms-auto`}>
          {busy ? s.publishing : s.publish}
        </button>
      </div>
      {message && (
        <p role={message.ok ? "status" : "alert"} className={message.ok ? "text-sm text-low" : "text-sm text-critical"}>
          {message.text}
        </p>
      )}
    </form>
  );
}

export function UpdateStateButton({
  id,
  to,
  label,
  errorText,
}: {
  id: string;
  to: UpdateState;
  label: string;
  errorText: string;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  return (
    <span className="inline-flex items-center gap-2">
      <button
        type="button"
        disabled={busy}
        className="inline-flex h-9 items-center rounded-lg border border-border px-3 text-sm hover:bg-muted disabled:opacity-50"
        onClick={async () => {
          setBusy(true);
          setFailed(false);
          const status = await send(`/api/v1/admin/status-updates/${id}`, "PATCH", { state: to });
          setBusy(false);
          if (status === 200) router.refresh();
          else setFailed(true);
        }}
      >
        {label}
      </button>
      {failed && (
        <span role="alert" className="text-sm text-critical">
          {errorText}
        </span>
      )}
    </span>
  );
}
