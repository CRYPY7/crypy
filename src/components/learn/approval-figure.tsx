import { ArrowDown, ArrowRight } from "lucide-react";

/**
 * "Your wallet → permission → spender" diagram for the approvals guide. Built from regular elements, not a drawing,
 * so the text stays readable at every size: side by side on wider screens, stacked on phones. Theme colours, and
 * the arrows turn round in right-to-left languages. Labels come from the guide's text, so it is translated with it.
 */
export function ApprovalFigure({
  labels,
  alt,
}: {
  labels: readonly [string, string, string, string, string, string];
  alt: string;
}) {
  const [wallet, walletDetail, permission, permissionDetail, spender, spenderDetail] = labels;
  const arrow = (
    <span aria-hidden="true" className="grid place-items-center text-high">
      <ArrowRight className="hidden size-5 sm:block rtl:-scale-x-100" />
      <ArrowDown className="size-5 sm:hidden" />
    </span>
  );
  return (
    <div role="img" aria-label={alt} className="flex flex-col items-stretch gap-2 sm:flex-row sm:items-center">
      <div className="flex flex-1 flex-col items-center rounded-xl border border-border-strong bg-background px-3 py-4 text-center">
        <span className="font-semibold">{wallet}</span>
        <span className="text-sm text-muted-foreground">{walletDetail}</span>
      </div>
      {arrow}
      <div className="flex flex-1 flex-col items-center rounded-xl border border-dashed border-high/60 bg-high/8 px-3 py-3 text-center">
        <span className="text-sm font-semibold text-high">{permission}</span>
        <span className="text-sm text-muted-foreground">{permissionDetail}</span>
      </div>
      {arrow}
      <div className="flex flex-1 flex-col items-center rounded-xl border border-border-strong bg-background px-3 py-4 text-center">
        <span className="font-semibold">{spender}</span>
        <span className="text-sm text-muted-foreground">{spenderDetail}</span>
      </div>
    </div>
  );
}
