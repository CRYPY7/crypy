import "server-only";
import { getTranslations } from "next-intl/server";
import type { CommonStrings } from "../shared/ui";
import { KeccakHash, type KeccakStrings } from "./widget";

export async function Workspace() {
  const t = await getTranslations("utilities");
  return <KeccakHash strings={t.raw("keccakHash") as KeccakStrings} common={t.raw("common") as CommonStrings} />;
}
