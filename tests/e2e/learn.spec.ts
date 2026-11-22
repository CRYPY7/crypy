import { expect, test } from "@playwright/test";

/** Learn hub and guides (SEO_ROADMAP.md, Phase 2; design boards 42–45). */

test("the Learn hub lists every guide, features one, and filters by topic", async ({ page }) => {
  await page.goto("/en/learn", { waitUntil: "load" });
  await expect(page.getByRole("heading", { level: 1 })).toContainText("Learn to spot crypto risks");
  const start = page.locator("section[aria-labelledby=start-here]");
  await expect(start.getByRole("link")).toHaveAttribute("href", "/en/learn/seed-phrase-safety");
  const grid = page.locator("section[aria-labelledby=all-guides] ul li");
  // 12 guides: the featured one above, the other 11 in the grid.
  await expect(grid).toHaveCount(11);
  await expect(async () => {
    await page.getByRole("button", { name: "Approvals", exact: true }).click();
    await expect(grid).toHaveCount(2, { timeout: 1_000 });
  }).toPass({ timeout: 20_000 });
  await expect(page.getByRole("button", { name: "Approvals", exact: true })).toHaveAttribute("aria-pressed", "true");
  await expect(grid.first()).toContainText("Token approvals explained");
  await page.getByRole("button", { name: "Wallet safety" }).click();
  // The featured guide is listed again once its topic is chosen.
  await expect(grid).toHaveCount(3);
  await expect(grid.filter({ hasText: "Your seed phrase" })).toHaveCount(1);
});

test("a guide has its summary, contents, tool link, questions and related guides", async ({ page, isMobile }) => {
  await page.goto("/en/learn/token-approvals", { waitUntil: "load" });
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Token approvals explained, and how to revoke them");
  await expect(page.getByRole("heading", { name: "In short" })).toBeVisible();
  // Links in the text go to the tool, never somewhere outside CRYPY.
  const inText = page.locator("article section p a").first();
  await expect(inText).toHaveAttribute("href", /^\/en\/(tools|learn)\//);
  await expect(page.getByRole("link", { name: "Open Approval Checker" }).first()).toHaveAttribute(
    "href",
    "/en/tools/approval-checker",
  );
  await expect(page.getByRole("heading", { name: "Questions" })).toBeVisible();
  await expect(page.locator("section[aria-labelledby=related-guides] li")).toHaveCount(3);
  // "On this page": a sidebar on desktop, a folded list on phones; both jump to the section.
  if (isMobile) {
    await page.getByText("On this page").first().click();
  }
  const toc = page.getByRole("navigation", { name: "On this page" }).filter({ visible: true });
  await toc.getByRole("link", { name: "How to revoke an approval" }).click();
  await expect(page).toHaveURL(/#revoke$/);
  await expect(page.getByRole("heading", { name: "How to revoke an approval" })).toBeInViewport();
});

test("a guide's structured data describes an article with its questions", async ({ request }) => {
  const html = await (await request.get("/en/learn/why-transaction-failed")).text();
  const blocks = [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].flatMap((m) => {
    const data = JSON.parse(m[1]);
    return Array.isArray(data) ? data : [data];
  });
  const article = blocks.find((block) => block["@type"] === "Article");
  expect(article.headline).toBe("Why did my transaction fail? Common errors in plain English");
  expect(article.dateModified).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  const faq = blocks.find((block) => block["@type"] === "FAQPage");
  expect(faq.mainEntity.length).toBeGreaterThanOrEqual(2);
  // Marks such as **bold** never leak into structured data.
  expect(JSON.stringify(blocks)).not.toContain("**");
});

test("tool pages link to their guides and to related tools", async ({ page }) => {
  await page.goto("/en/tools/approval-checker", { waitUntil: "load" });
  const learn = page.locator("section[aria-labelledby=learn-more]");
  await expect(learn.getByRole("link")).toHaveCount(2);
  await expect(learn.getByRole("link").first()).toHaveAttribute("href", "/en/learn/token-approvals");
  const related = page.locator("section[aria-labelledby=related-tools]");
  await expect(related.getByRole("link")).toHaveCount(3);
  await expect(related.getByRole("link", { name: /Token Security Scanner/ })).toHaveAttribute(
    "href",
    "/en/tools/token-security",
  );
});

test("Learn is in the main navigation", async ({ page, isMobile }) => {
  await page.goto("/en", { waitUntil: "load" });
  const nav = isMobile ? page.getByRole("navigation", { name: "Primary" }) : page.locator("#tools-sidebar");
  await nav.getByRole("link", { name: /Learn/ }).click();
  await expect(page).toHaveURL(/\/en\/learn$/);
});

test("unknown guides answer 404, and other languages show the English guide without indexing it", async ({
  request,
}) => {
  expect((await request.get("/en/learn/not-a-guide")).status()).toBe(404);
  const urdu = await (await request.get("/ur/learn/token-approvals")).text();
  expect(urdu).toContain("This guide isn't translated yet");
  expect(urdu).toMatch(/<meta name="robots" content="noindex, follow"/);
});
