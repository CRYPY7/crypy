"use client";

import { ArrowLeft, Copy, ExternalLink, Smartphone, X } from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { encode } from "uqr";
import { UserRejectedRequestError } from "viem";
import { type Connector, useConnect, useConnection, useDisconnect } from "wagmi";
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { buttonVariants } from "@/components/ui/button-variants";
import { cn } from "@/lib/utils";
import type { WalletStrings } from "../types";

interface Props {
  strings: WalletStrings;
  locale: string;
  dialogOpen: boolean;
  onDialogOpenChange: (open: boolean) => void;
}

const MOBILE_WALLETS = [
  { name: "Trust Wallet", link: (uri: string) => `https://link.trustwallet.com/wc?uri=${encodeURIComponent(uri)}` },
  { name: "MetaMask", link: (uri: string) => `https://metamask.app.link/wc?uri=${encodeURIComponent(uri)}` },
];

/** Wallet chooser and account panel. Connecting shares only the public address. */
export function WalletDialog({ strings, locale, dialogOpen, onDialogOpenChange }: Props) {
  const connection = useConnection();
  const { connect, connectors, status, error, reset } = useConnect();
  const { disconnect } = useDisconnect();
  const [wcUri, setWcUri] = useState<string | null>(null);

  const { browserWallets, walletConnectConnector } = useMemo(() => {
    const discovered = connectors.filter((c) => c.type === "injected" && c.id !== "injected");
    // The generic "injected" connector is only useful when no wallet announced itself (older wallets).
    const generic = connectors.find((c) => c.id === "injected");
    const hasLegacyProvider = typeof window !== "undefined" && "ethereum" in window;
    return {
      browserWallets: discovered.length > 0 ? discovered : generic && hasLegacyProvider ? [generic] : [],
      walletConnectConnector: connectors.find((c) => c.type === "walletConnect"),
    };
  }, [connectors]);

  // WalletConnect gives us a pairing link; we show it as a QR code and mobile deep links.
  useEffect(() => {
    if (!walletConnectConnector) return;
    const onMessage = ({ type, data }: { type: string; data?: unknown }) => {
      if (type === "display_uri" && typeof data === "string") setWcUri(data);
    };
    walletConnectConnector.emitter.on("message", onMessage);
    return () => walletConnectConnector.emitter.off("message", onMessage);
  }, [walletConnectConnector]);

  const start = (connector: Connector) => {
    reset();
    setWcUri(null);
    connect({ connector });
  };

  const close = (open: boolean) => {
    onDialogOpenChange(open);
    if (!open) {
      setWcUri(null);
      reset();
    }
  };

  const errorText =
    status === "error" && error
      ? error.name === UserRejectedRequestError.name || /reject|denied|cancel/i.test(error.message)
        ? strings.rejected
        : strings.failed
      : null;

  const connected = connection.status === "connected" && connection.address;
  const chainName = connection.chainId ? strings.chains[connection.chainId] : undefined;

  return (
    <Dialog open={dialogOpen} onOpenChange={close}>
      <DialogContent showCloseButton={false} className="w-full gap-0 p-0 sm:max-w-md">
        <div className="flex items-center justify-between gap-3 border-b px-5 py-4">
          <DialogTitle className="font-heading text-lg font-semibold">
            {connected ? strings.connectedAs : strings.title}
          </DialogTitle>
          <DialogClose
            aria-label={strings.close}
            className="grid size-10 place-items-center rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            <X aria-hidden="true" className="size-5" />
          </DialogClose>
        </div>

        <div className="flex flex-col gap-4 p-5 text-sm">
          {connected ? (
            <>
              <p className="technical rounded-lg bg-muted px-3 py-2">{connection.address}</p>
              <p>
                <span className="text-muted-foreground">{strings.network}: </span>
                {chainName ?? connection.chainId}
              </p>
              {!chainName && <p className="text-high">{strings.unsupportedNetwork}</p>}
              <div className="flex flex-wrap gap-2">
                <Link
                  href={`/${locale}/address/${connection.address}`}
                  onClick={() => onDialogOpenChange(false)}
                  className={buttonVariants({ size: "md" })}
                >
                  {strings.viewMyAddress}
                </Link>
                <button
                  type="button"
                  onClick={() => disconnect()}
                  className={buttonVariants({ variant: "outline", size: "md" })}
                >
                  {strings.disconnect}
                </button>
              </div>
            </>
          ) : wcUri ? (
            <WalletConnectPanel uri={wcUri} strings={strings} onBack={() => setWcUri(null)} />
          ) : (
            <>
              <DialogDescription className="text-muted-foreground">{strings.intro}</DialogDescription>
              <div>
                <h3 className="mb-2 font-sans text-xs font-semibold tracking-wider text-muted-foreground uppercase">
                  {strings.detected}
                </h3>
                {browserWallets.length === 0 ? (
                  <p className="text-muted-foreground">{strings.noneDetected}</p>
                ) : (
                  <ul className="flex flex-col gap-2">
                    {browserWallets.map((connector) => (
                      <li key={connector.uid}>
                        <WalletOption connector={connector} busy={status === "pending"} onSelect={start} />
                      </li>
                    ))}
                  </ul>
                )}
              </div>
              {walletConnectConnector ? (
                <WalletOption
                  connector={walletConnectConnector}
                  label={strings.walletConnect}
                  busy={status === "pending"}
                  onSelect={start}
                />
              ) : (
                <p className="text-xs text-muted-foreground">{strings.walletConnectUnavailable}</p>
              )}
            </>
          )}
          {errorText && !connected && (
            <p role="alert" className="rounded-lg border border-high/40 p-3">
              {errorText}
            </p>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function WalletOption({
  connector,
  label,
  busy,
  onSelect,
}: {
  connector: Connector;
  label?: string;
  busy: boolean;
  onSelect: (connector: Connector) => void;
}) {
  // EIP-6963 icons are data: URIs supplied by the wallet itself.
  const icon = typeof connector.icon === "string" && connector.icon.startsWith("data:image/") ? connector.icon : null;
  return (
    <button
      type="button"
      disabled={busy}
      onClick={() => onSelect(connector)}
      className="flex min-h-12 w-full items-center gap-3 rounded-lg border px-3 text-start font-medium hover:border-primary disabled:opacity-60"
    >
      {icon ? (
        // eslint-disable-next-line @next/next/no-img-element -- tiny data URI from the wallet, no optimisation needed
        <img src={icon} alt="" width={28} height={28} className="size-7 rounded-md" />
      ) : (
        <Smartphone aria-hidden="true" className="size-6 text-primary" />
      )}
      {label ?? connector.name}
    </button>
  );
}

function WalletConnectPanel({ uri, strings, onBack }: { uri: string; strings: WalletStrings; onBack: () => void }) {
  const qr = useMemo(() => encode(uri, { ecc: "M", border: 2 }), [uri]);
  const path = useMemo(() => {
    let d = "";
    qr.data.forEach((row, y) =>
      row.forEach((on, x) => {
        if (on) d += `M${x} ${y}h1v1h-1z`;
      }),
    );
    return d;
  }, [qr]);
  const [copied, setCopied] = useState(false);

  return (
    <div className="flex flex-col items-center gap-4">
      <button
        type="button"
        onClick={onBack}
        className="flex items-center gap-1 self-start text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft aria-hidden="true" className="size-4 rtl:-scale-x-100" />
        {strings.back}
      </button>
      <p className="font-medium">{strings.scanQr}</p>
      <svg
        viewBox={`0 0 ${qr.size} ${qr.size}`}
        role="img"
        aria-label={strings.scanQr}
        className="size-60 rounded-xl bg-white p-2"
        shapeRendering="crispEdges"
      >
        <path d={path} fill="#0b0d12" />
      </svg>
      <div className="flex w-full flex-col gap-2">
        {MOBILE_WALLETS.map((wallet) => (
          <a
            key={wallet.name}
            href={wallet.link(uri)}
            rel="noopener noreferrer"
            className={cn(buttonVariants({ variant: "outline", size: "md" }), "w-full")}
          >
            {strings.openIn.replace("{wallet}", wallet.name)}
            <ExternalLink aria-hidden="true" className="size-4" />
          </a>
        ))}
        <button
          type="button"
          onClick={async () => {
            await navigator.clipboard.writeText(uri).catch(() => {});
            setCopied(true);
          }}
          className={cn(buttonVariants({ variant: "ghost", size: "md" }), "w-full")}
        >
          <Copy aria-hidden="true" className="size-4" />
          {copied ? "✓" : strings.copyLink}
        </button>
      </div>
    </div>
  );
}
