import "server-only";
import { getTranslations } from "next-intl/server";
import type { CommonStrings } from "../shared/ui";
import { JsonCsv, type JsonCsvStrings } from "./widget";

export async function Workspace() {
  const t = await getTranslations("utilities");
  return <JsonCsv strings={t.raw("jsonCsv") as JsonCsvStrings} common={t.raw("common") as CommonStrings} />;
}
