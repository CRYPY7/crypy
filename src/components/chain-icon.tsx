import { cn } from "@/lib/utils";

/**
 * Chain logo from /public/chains (cryptocurrency-icons, CC0-1.0). Decorative: the chain name is
 * always shown as text next to it. Plain <img> on purpose — tiny static SVG, no optimizer needed.
 */
export function ChainIcon({ chain, size = 16, className }: { chain: string; size?: number; className?: string }) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={`/chains/${chain}.svg`}
      width={size}
      height={size}
      alt=""
      aria-hidden="true"
      decoding="async"
      className={cn("inline-block shrink-0 rounded-full align-[-0.15em]", className)}
    />
  );
}
