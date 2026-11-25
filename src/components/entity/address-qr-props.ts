import "server-only";
import { getTranslations } from "next-intl/server";
import { liveChains } from "@/config/chains";
import type { AddressQrStrings, QrNetwork } from "./address-qr";

/** Strings and networks for the address QR dialog (EVM chains CRYPY supports). */
export async function addressQrProps(): Promise<{ strings: AddressQrStrings; networks: QrNetwork[] }> {
  const t = await getTranslations();
  return {
    strings: t.raw("entity.qr") as AddressQrStrings,
    networks: liveChains.filter((c) => c.family === "evm").map((c) => ({ key: c.key, name: t(`chains.${c.key}`) })),
  };
}
