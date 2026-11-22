# CRYPY — SEO Roadmap

Owner request 2026-11-22: "very good SEO for the whole website", started before the Urdu translation. Rules that
apply to every phase:

- **Real pages only.** Every indexable page answers a real question with real content or a working tool. No
  auto-generated doorway pages, keyword stuffing, hidden text, bought links or fake reviews (Google penalises them,
  and they break CRYPY's honesty rules).
- **Never a "safe" verdict**, in titles and snippets too ("token security check", never "is X safe? yes").
- **Zero API cost:** free tools only (Google Search Console, Bing Webmaster Tools, IndexNow, PageSpeed Insights).
- **Infinite result pages stay out of search** (`/address`, `/tx`, uncurated `/token`, `/search`): they cost provider
  calls on every crawl and would be thin duplicates.
- New screens (Learn hub, curated token pages, chain gas pages) get a design for approval first.

## Audit of the live site (2026-11-22)

Checked on crypy.org: all 20 sitemap pages answer 200, each has one H1, a canonical link, hreflang (`en` and
`x-default`), Open Graph and Twitter cards, and preview images. Tool pages carry BreadcrumbList and WebApplication
structured data; 10 of 14 also have FAQPage. Lighthouse SEO score was 100 on every indexable page.

| Finding                                                                                                         | Impact | Phase |
| --------------------------------------------------------------------------------------------------------------- | ------ | ----- |
| Titles are short names (17–42 characters, e.g. "Gas Tracker · CRYPY"): no search words such as "gwei" or "fee"  | High   | 1     |
| 9 descriptions are 50–98 characters (Google shows ~150); the Watchlist one is 185 (cut off)                     | High   | 1     |
| 4 thin tool pages (190–240 words, no how-to or FAQ): Approval Checker, Address Analyzer, Gas Tracker, Timestamp | High   | 1     |
| No `favicon.ico`, Apple touch icon or web manifest (search results and phones show a generic icon)              | Medium | 1     |
| `/en/tools/<unknown>` answers 200 instead of 404 (a "soft 404")                                                 | Medium | 1     |
| All-tools page has no ItemList structured data and a 50-character description                                   | Medium | 1     |
| Settings page is in the sitemap (no search value)                                                               | Low    | 1     |
| Organization logo is an SVG (Google prefers a raster logo for the knowledge panel)                              | Low    | 1     |
| No guides: nothing ranks for questions like "how to revoke token approvals" or "what is a honeypot token"       | High   | 2     |
| No indexable pages for popular tokens or per-chain gas prices                                                   | High   | 3     |
| Only English is indexable                                                                                       | Medium | 4     |
| Not yet in Google Search Console / Bing Webmaster Tools; no IndexNow                                            | High   | 1, 5  |

## Phase 1 — Technical foundation and on-page (now; no new designs)

1. **Search titles and descriptions** for every indexable page, kept separate from the on-page names: titles
   50–60 characters with the words people search for ("Token Approval Checker — Find & Revoke Risky Approvals"),
   descriptions 120–160 characters that say what the page does and that it's free, with no wallet connection.
2. **How-to and FAQ** on the four thin tool pages (same layout as the other tools, so FAQPage structured data too).
3. **All-tools page:** CollectionPage + ItemList structured data, a proper description.
4. **Icons:** `favicon.ico` (48 px multiple), Apple touch icon, web manifest; a PNG logo for the Organization data.
5. **Real 404** for unknown tool addresses.
6. **Sitemap:** drop Settings (and mark it `noindex`).
7. **IndexNow:** key file and a script that notifies Bing, Yandex and others of the sitemap pages after an update
   (Google doesn't use IndexNow; it uses the sitemap in Search Console).
8. **Automated SEO checks** in the test suite: every sitemap page has a title of 30–60 characters, a description of
   110–160, exactly one H1, a canonical link and valid structured data. A future change can't quietly break SEO.
9. **Owner:** Google Search Console (domain property via a Cloudflare TXT record, submit `sitemap.xml`) and Bing
   Webmaster Tools (import from Google); turn off Cloudflare Web Analytics.

**Done when:** all checks in point 8 pass on the live site; Search Console shows the sitemap read with no errors.

## Phase 2 — Learn hub: guides that answer real questions (design approval first)

`/en/learn` and `/en/learn/<guide>`: short, original, accurate guides, each ending with the CRYPY tool that does the
job. Article and BreadcrumbList structured data, author "CRYPY", date published and updated, linked from the home
page, the sidebar and the matching tool pages ("Learn more"). Each tool page also links to 2–3 related tools.

First guides (by search demand and fit with the tools):

| Guide                                                       | Links to                    |
| ----------------------------------------------------------- | --------------------------- |
| How to check if a token is a scam before you buy            | Token Security Scanner      |
| What is a honeypot token, and how to spot one               | Token Security Scanner      |
| Token approvals explained, and how to revoke them           | Approval Checker            |
| Are unlimited approvals dangerous?                          | Approval Checker            |
| Address poisoning: the look-alike address scam              | Address Analyzer            |
| Why did my transaction fail? Common errors in plain English | Transaction Checker         |
| How to read a transaction (from, to, value, gas, logs)      | Transaction Checker         |
| Gas fees explained: gwei, base fee and priority fee         | Gas Tracker, Unit Converter |
| What is a liquidity lock, and why it matters                | Token Security Scanner      |
| Wei, gwei and ether: crypto units explained                 | Unit Converter              |
| Checksum addresses (EIP-55): why letter case matters        | Address Formatter           |
| Your seed phrase: why no website should ever ask for it     | All tools                   |

**Done when:** 12 guides live, each reviewed for accuracy, linked both ways with its tool, in the sitemap.

## Phase 3 — Indexable data pages (design approval first)

- **Gas by chain:** `/en/gas/ethereum`, `/en/gas/bnb-chain`, `/en/gas/base`, `/en/gas/arbitrum`, `/en/gas/polygon`
  ("Ethereum gas price now", "Base gas fees"): live numbers plus a short explanation for that chain.
- **Curated token security pages:** a reviewed list of well-known tokens per chain (for example the top ~50 by
  liquidity), their security report indexable with the title "<Token> token security check — taxes, owner powers,
  liquidity". Rebuilt on a schedule with a visible "checked at" time; all other token pages stay `noindex`.
  Never a "safe" claim.
- Both added to the sitemap with real update times.

**Done when:** pages live, cached so crawlers cost no extra provider calls, structured data valid.

## Phase 4 — Languages (with the M9 translations)

Urdu first (owner review), then Arabic (native review), then the others. Each language becomes indexable only after
review: localized titles and descriptions written for local searches (not word-for-word), hreflang between all
reviewed languages, a localized Open Graph image font. Guides translated after the tool pages.

## Phase 5 — Measure and improve (ongoing, monthly)

- Search Console: queries, click-through rate, pages not indexed, Core Web Vitals; improve titles of pages with
  many impressions but few clicks.
- PageSpeed Insights on production for the address and transaction pages (open item in the roadmap).
- Broken-link and structured-data checks (run by the automated tests).
- New guides from real search queries people use to reach CRYPY.

## Phase 6 — Reputation and links (honest only)

Listings where people look for crypto tools (for example AlternativeTo, Product Hunt, DappRadar-style directories,
GitHub README), answers in communities where CRYPY genuinely helps, and links from security write-ups. No paid or
exchanged links, no spam.

## Status

| Phase                   | Status                    |
| ----------------------- | ------------------------- |
| 1 Technical and on-page | ✅ Built (2026-11-22)     |
| 2 Learn hub             | ✅ Built (2026-11-22)     |
| 3 Indexable data pages  | ✅ Built (2026-11-22)     |
| 4 Languages             | With the M9 translations  |
| 5 Measure and improve   | After Search Console data |
| 6 Reputation and links  | After Phase 2             |
