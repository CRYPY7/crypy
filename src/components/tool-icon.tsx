import {
  Activity,
  AtSign,
  Bell,
  Binary,
  Calculator,
  ChartPie,
  Clock,
  CodeXml,
  Fuel,
  KeyRound,
  type LucideProps,
  Receipt,
  ShieldAlert,
  Wallet,
} from "lucide-react";
import type { ToolIconName } from "@/config/tools";

const icons = {
  "shield-alert": ShieldAlert,
  "key-round": KeyRound,
  wallet: Wallet,
  activity: Activity,
  "chart-pie": ChartPie,
  receipt: Receipt,
  fuel: Fuel,
  bell: Bell,
  calculator: Calculator,
  binary: Binary,
  "at-sign": AtSign,
  clock: Clock,
  "code-xml": CodeXml,
} satisfies Record<ToolIconName, React.ComponentType<LucideProps>>;

/** Server-rendered tool icon. Decorative: the tool name is always shown as text. */
export function ToolIcon({ name, ...props }: { name: ToolIconName } & LucideProps) {
  const Icon = icons[name];
  return <Icon aria-hidden="true" {...props} />;
}
