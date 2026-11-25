import "server-only";
import { getTranslations } from "next-intl/server";

import type { CommonStrings } from "../shared/ui";
import { SignatureVerifier, type SignatureVerifierStrings } from "./widget";

export async function Workspace() {
  const t = await getTranslations("utilities");
  return (
    <SignatureVerifier
      strings={t.raw("signatureVerifier") as SignatureVerifierStrings}
      common={t.raw("common") as CommonStrings}
    />
  );
}
