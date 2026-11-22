import Link from "next/link";
import type { ReactNode } from "react";
import { toolIds, type ToolId } from "@/config/tools";
import type { Locale } from "@/i18n/locales";
import { learnPath, toolPath } from "@/lib/routes";

const TOKEN = /\*\*(.+?)\*\*|\[([^\]]+)\]\((tool|guide):([a-z0-9-]+)\)/g;

/**
 * Guide text with its two marks: **bold** and [label](tool:<id>) / [label](guide:<slug>) links inside CRYPY.
 * Built as React elements, never as HTML, so guide text can't inject markup. Unknown targets render as plain text.
 */
export function InlineText({ text, locale, guides }: { text: string; locale: Locale; guides: readonly string[] }) {
  const out: ReactNode[] = [];
  let last = 0;
  for (const match of text.matchAll(TOKEN)) {
    const index = match.index ?? 0;
    if (index > last) out.push(text.slice(last, index));
    const [, bold, label, kind, target] = match;
    if (bold !== undefined) {
      out.push(<strong key={index}>{bold}</strong>);
    } else if (kind === "tool" && (toolIds as readonly string[]).includes(target)) {
      out.push(
        <Link
          key={index}
          href={toolPath(locale, target as ToolId)}
          className="font-medium text-primary underline-offset-4 hover:underline"
        >
          {label}
        </Link>,
      );
    } else if (kind === "guide" && guides.includes(target)) {
      out.push(
        <Link
          key={index}
          href={learnPath(locale, target)}
          className="font-medium text-primary underline-offset-4 hover:underline"
        >
          {label}
        </Link>,
      );
    } else {
      out.push(label);
    }
    last = index + match[0].length;
  }
  if (last < text.length) out.push(text.slice(last));
  return <>{out}</>;
}

/** The text without its marks, for structured data and search snippets. */
export function plainText(text: string): string {
  return text.replace(TOKEN, (_all, bold: string | undefined, label: string | undefined) => bold ?? label ?? "");
}
