"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Suspense } from "react";
import { Bell, BookOpen, ChartPie, House, LayoutGrid } from "lucide-react";
import { cn } from "@/lib/utils";
import { openToolsDialog } from "./open-tools";

export interface TabBarStrings {
  label: string;
  home: string;
  tools: string;
  portfolio: string;
  alerts: string;
  learn: string;
}

const itemClass =
  "relative flex min-h-14 flex-col items-center justify-center gap-0.5 rounded-lg text-[11px] font-semibold text-muted-foreground aria-[current=page]:text-primary hover:text-foreground";

/** Bottom navigation on phones; every tool is one tap away via "Tools". */
type TabHrefs = Record<"home" | "portfolio" | "alerts" | "learn", string>;

export function MobileTabBar(props: { strings: TabBarStrings; hrefs: TabHrefs }) {
  // Reading the URL suspends on dynamic pages; the fallback is the same bar without the active marker.
  return (
    <Suspense fallback={<TabBarView {...props} pathname={null} />}>
      <TabBarWithPath {...props} />
    </Suspense>
  );
}

function TabBarWithPath(props: { strings: TabBarStrings; hrefs: TabHrefs }) {
  return <TabBarView {...props} pathname={usePathname()} />;
}

function TabBarView({
  strings,
  hrefs,
  pathname,
}: {
  strings: TabBarStrings;
  hrefs: TabHrefs;
  pathname: string | null;
}) {
  const current = (href: string) => (pathname === href ? "page" : undefined);

  return (
    <nav
      aria-label={strings.label}
      className="fixed inset-x-0 bottom-0 z-40 border-t bg-card/95 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden"
    >
      <div className="grid grid-cols-5 px-1 pt-1">
        <Link href={hrefs.home} aria-current={current(hrefs.home)} className={itemClass} data-tab-item="">
          <House className="size-5" aria-hidden="true" />
          {strings.home}
        </Link>
        <button type="button" onClick={openToolsDialog} aria-haspopup="dialog" className={cn(itemClass)}>
          <LayoutGrid className="size-5" aria-hidden="true" />
          {strings.tools}
        </button>
        <Link href={hrefs.learn} aria-current={current(hrefs.learn)} className={itemClass} data-tab-item="">
          <BookOpen className="size-5" aria-hidden="true" />
          {strings.learn}
        </Link>
        <Link href={hrefs.portfolio} aria-current={current(hrefs.portfolio)} className={itemClass} data-tab-item="">
          <ChartPie className="size-5" aria-hidden="true" />
          {strings.portfolio}
        </Link>
        <Link href={hrefs.alerts} aria-current={current(hrefs.alerts)} className={itemClass} data-tab-item="">
          <Bell className="size-5" aria-hidden="true" />
          {strings.alerts}
        </Link>
      </div>
    </nav>
  );
}
