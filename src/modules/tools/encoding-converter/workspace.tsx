import "server-only";
import { getTranslations } from "next-intl/server";
import type { CommonStrings } from "../shared/ui";
import { EncodingConverter, type EncodingStrings } from "./widget";

export async function Workspace() {
  const t = await getTranslations("utilities");
  return (
    <EncodingConverter
      strings={t.raw("encodingConverter") as EncodingStrings}
      common={t.raw("common") as CommonStrings}
    />
  );
}
