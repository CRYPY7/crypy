"use client";

import { ChevronDown, Globe, LayoutGrid, Moon, Sun } from "lucide-react";
import { useTheme } from "next-themes";
import { usePathname } from "next/navigation";
import { Suspense, useId } from "react";
import { buttonVariants } from "@/components/ui/button-variants";
import { LOCALE_COOKIE, type Locale } from "@/i18n/locales";
import { switchLocalePath } from "@/lib/routes";
import { cn } from "@/lib/utils";
import { openToolsDialog } from "./open-tools";

// Plain elements styled with the shared button styles: no UI library is loaded for the header.

export function AllToolsButton({ label, className }: { label: string; className?: string }) {
  return (
    <button
      type="button"
      aria-haspopup="dialog"
      onClick={openToolsDialog}
      className={cn(buttonVariants({ variant: "secondary", size: "md" }), "font-semibold", className)}
    >
      <LayoutGrid aria-hidden="true" />
      {label}
      <ChevronDown aria-hidden="true" className="opacity-70" />
    </button>
  );
}

export function ThemeToggle({ label }: { label: string }) {
  const { resolvedTheme, setTheme } = useTheme();
  return (
    <button
      type="button"
      aria-label={label}
      onClick={() => setTheme(resolvedTheme === "dark" ? "light" : "dark")}
      className={buttonVariants({ variant: "outline", size: "icon-md" })}
    >
      {/* Both icons are rendered; CSS shows the right one, so there is no flash or hydration mismatch. */}
      <Sun aria-hidden="true" className="hidden dark:block" />
      <Moon aria-hidden="true" className="dark:hidden" />
    </button>
  );
}

export interface LanguageOption {
  code: Locale;
  nativeName: string;
  beta: boolean;
}

function saveLocaleChoice(locale: Locale) {
  // One year; the proxy uses it to remember the visitor's choice.
  document.cookie = `${LOCALE_COOKIE}=${locale}; path=/; max-age=31536000; samesite=lax`;
}

/**
 * Language menu built on the browser's native popover (no JavaScript library).
 * Each option is a real link, so it also works before the page's scripts have loaded.
 */
interface LanguageMenuProps {
  current: Locale;
  options: LanguageOption[];
  label: string;
  betaLabel: string;
}

export function LanguageMenu(props: LanguageMenuProps) {
  // Reading the URL suspends on dynamic pages; until then links point to each language's home page.
  return (
    <Suspense fallback={<LanguageMenuView {...props} pathname={null} />}>
      <LanguageMenuWithPath {...props} />
    </Suspense>
  );
}

function LanguageMenuWithPath(props: LanguageMenuProps) {
  return <LanguageMenuView {...props} pathname={usePathname()} />;
}

function LanguageMenuView({
  current,
  options,
  label,
  betaLabel,
  pathname,
}: LanguageMenuProps & { pathname: string | null }) {
  const id = useId();
  const popoverId = `${id}-languages`;
  const currentOption = options.find((option) => option.code === current);

  return (
    <div className="relative">
      <button
        type="button"
        popoverTarget={popoverId}
        aria-label={label}
        className={cn(buttonVariants({ variant: "outline", size: "md" }), "lang-menu-anchor")}
      >
        <Globe aria-hidden="true" />
        <span className="hidden lg:inline">{currentOption?.nativeName ?? current}</span>
        <span className="lg:hidden">{current.toUpperCase()}</span>
      </button>
      <div
        id={popoverId}
        popover="auto"
        className="lang-menu-popover w-56 rounded-lg border bg-popover p-1 text-popover-foreground shadow-lg"
      >
        <ul>
          {options.map((option) => (
            <li key={option.code}>
              <a
                href={pathname ? switchLocalePath(pathname, option.code) : `/${option.code}`}
                hrefLang={option.code}
                lang={option.code}
                aria-current={option.code === current ? "true" : undefined}
                onClick={() => saveLocaleChoice(option.code)}
                className="flex min-h-11 items-center justify-between rounded-md px-3 text-base hover:bg-muted aria-[current=true]:font-semibold"
              >
                <span>{option.nativeName}</span>
                {option.beta && <span className="text-xs text-muted-foreground">{betaLabel}</span>}
              </a>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
