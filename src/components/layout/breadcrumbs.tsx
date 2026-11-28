import Link from "next/link";
import { ChevronRight } from "lucide-react";

export type Crumb = { label: string; href?: string; mono?: boolean };

/** Small server-rendered trail for entity pages. The last crumb is the current page. */
export function Breadcrumbs({ items, label }: { items: Crumb[]; label: string }) {
  return (
    <nav aria-label={label} className="mb-4 text-sm text-muted-foreground">
      <ol className="flex min-w-0 flex-wrap items-center gap-1.5">
        {items.map((item, index) => {
          const last = index === items.length - 1;
          return (
            <li key={index} className="flex min-w-0 items-center gap-1.5">
              {item.href && !last ? (
                <Link href={item.href} prefetch={false} className="hover:text-foreground">
                  {item.label}
                </Link>
              ) : (
                <span
                  aria-current={last ? "page" : undefined}
                  className={item.mono ? "truncate font-mono text-foreground" : "truncate text-foreground"}
                  dir={item.mono ? "ltr" : undefined}
                >
                  {item.label}
                </span>
              )}
              {!last && <ChevronRight className="size-3.5 shrink-0 rtl:-scale-x-100" aria-hidden="true" />}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
