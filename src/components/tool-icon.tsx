import {
  Activity,
  AtSign,
  Bell,
  Binary,
  Braces,
  Calculator,
  ChartPie,
  Clock,
  CodeXml,
  Coins,
  Droplets,
  FileSignature,
  Hash,
  Fuel,
  KeyRound,
  Layers,
  type LucideProps,
  Percent,
  Scale,
  Receipt,
  Repeat,
  Sheet,
  ShieldAlert,
  TrendingDown,
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
  layers: Layers,
  coins: Coins,
  percent: Percent,
  scale: Scale,
  droplets: Droplets,
  "trending-down": TrendingDown,
  "file-signature": FileSignature,
  hash: Hash,
  braces: Braces,
  repeat: Repeat,
  sheet: Sheet,
} satisfies Record<ToolIconName, React.ComponentType<LucideProps>>;

/** Server-rendered tool icon. Decorative: the tool name is always shown as text. */
export function ToolIcon({ name, ...props }: { name: ToolIconName } & LucideProps) {
  const Icon = icons[name];
  return <Icon aria-hidden="true" {...props} />;
}
