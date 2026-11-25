"use client";

import { Download, QrCode, X } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";
import { buttonVariants } from "@/components/ui/button-variants";
import { cn } from "@/lib/utils";

export interface AddressQrStrings {
  open: string;
  title: string;
  network: string;
  caption: string;
  warning: string;
  download: string;
  close: string;
  local: string;
}
export interface QrNetwork {
  key: string;
  name: string;
}

const fill = (text: string, vars: Record<string, string>) =>
  text.replace(/\{(\w+)\}/g, (m, k: string) => (k in vars ? vars[k]! : m));

/**
 * QR code of a public address (U1), drawn in the browser by the `qrcode` library, loaded only when opened. The code
 * holds the address alone: the same 0x address exists on every EVM chain, so the chosen network is printed beside it
 * (and on the downloaded image), never implied by the code. Only checksummed public addresses reach this component.
 */
export function AddressQrButton({
  address,
  networks,
  initialNetwork,
  strings,
  variant = "icon",
}: {
  address: string;
  networks: QrNetwork[];
  initialNetwork?: string;
  strings: AddressQrStrings;
  variant?: "icon" | "text";
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        aria-haspopup="dialog"
        onClick={() => {
          setOpen(true);
          dialog.current?.showModal();
        }}
        className={buttonVariants({ variant: "outline", size: variant === "icon" ? "icon-md" : "md" })}
        aria-label={variant === "icon" ? strings.open : undefined}
        title={strings.open}
      >
        <QrCode aria-hidden="true" />
        {variant === "text" && <span>{strings.open}</span>}
      </button>
      <dialog
        ref={dialog}
        onClose={() => setOpen(false)}
        onClick={(e) => e.target === dialog.current && dialog.current?.close()}
        className="m-auto w-full max-w-sm rounded-2xl border border-border bg-card p-0 text-foreground"
      >
        {open && (
          <QrPanel
            address={address}
            networks={networks}
            initialNetwork={initialNetwork}
            strings={strings}
            onClose={() => dialog.current?.close()}
          />
        )}
      </dialog>
    </>
  );
}

function QrPanel({
  address,
  networks,
  initialNetwork,
  strings,
  onClose,
}: {
  address: string;
  networks: QrNetwork[];
  initialNetwork?: string;
  strings: AddressQrStrings;
  onClose: () => void;
}) {
  const id = useId();
  const [network, setNetwork] = useState(initialNetwork ?? networks[0]?.key ?? "");
  const [path, setPath] = useState<{ d: string; size: number } | null>(null);
  const name = networks.find((n) => n.key === network)?.name ?? "";

  useEffect(() => {
    let live = true;
    void import("qrcode").then((QRCode) => {
      // Drawn as one React SVG path from the code's modules: no HTML from the library is inserted.
      const { modules } = QRCode.create(address, { errorCorrectionLevel: "M" });
      let d = "";
      for (let y = 0; y < modules.size; y++)
        for (let x = 0; x < modules.size; x++) if (modules.get(x, y)) d += `M${x + 1} ${y + 1}h1v1h-1z`;
      if (live) setPath({ d, size: modules.size + 2 });
    });
    return () => {
      live = false;
    };
  }, [address]);

  async function download() {
    const QRCode = await import("qrcode");
    const canvas = document.createElement("canvas");
    const qr = document.createElement("canvas");
    await QRCode.toCanvas(qr, address, { margin: 1, width: 480, errorCorrectionLevel: "M" });
    canvas.width = 560;
    canvas.height = 720;
    const ctx = canvas.getContext("2d")!;
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = "#111827";
    ctx.textAlign = "center";
    ctx.font = "600 26px system-ui, sans-serif";
    ctx.fillText(fill(strings.caption, { network: name }), 280, 48);
    ctx.drawImage(qr, 40, 72);
    ctx.font = "20px ui-monospace, monospace";
    ctx.fillText(address.slice(0, 22), 280, 600);
    ctx.fillText(address.slice(22), 280, 628);
    ctx.font = "16px system-ui, sans-serif";
    ctx.fillStyle = "#6b7280";
    ctx.fillText("crypy.org", 280, 690);
    const link = document.createElement("a");
    link.href = canvas.toDataURL("image/png");
    link.download = `${network}-${address}.png`;
    link.click();
  }

  return (
    <div className="flex flex-col gap-4 p-5">
      <div className="flex items-start justify-between gap-3">
        <h2 className="font-heading text-lg font-semibold">{strings.title}</h2>
        <button
          type="button"
          onClick={onClose}
          aria-label={strings.close}
          className={buttonVariants({ variant: "ghost", size: "icon-md" })}
        >
          <X aria-hidden="true" />
        </button>
      </div>
      {networks.length > 1 && (
        <div>
          <label htmlFor={`${id}-network`} className="mb-1.5 block text-sm font-medium">
            {strings.network}
          </label>
          <select
            id={`${id}-network`}
            value={network}
            onChange={(e) => setNetwork(e.target.value)}
            className="w-full rounded-xl border border-input bg-card px-3 py-2.5 text-base focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/25 focus-visible:outline-none"
          >
            {networks.map((n) => (
              <option key={n.key} value={n.key}>
                {n.name}
              </option>
            ))}
          </select>
        </div>
      )}
      <figure className="flex flex-col items-center gap-3">
        <figcaption className="text-center text-base font-semibold">
          {fill(strings.caption, { network: name })}
        </figcaption>
        <div className={cn("w-full max-w-md rounded-xl bg-white p-2", !path && "animate-pulse bg-muted py-24")}>
          {path && (
            <svg
              viewBox={`0 0 ${path.size} ${path.size}`}
              role="img"
              aria-label={`${fill(strings.caption, { network: name })}: ${address}`}
              shapeRendering="crispEdges"
              className="w-full"
            >
              <path d={path.d} fill="#000" />
            </svg>
          )}
        </div>
        <p className="technical text-center text-sm break-all">{address}</p>
      </figure>
      <p className="rounded-xl bg-medium/14 px-3 py-2 text-sm text-medium">
        {fill(strings.warning, { network: name })}
      </p>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-xs text-muted-foreground">{strings.local}</p>
        <button type="button" onClick={download} className={buttonVariants({ variant: "outline", size: "md" })}>
          <Download aria-hidden="true" />
          {strings.download}
        </button>
      </div>
    </div>
  );
}
