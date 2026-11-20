import { type Server, createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  type Provider,
  coolDownFor,
  rankedFallback,
  refusesLately,
  resetCoolDown,
  resetRefusals,
  resetSpeeds,
  resetUsage,
} from "@/server/chains/evm/providers";

/** Fake JSON-RPC nodes on this machine (test fixtures only). Each answers by its configured behaviour. */
type Behaviour = { result?: unknown; error?: { code: number; message: string }; status?: number; delay?: number };
const servers: Server[] = [];
const hits: Record<string, number> = {};
const behaviours: Record<string, Behaviour> = {};

async function node(name: string): Promise<Provider> {
  const server = createServer((req, res) => {
    let body = "";
    req.on("data", (chunk) => (body += chunk));
    req.on("end", async () => {
      hits[name] = (hits[name] ?? 0) + 1;
      const b = behaviours[name]!;
      if (b.delay) await new Promise((r) => setTimeout(r, b.delay));
      if (b.status) {
        res.writeHead(b.status).end();
        return;
      }
      const parsed = JSON.parse(body);
      const one = (r: { id: number }) =>
        b.error ? { jsonrpc: "2.0", id: r.id, error: b.error } : { jsonrpc: "2.0", id: r.id, result: b.result ?? null };
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify(Array.isArray(parsed) ? parsed.map(one) : one(parsed)));
    });
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", () => r()));
  servers.push(server);
  return { name, kind: "public", url: `http://127.0.0.1:${(server.address() as AddressInfo).port}` };
}

let a: Provider;
let b: Provider;
beforeAll(async () => {
  a = await node("a");
  b = await node("b");
});
afterAll(() => servers.forEach((s) => s.close()));
beforeEach(() => {
  resetSpeeds();
  resetCoolDown();
  resetUsage();
  resetRefusals();
  hits.a = 0;
  hits.b = 0;
});

const ask = (method: string) =>
  rankedFallback([a, b])({ chain: undefined, retryCount: 0 }).request({ method, params: ["0x01"] });
const TX = { hash: "0x01", blockNumber: "0x10" };

describe("ranked fallback", () => {
  it("when every node is resting, the one whose rest ends soonest is asked again instead of failing at once", async () => {
    behaviours.a = { result: "0x1" };
    behaviours.b = { result: "0x2" };
    coolDownFor(a, 50_000);
    coolDownFor(b, 10_000);
    expect(await ask("eth_blockNumber")).toBe("0x2");
    expect(hits).toMatchObject({ a: 0, b: 1 });
  });

  it("one node's 'not found' is not final: the other node's answer wins", async () => {
    behaviours.a = { result: null };
    behaviours.b = { result: TX };
    expect(await ask("eth_getTransactionByHash")).toEqual(TX);
  });

  it("'not found' only when every node says so", async () => {
    behaviours.a = { result: null };
    behaviours.b = { result: null };
    expect(await ask("eth_getTransactionReceipt")).toBeNull();
    expect(hits).toMatchObject({ a: 1, b: 1 });
  });

  it("a node that fails while another says 'not found' still means 'not found'", async () => {
    behaviours.a = { status: 503 };
    behaviours.b = { result: null };
    expect(await ask("eth_getTransactionByHash")).toBeNull();
  });

  it("a slow node is backed up by the next one", async () => {
    behaviours.a = { result: "0x1", delay: 3_000 };
    behaviours.b = { result: "0x2" };
    const started = Date.now();
    expect(await ask("eth_blockNumber")).toBe("0x2");
    expect(Date.now() - started).toBeLessThan(2_000);
  });

  it("a revert is final: no other node is asked", async () => {
    behaviours.a = { error: { code: 3, message: "execution reverted: nope" } };
    behaviours.b = { result: "0x" };
    await expect(ask("eth_call")).rejects.toThrow(/reverted/);
    expect(hits.b).toBe(0);
  });

  it("other node errors move on to the next node", async () => {
    behaviours.a = { error: { code: -32000, message: "missing trie node" } };
    behaviours.b = { result: "0xabc" };
    expect(await ask("eth_call")).toBe("0xabc");
  });

  it("a node that refused old data is asked last for a while, not removed", async () => {
    behaviours.a = { error: { code: -32602, message: "Archive requests require a personal token" } };
    behaviours.b = { result: TX };
    expect(await ask("eth_getTransactionReceipt")).toEqual(TX);
    expect(refusesLately(a, "eth_getTransactionReceipt")).toBe(true);
    // Other kinds of requests still go to it first.
    expect(refusesLately(a, "eth_blockNumber")).toBe(false);
    hits.a = 0;
    expect(await ask("eth_getTransactionReceipt")).toEqual(TX);
    expect(hits.a).toBe(0);
  });
});
