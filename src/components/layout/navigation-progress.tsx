"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

/**
 * B-029 (board 59): every page change shows that it's loading.
 *   - At once: the clicked sidebar item or bottom tab shows a small spinner (data-nav-pending, styled in globals.css).
 *   - After 150 ms, only if the new page isn't there yet: a thin bar runs along the top and the current page fades a
 *     little (html[data-navigating]), so a click never looks missed. Fast pages never show the bar (no flicker).
 *   - Screen readers hear "Loading" once.
 * Also prefetches a sidebar or tab page when the pointer rests on it, focus reaches it or a finger touches it, so the
 * click usually finds the page ready. Only those menu links (marked with data-sidebar-href or data-intent-prefetch):
 * result pages (addresses, transactions) are never prefetched, because each read costs blockchain requests.
 */
const SHOW_AFTER_MS = 150;
const GIVE_UP_MS = 20_000;

function internalTarget(event: MouseEvent): HTMLAnchorElement | null {
  if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return null;
  const anchor = (event.target as Element | null)?.closest?.("a[href]") as HTMLAnchorElement | null;
  if (!anchor || anchor.target === "_blank" || anchor.hasAttribute("download")) return null;
  const url = new URL(anchor.href, location.href);
  if (url.origin !== location.origin) return null;
  // Same page (only the #part changes): nothing to load.
  if (url.pathname === location.pathname && url.search === location.search) return null;
  return anchor;
}

export function NavigationProgress({ label }: { label: string }) {
  const pathname = usePathname();
  const router = useRouter();
  const [state, setState] = useState<"idle" | "loading" | "finishing">("idle");
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const target = useRef<string | null>(null);
  const prefetched = useRef(new Set<string>());

  const clear = () => {
    timers.current.forEach(clearTimeout);
    timers.current = [];
  };

  const finish = () => {
    clear();
    target.current = null;
    document.querySelectorAll("[data-nav-pending]").forEach((el) => el.removeAttribute("data-nav-pending"));
    delete document.documentElement.dataset.navigating;
    setState((s) => (s === "loading" ? "finishing" : "idle"));
    timers.current.push(setTimeout(() => setState("idle"), 300));
  };

  // A new page arrived.
  useEffect(() => {
    if (target.current) finish();
    // finish only touches refs, the DOM and state setters.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname]);

  useEffect(() => {
    const onClick = (event: MouseEvent) => {
      const anchor = internalTarget(event);
      if (!anchor) return;
      clear();
      document.querySelectorAll("[data-nav-pending]").forEach((el) => el.removeAttribute("data-nav-pending"));
      // Only menu items show the spinner (sidebar and bottom tabs); other links get the top bar.
      if (anchor.matches(".sidebar-item, [data-tab-item]")) anchor.setAttribute("data-nav-pending", "");
      const url = new URL(anchor.href, location.href);
      target.current = url.pathname + url.search;
      timers.current.push(
        setTimeout(() => {
          document.documentElement.dataset.navigating = "on";
          setState("loading");
        }, SHOW_AFTER_MS),
        setTimeout(finish, GIVE_UP_MS),
      );
      // Only the query changed (filters): the pathname effect won't fire, so watch the address.
      const watch = () => {
        if (!target.current) return;
        if (location.pathname + location.search === target.current) finish();
        else timers.current.push(setTimeout(watch, 100));
      };
      timers.current.push(setTimeout(watch, 100));
    };
    const onIntent = (event: Event) => {
      const anchor = (event.target as Element | null)?.closest?.(
        "a[data-sidebar-href], a[data-intent-prefetch]",
      ) as HTMLAnchorElement | null;
      if (!anchor) return;
      const url = new URL(anchor.href, location.href);
      if (url.origin !== location.origin || prefetched.current.has(url.pathname)) return;
      prefetched.current.add(url.pathname);
      router.prefetch(url.pathname + url.search);
    };
    document.addEventListener("click", onClick, true);
    document.addEventListener("pointerover", onIntent, { passive: true });
    document.addEventListener("focusin", onIntent);
    document.addEventListener("touchstart", onIntent, { passive: true });
    return () => {
      document.removeEventListener("click", onClick, true);
      document.removeEventListener("pointerover", onIntent);
      document.removeEventListener("focusin", onIntent);
      document.removeEventListener("touchstart", onIntent);
      clear();
    };
    // finish and clear only touch refs, the DOM and state setters.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router]);

  return (
    <>
      <div aria-hidden="true" data-state={state} className="nav-progress">
        <div className="h-full bg-primary" />
      </div>
      <span className="sr-only" role="status" aria-live="polite">
        {state === "loading" ? label : ""}
      </span>
    </>
  );
}
