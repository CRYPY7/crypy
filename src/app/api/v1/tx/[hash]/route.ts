import { type NextRequest, NextResponse } from "next/server";
import { getTranslations } from "next-intl/server";
import { z } from "zod";
import { getChain } from "@/config/chains";
import { siteUrl } from "@/config/env";
import { defaultLocale, isLocale } from "@/i18n/locales";
import { interpret } from "@/lib/tx/interpret";
import { fail, ok } from "@/server/http/response";
import { clientKey, searchLimiter } from "@/server/rate-limit";
import { cachedTxDetails } from "@/server/services/lookups";
import { getEvmClient } from "@/server/chains/evm/providers";
import { summaryText } from "@/components/entity/tx-story";

const hashSchema = z.string().regex(/^0x[0-9a-fA-F]{64}$/);
const formatSchema = z.enum(["json", "text", "raw"]).default("json");

/**
 * GET /api/v1/tx/<hash>?chain=<key>&format=json|text|raw[&download=1][&locale=en]
 * json: CRYPY's details and interpretation; text: readable report; raw: the node's transaction and receipt.
 * Public chain data only; rate-limited; nothing is stored.
 */
export async function GET(request: NextRequest, { params }: { params: Promise<{ hash: string }> }) {
  const limit = searchLimiter(clientKey(request.headers));
  if (!limit.allowed) return fail("RATE_LIMITED", { "Retry-After": String(limit.retryAfterSeconds) });

  const { hash } = await params;
  const search = request.nextUrl.searchParams;
  const chain = getChain(search.get("chain") ?? "");
  const format = formatSchema.safeParse(search.get("format") ?? undefined);
  if (!hashSchema.safeParse(hash).success || !chain || !format.success) return fail("INVALID_INPUT");
  const localeParam = search.get("locale") ?? defaultLocale;
  const locale = isLocale(localeParam) ? localeParam : defaultLocale;
  const download = search.get("download") === "1";
  const fileBase = `crypy-tx-${chain.key}-${hash.slice(0, 10)}`;

  try {
    if (format.data === "raw") {
      const client = getEvmClient(chain);
      const [transaction, receipt] = await Promise.all([
        client.request({ method: "eth_getTransactionByHash", params: [hash as `0x${string}`] }),
        client.request({ method: "eth_getTransactionReceipt", params: [hash as `0x${string}`] }),
      ]);
      if (!transaction) return fail("NOT_FOUND");
      return new NextResponse(JSON.stringify({ chain: chain.caip2, transaction, receipt }, null, 2), {
        headers: {
          "content-type": "application/json; charset=utf-8",
          ...(download ? { "content-disposition": `attachment; filename="${fileBase}-raw.json"` } : {}),
        },
      });
    }

    const tx = await cachedTxDetails(chain.key, hash);
    if (!tx) return fail("NOT_FOUND");
    const interpretation = interpret(tx, chain.nativeSymbol);

    if (format.data === "text") {
      const t = await getTranslations({ locale });
      const url = `${siteUrl.origin}/${locale}/tx/${tx.hash}?chain=${chain.key}`;
      const text = summaryText({ tx, it: interpretation, chain, locale, t, explorerName: chain.explorer.name }, url);
      return new NextResponse(`${text}\n`, {
        headers: {
          "content-type": "text/plain; charset=utf-8",
          ...(download ? { "content-disposition": `attachment; filename="${fileBase}.txt"` } : {}),
        },
      });
    }

    if (download) {
      return new NextResponse(JSON.stringify({ details: tx, interpretation }, null, 2), {
        headers: {
          "content-type": "application/json; charset=utf-8",
          "content-disposition": `attachment; filename="${fileBase}.json"`,
        },
      });
    }
    return ok({ chain: chain.caip2, details: tx, interpretation }, { sources: ["rpc"] });
  } catch {
    return fail("UPSTREAM_UNAVAILABLE");
  }
}
