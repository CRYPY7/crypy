import { sql } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

/** S3 (B-005): GoPlus answers are saved, reused for a while without a call, and fill in when GoPlus is down. */
vi.mock("next/cache", () => ({ cacheLife: () => {} }));
const fetchMock = vi.fn<(url: string) => Promise<Response>>();
vi.mock("@/server/http/limit", () => ({ limitedFetch: (url: string) => fetchMock(url) }));
process.env.PGLITE_DIR = "memory";

const { resetDb, getDb } = await import("@/server/db/client");
const { savedResults } = await import("@/server/db/schema");
const { goPlusToken, goPlusApprovals, resetOutsideSources } = await import("@/server/security/external");
const { resetGoPlusPace } = await import("@/server/security/goplus-budget");

const TOKEN = "0x1111111111111111111111111111111111111111";
const OWNER = "0x2222222222222222222222222222222222222222";
const json = (body: unknown) => new Response(JSON.stringify(body), { status: 200 });
const settle = () => new Promise((resolve) => setTimeout(resolve, 60));
const tokenAnswer = json({ code: 1, result: { [TOKEN]: { is_honeypot: "0", buy_tax: "0", sell_tax: "0.01" } } });

/** Makes every saved answer `ms` older (and forgets the in-memory copies, which would have expired too). */
async function ageAll(ms: number) {
  resetOutsideSources();
  const db = await getDb();
  await db.update(savedResults).set({ savedAt: sql`${savedResults.savedAt} - (${ms} * interval '1 millisecond')` });
}

beforeEach(() => {
  resetOutsideSources();
  fetchMock.mockReset();
  resetGoPlusPace();
});
afterAll(() => resetDb());

describe("saved GoPlus answers", () => {
  it("token: a saved answer under an hour old is reused without calling GoPlus; an older one fills in when GoPlus is down", async () => {
    fetchMock.mockResolvedValueOnce(tokenAnswer);
    const first = await goPlusToken(1, TOKEN);
    expect(first.status).toBe("ok");
    await settle();
    const again = await goPlusToken(1, TOKEN);
    expect(again).toEqual(first);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    // Two hours later GoPlus is down: the saved answer is shown, with its own check time.
    await ageAll(2 * 3_600_000);
    fetchMock.mockRejectedValueOnce(new Error("down"));
    const down = await goPlusToken(1, TOKEN);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(down.status).toBe("ok");
    if (down.status === "ok" && first.status === "ok") expect(down.facts.fetchedAt).toBe(first.facts.fetchedAt);
    // Over a day old: not used.
    await ageAll(24 * 3_600_000);
    fetchMock.mockRejectedValueOnce(new Error("down"));
    expect((await goPlusToken(1, TOKEN)).status).toBe("unavailable");
  });

  it("R3: Portfolio's badges reuse an answer up to 6 hours old without calling GoPlus; pages don't", async () => {
    fetchMock.mockImplementation(async () =>
      json({ code: 1, result: { [TOKEN]: { is_honeypot: "0", buy_tax: "0", sell_tax: "0.01" } } }),
    );
    const first = await goPlusToken(1, TOKEN);
    expect(first.status).toBe("ok");
    await settle();
    await ageAll(2 * 3_600_000);
    const calls = fetchMock.mock.calls.length;
    expect((await goPlusToken(1, TOKEN, "portfolio")).status).toBe("ok");
    expect(fetchMock.mock.calls.length).toBe(calls);
    await goPlusToken(1, TOKEN, "page");
    expect(fetchMock.mock.calls.length).toBe(calls + 1);
  });

  it("R3: a 'not listed' answer is saved too, so a restart doesn't ask GoPlus again", async () => {
    const OTHER = "0x3333333333333333333333333333333333333333";
    fetchMock.mockImplementation(async () => json({ code: 1, result: {} }));
    expect((await goPlusToken(1, OTHER)).status).toBe("not-listed");
    await settle();
    resetOutsideSources(); // a restart: memory empty, the database kept
    const calls = fetchMock.mock.calls.length;
    expect((await goPlusToken(1, OTHER, "portfolio")).status).toBe("not-listed");
    expect(fetchMock.mock.calls.length).toBe(calls);
  });

  it("approvals: reused for 5 minutes; when GoPlus is down a saved list fills in as partial", async () => {
    const list = json({
      code: 1,
      result: [{ token_address: TOKEN, approved_list: [{ approved_contract: OWNER, approved_amount: "1" }] }],
    });
    fetchMock.mockImplementation(async (url) =>
      url.includes("token_approval") ? list.clone() : json({ code: 1, result: [] }),
    );
    const first = await goPlusApprovals(56, OWNER);
    expect(first.status).toBe("ok");
    await settle();
    const calls = fetchMock.mock.calls.length;
    expect(await goPlusApprovals(56, OWNER)).toEqual(first);
    expect(fetchMock.mock.calls.length).toBe(calls);
    await ageAll(10 * 60_000);
    fetchMock.mockReset();
    fetchMock.mockRejectedValue(new Error("down"));
    const down = await goPlusApprovals(56, OWNER);
    expect(down.status).toBe("partial");
    if (down.status !== "unavailable" && first.status !== "unavailable") expect(down.leads).toEqual(first.leads);
  });
});
