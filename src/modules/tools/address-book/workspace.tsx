import "server-only";
import { getTranslations } from "next-intl/server";

import { AddressBook, type AddressBookStrings } from "./widget";

export async function Workspace() {
  const t = await getTranslations("utilities");
  return <AddressBook strings={t.raw("addressBook") as AddressBookStrings} />;
}
