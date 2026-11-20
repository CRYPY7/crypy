import "server-only";
import { getTranslations } from "next-intl/server";
import { type ToolCategory, type ToolDefinition, toolCategories, tools } from "@/config/tools";
import type { Locale } from "@/i18n/locales";
import { toolPath } from "@/lib/routes";

/** Translated, serialisable view of a tool for client components (no i18n runtime in the browser). */
export interface ToolView {
  id: ToolDefinition["id"];
  icon: ToolDefinition["icon"];
  category: ToolCategory;
  categoryLabel: string;
  name: string;
  question: string;
  description: string;
  input: string;
  cta: string;
  href: string;
  status: ToolDefinition["status"];
  statusLabel: string;
  milestone: string;
  featured: boolean;
}

export async function getToolViews(locale: Locale): Promise<ToolView[]> {
  const t = await getTranslations();
  return tools.map((tool) => ({
    id: tool.id,
    icon: tool.icon,
    category: tool.category,
    categoryLabel: t(`categories.${tool.category}`),
    name: t(`tools.${tool.id}.name`),
    question: t(`tools.${tool.id}.question`),
    description: t(`tools.${tool.id}.description`),
    input: t(`tools.${tool.id}.input`),
    cta: t(`tools.${tool.id}.cta`),
    href: toolPath(locale, tool.id),
    status: tool.status,
    statusLabel: t(`common.status.${tool.status}`),
    milestone: tool.milestone,
    featured: Boolean(tool.featured),
  }));
}

export async function getCategoryLabels(): Promise<{ id: ToolCategory; label: string }[]> {
  const t = await getTranslations("categories");
  return toolCategories.map((id) => ({ id, label: t(id) }));
}
