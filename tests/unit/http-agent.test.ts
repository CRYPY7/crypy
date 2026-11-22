import { afterEach, describe, expect, it, vi } from "vitest";
import { preferHttp1 } from "@/server/http/agent";

const KEY = Symbol.for("undici.globalDispatcher.1");
const store = globalThis as unknown as Record<symbol, unknown>;

describe("outbound requests use HTTP/1.1", () => {
  const original = store[KEY];
  afterEach(() => {
    store[KEY] = original;
    vi.unstubAllEnvs();
  });

  it("replaces Node's fetch dispatcher with the same class, HTTP/2 off", async () => {
    const made: unknown[] = [];
    class FakeAgent {
      constructor(options: unknown) {
        made.push(options);
      }
    }
    store[KEY] = new FakeAgent({ allowH2: true });
    expect(await preferHttp1()).toBe("http/1.1 (undici.globalDispatcher.1)");
    expect(store[KEY]).toBeInstanceOf(FakeAgent);
    expect(made.at(-1)).toEqual({ allowH2: false });
  });

  it("handles undici 8: a newer slot with the agent, the older one with a wrapper around it", async () => {
    const KEY2 = Symbol.for("undici.globalDispatcher.2");
    class Agent {
      constructor(readonly options: unknown) {}
      dispatch() {
        return true;
      }
    }
    class Wrapper {
      constructor(readonly inner: { dispatch?: unknown }) {
        if (typeof inner?.dispatch !== "function") throw new TypeError("Argument dispatcher must implement dispatch");
      }
    }
    store[KEY2] = new Agent({});
    store[KEY] = new Wrapper(new Agent({}));
    try {
      expect(await preferHttp1()).toBe("http/1.1 (undici.globalDispatcher.2, undici.globalDispatcher.1)");
      expect((store[KEY2] as Agent).options).toEqual({ allowH2: false });
      expect((store[KEY] as Wrapper).inner).toBe(store[KEY2]);
    } finally {
      delete store[KEY2];
    }
  });

  it("works with Node's real dispatcher, and fetch still works afterwards", async () => {
    expect(await preferHttp1()).toMatch(/^http\/1\.1 \(undici\.globalDispatcher\.\d/);
    expect((store[KEY] as object).constructor.name).toBe("Agent");
    expect(await (await fetch("data:text/plain,ok")).text()).toBe("ok");
  });

  it("CRYPY_HTTP2=on keeps Node's default", async () => {
    vi.stubEnv("CRYPY_HTTP2", "on");
    const before = store[KEY];
    expect(await preferHttp1()).toBe("default kept");
    expect(store[KEY]).toBe(before);
  });
});
