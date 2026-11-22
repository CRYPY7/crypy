/**
 * Removes secrets from text before it is logged. Provider keys sit in URL paths and queries (Alchemy /v2/<key>,
 * Infura /v3/<key>, Ankr, NodeReal, Chainstack, dRPC ?dkey=…), and the Telegram token in /bot<token>/ paths, so every
 * URL keeps only its scheme and host (security review, M9). Library errors (viem) include the full request URL.
 */
export function redactKeys(text: string): string {
  return text
    .replace(/\b(https?|wss?):\/\/([^\s/?#"'<>]+)[^\s"'<>]*/gi, "$1://$2/[…]")
    .replace(/\bbot\d{5,}:[A-Za-z0-9_-]{20,}/g, "bot[token]")
    .replace(/\b\d{5,}:[A-Za-z0-9_-]{30,}\b/g, "[token]")
    .replace(/([?&](?:key|apikey|api_key|token|dkey)=)[^&\s]+/gi, "$1[key]");
}
