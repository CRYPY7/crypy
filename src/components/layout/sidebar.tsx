import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { BookOpen, House } from "lucide-react";
import { Suspense } from "react";
import { ToolIcon } from "@/components/tool-icon";
import { type ToolCategory, tools } from "@/config/tools";
import type { Locale } from "@/i18n/locales";
import { learnPath, localePath, toolPath } from "@/lib/routes";
import { SidebarActiveMarker, SidebarCollapseButton } from "./sidebar-controls";

const order: ToolCategory[] = ["security", "wallet", "network", "monitoring", "calculators", "utilities"];

/**
 * Desktop tools sidebar (lg and up). Plain server-rendered links: the only browser code is the
 * current-page highlight and the collapse button. Collapsed state lives on <html data-sidebar>,
 * set before first paint by an inline script in the layout, so there is no flicker.
 */
export async function ToolsSidebar({ locale }: { locale: Locale }) {
  const t = await getTranslations();
  const item =
    "sidebar-item flex items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground aria-[current=page]:bg-primary/14 aria-[current=page]:font-semibold aria-[current=page]:text-foreground";
  return (
    <aside
      id="tools-sidebar"
      aria-label={t("nav.toolsSidebar")}
      className="sidebar sticky top-16 hidden h-[calc(100dvh-4rem)] shrink-0 flex-col border-e bg-card/40 lg:flex"
    >
      <nav
        aria-label={t("nav.toolsSidebar")}
        className="sidebar-scroll flex-1 overflow-y-auto overscroll-contain px-2 py-2"
      >
        <Link
          href={localePath(locale)}
          prefetch={false}
          data-sidebar-href={localePath(locale)}
          className={item}
          title={t("nav.home")}
        >
          <House className="size-[18px] shrink-0" aria-hidden="true" />
          <span className="sidebar-label truncate">{t("nav.home")}</span>
        </Link>
        <Link
          href={learnPath(locale)}
          data-sidebar-href={learnPath(locale)}
          prefetch={false}
          className={item}
          title={t("nav.learn")}
        >
          <BookOpen className="size-[18px] shrink-0 text-primary" aria-hidden="true" />
          <span className="sidebar-label min-w-0 flex-1 truncate">{t("nav.learn")}</span>
          <span className="sidebar-label shrink-0 rounded bg-low/15 px-1 text-[10px] leading-4 text-low">
            {t("nav.new")}
          </span>
        </Link>
        {order.map((category) => (
          <div key={category} className="mt-2">
            <p className="sidebar-label px-2.5 pb-0.5 text-[11px] font-semibold tracking-wider text-muted-foreground uppercase">
              {t(`categories.${category}`)}
            </p>
            <div className="sidebar-divider mx-3 mb-1 hidden border-t" aria-hidden="true" />
            <ul className="flex flex-col">
              {tools
                .filter((tool) => tool.category === category)
                .map((tool) => {
                  const href = toolPath(locale, tool.id);
                  // Long names have a short form for the sidebar; the page itself shows the full name.
                  const name = t.has(`tools.${tool.id}.shortName`)
                    ? t(`tools.${tool.id}.shortName`)
                    : t(`tools.${tool.id}.name`);
                  return (
                    <li key={tool.id}>
                      <Link href={href} data-sidebar-href={href} prefetch={false} className={item} title={name}>
                        <ToolIcon name={tool.icon} className="size-[18px] shrink-0 text-primary" />
                        <span className="sidebar-label line-clamp-2 min-w-0 flex-1 leading-snug">{name}</span>
                        {tool.status === "live" && tool.isNew && (
                          <span className="sidebar-label shrink-0 rounded bg-low/15 px-1 text-[10px] leading-4 text-low">
                            {t("nav.new")}
                          </span>
                        )}
                        {tool.status !== "live" && (
                          <span className="sidebar-label shrink-0 rounded bg-muted px-1 text-[10px] leading-4 text-muted-foreground">
                            {tool.status === "beta" ? t("nav.beta") : t("nav.soon")}
                          </span>
                        )}
                      </Link>
                    </li>
                  );
                })}
            </ul>
          </div>
        ))}
      </nav>
      <div className="border-t p-2">
        <SidebarCollapseButton
          collapseLabel={t("nav.collapseSidebar")}
          expandLabel={t("nav.expandSidebar")}
          text={t("nav.collapse")}
        />
      </div>
      <Suspense fallback={null}>
        <SidebarActiveMarker />
      </Suspense>
    </aside>
  );
}

/** Runs before first paint: restores the collapsed state without a layout jump. */
export const sidebarInitScript = `try{if(localStorage.getItem("crypy.sidebar")==="collapsed")document.documentElement.dataset.sidebar="collapsed"}catch(e){}`;
