"use client";

import { PanelLeftClose, PanelLeftOpen } from "lucide-react";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

const KEY = "crypy.sidebar";

/** Marks the sidebar link for the current page (and tool pages under it) with aria-current. */
export function SidebarActiveMarker() {
  const pathname = usePathname();
  useEffect(() => {
    const links = document.querySelectorAll<HTMLAnchorElement>("#tools-sidebar [data-sidebar-href]");
    links.forEach((link) => {
      const href = link.dataset.sidebarHref ?? "";
      link.toggleAttribute("aria-current", false);
      if (pathname === href) link.setAttribute("aria-current", "page");
    });
  }, [pathname]);
  return null;
}

export function SidebarCollapseButton({
  collapseLabel,
  expandLabel,
  text,
}: {
  collapseLabel: string;
  expandLabel: string;
  text: string;
}) {
  const [collapsed, setCollapsed] = useState(false);
  useEffect(() => {
    // Read the state set before paint by the layout's inline script.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setCollapsed(document.documentElement.dataset.sidebar === "collapsed");
  }, []);

  function toggle() {
    const next = !collapsed;
    setCollapsed(next);
    if (next) document.documentElement.dataset.sidebar = "collapsed";
    else delete document.documentElement.dataset.sidebar;
    try {
      localStorage.setItem(KEY, next ? "collapsed" : "open");
    } catch {
      // Storage blocked: the choice lasts for this page only.
    }
  }

  const Icon = collapsed ? PanelLeftOpen : PanelLeftClose;
  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={collapsed ? expandLabel : collapseLabel}
      aria-controls="tools-sidebar"
      aria-expanded={!collapsed}
      title={collapsed ? expandLabel : collapseLabel}
      className="sidebar-item flex min-h-9 w-full items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-sm text-muted-foreground hover:bg-muted hover:text-foreground"
    >
      <Icon className="size-[18px] shrink-0 rtl:-scale-x-100" aria-hidden="true" />
      <span className="sidebar-label">{text}</span>
    </button>
  );
}
