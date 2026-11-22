import { describe, expect, it } from "vitest";
import { readBodyJson, readBodyText } from "@/server/http/body";

const post = (body: BodyInit | null, headers: Record<string, string> = {}) =>
  new Request("http://localhost/api", { method: "POST", body, headers, duplex: "half" } as RequestInit);

describe("request bodies are size-capped", () => {
  it("reads a normal JSON body", async () => {
    expect(await readBodyJson(post('{"a":1}'), 100)).toEqual({ a: 1 });
  });

  it("returns an empty string for no body, and null JSON for it", async () => {
    expect(await readBodyText(post(null), 100)).toBe("");
    expect(await readBodyJson(post(null), 100)).toBeNull();
  });

  it("refuses a declared size over the cap without reading it", async () => {
    expect(await readBodyText(post("x", { "content-length": "101" }), 100)).toBeNull();
  });

  it("stops reading a streamed body once it passes the cap", async () => {
    let pulled = 0;
    const stream = new ReadableStream<Uint8Array>({
      pull(controller) {
        pulled += 1;
        if (pulled > 1_000) controller.close();
        else controller.enqueue(new Uint8Array(1_024));
      },
    });
    expect(await readBodyText(post(stream), 10_000)).toBeNull();
    expect(pulled).toBeLessThan(20);
  });

  it("refuses invalid JSON and invalid UTF-8", async () => {
    expect(await readBodyJson(post("{nope"), 100)).toBeNull();
    expect(await readBodyText(post(new Uint8Array([0xff, 0xfe, 0xfd])), 100)).toBeNull();
  });
});
