import Link from "next/link";
import { cn } from "@/lib/utils";

/** Overview | Approvals | Activity (soon) — sections of an address page. */
export function AddressTabs({
  basePath,
  current,
  labels,
  approvalsCount,
}: {
  basePath: string;
  current: "overview" | "approvals";
  labels: { label: string; overview: string; approvals: string; activity: string; soon: string };
  approvalsCount?: number;
}) {
  const tab = (active: boolean) =>
    cn(
      "flex shrink-0 items-center gap-2 border-b-2 px-3 py-2.5 text-sm whitespace-nowrap",
      active ? "border-primary font-semibold" : "border-transparent text-muted-foreground hover:text-foreground",
    );
  return (
    <nav aria-label={labels.label} className="flex gap-1 overflow-x-auto border-b">
      <Link
        href={basePath}
        prefetch={false}
        aria-current={current === "overview" ? "page" : undefined}
        className={tab(current === "overview")}
      >
        {labels.overview}
      </Link>
      <Link
        href={`${basePath}/approvals`}
        prefetch={false}
        aria-current={current === "approvals" ? "page" : undefined}
        className={tab(current === "approvals")}
      >
        {labels.approvals}
        {approvalsCount !== undefined && (
          <span className="rounded-full bg-muted px-2 text-xs tabular-nums">{approvalsCount}</span>
        )}
      </Link>
      <span aria-disabled="true" className={cn(tab(false), "cursor-default")}>
        {labels.activity}
        <span className="rounded-full border px-2 text-xs">{labels.soon}</span>
      </span>
    </nav>
  );
}
