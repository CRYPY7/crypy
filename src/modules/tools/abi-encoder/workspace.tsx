import "server-only";
import { getTranslations } from "next-intl/server";
import type { CommonStrings } from "../shared/ui";
import { AbiEncoder, type AbiStrings } from "./widget";

export async function Workspace() {
  const t = await getTranslations("utilities");
  return <AbiEncoder strings={t.raw("abiEncoder") as AbiStrings} common={t.raw("common") as CommonStrings} />;
}
