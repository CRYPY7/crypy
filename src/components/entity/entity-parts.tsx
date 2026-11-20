import { CircleAlert, ExternalLink, Info } from "lucide-react";
import { cn } from "@/lib/utils";
import { CopyButton } from "./copy-button";

/** Header for address, token and transaction pages: title, full identifier, copy and explorer links. */
export function EntityHeader({
  eyebrow,
  title,
  id,
  copyLabel,
  copiedLabel,
  links,
  children,
}: {
  eyebrow?: React.ReactNode;
  title: React.ReactNode;
  id: string;
  copyLabel: string;
  copiedLabel: string;
  links: { href: string; label: string }[];
  children?: React.ReactNode;
}) {
  return (
    <header className="flex flex-col gap-3">
      {eyebrow && <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">{eyebrow}</div>}
      <h1 className="text-2xl font-semibold sm:text-3xl">{title}</h1>
      <div className="flex flex-wrap items-center gap-2">
        <span className="technical rounded-lg bg-muted px-3 py-2 text-sm sm:text-base">{id}</span>
        <CopyButton value={id} label={copyLabel} copiedLabel={copiedLabel} />
      </div>
      {links.length > 0 && (
        <ul className="flex flex-wrap gap-x-5 gap-y-1 text-sm">
          {links.map((link) => (
            <li key={link.href}>
              <a
                href={link.href}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-primary hover:underline"
              >
                {link.label}
                <ExternalLink aria-hidden="true" className="size-3.5" />
              </a>
            </li>
          ))}
        </ul>
      )}
      {children}
    </header>
  );
}

export function Notice({
  tone = "info",
  title,
  children,
}: {
  tone?: "info" | "warning" | "danger";
  title?: string;
  children: React.ReactNode;
}) {
  const Icon = tone === "info" ? Info : CircleAlert;
  return (
    <div
      role={tone === "info" ? "note" : "alert"}
      className={cn(
        "flex gap-3 rounded-xl border p-4 text-sm",
        tone === "info" && "border-border-strong bg-card",
        tone === "warning" && "border-high/50 bg-high/8",
        tone === "danger" && "border-critical/50 bg-critical/8",
      )}
    >
      <Icon
        aria-hidden="true"
        className={cn(
          "mt-0.5 size-5 shrink-0",
          tone === "info" ? "text-primary" : tone === "warning" ? "text-high" : "text-critical",
        )}
      />
      <div>
        {title && <p className="font-semibold">{title}</p>}
        <div className={cn(title && "mt-1 text-muted-foreground")}>{children}</div>
      </div>
    </div>
  );
}

export function EntitySkeleton() {
  return (
    <div aria-hidden="true" className="flex animate-pulse flex-col gap-4">
      <div className="h-4 w-32 rounded bg-muted" />
      <div className="h-8 w-64 rounded bg-muted" />
      <div className="h-10 w-full max-w-xl rounded-lg bg-muted" />
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="h-28 rounded-xl bg-muted" />
        <div className="h-28 rounded-xl bg-muted" />
      </div>
    </div>
  );
}

export function FactList({ items }: { items: { label: string; value: React.ReactNode }[] }) {
  return (
    <dl className="grid gap-x-6 gap-y-4 sm:grid-cols-2">
      {items.map((item) => (
        <div key={item.label}>
          <dt className="text-xs font-medium text-muted-foreground">{item.label}</dt>
          <dd className="mt-0.5">{item.value}</dd>
        </div>
      ))}
    </dl>
  );
}
