import Link from "next/link";
import { cn } from "@/lib/utils";

/** Overview | Approvals | Activity — sections of an address page. */
export function AddressTabs({
  basePath,
  current,
  labels,
  approvalsCount,
  chains,
}: {
  basePath: string;
  current: "overview" | "approvals" | "activity";
  labels: { label: string; overview: string; approvals: string; activity: string };
  approvalsCount?: number;
  /** The ?chains= choice, carried across tabs. */
  chains?: string;
}) {
  const q = chains ? `?chains=${encodeURIComponent(chains)}` : "";
  const tab = (active: boolean) =>
    cn(
      "flex shrink-0 items-center gap-2 border-b-2 px-3 py-2.5 text-sm whitespace-nowrap",
      active ? "border-primary font-semibold" : "border-transparent text-muted-foreground hover:text-foreground",
    );
  const items = [
    { key: "overview", href: `${basePath}${q}`, label: labels.overview },
    { key: "approvals", href: `${basePath}/approvals${q}`, label: labels.approvals, count: approvalsCount },
    { key: "activity", href: `${basePath}/activity${q}`, label: labels.activity },
  ] as const;
  return (
    <nav aria-label={labels.label} className="flex gap-1 overflow-x-auto border-b">
      {items.map((item) => (
        <Link
          key={item.key}
          href={item.href}
          prefetch={false}
          aria-current={current === item.key ? "page" : undefined}
          className={tab(current === item.key)}
        >
          {item.label}
          {"count" in item && item.count !== undefined && (
            <span className="rounded-full bg-muted px-2 text-xs tabular-nums">{item.count}</span>
          )}
        </Link>
      ))}
    </nav>
  );
}
