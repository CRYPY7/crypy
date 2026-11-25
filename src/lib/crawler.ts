/**
 * Known crawlers, scrapers and scripted clients, by user agent (S3, B-021 follow-up). Result pages (address, token,
 * transaction, search) are disallowed in robots.txt and marked noindex; a client that still asks for one gets a light
 * page without any blockchain lookups, so it costs CRYPY almost nothing. Link previews (Telegram, Slack, X…) still get
 * the page title. Real browsers always send a user agent; an empty one counts as scripted.
 */
const CRAWLER =
  /bot\b|bot\/|crawl|spider|slurp|facebookexternalhit|meta-external|bytespider|gptbot|claudebot|anthropic-ai|ccbot|amazonbot|petalbot|semrush|ahrefs|mj12|dotbot|dataforseo|python-requests|python-urllib|curl\/|wget\/|go-http-client|scrapy|okhttp|java\/|libwww|httpclient|axios\/|node-fetch|undici|headless(?!chrome)/i;

export function isCrawler(userAgent: string | null | undefined): boolean {
  const ua = (userAgent ?? "").trim();
  return ua === "" || CRAWLER.test(ua);
}
