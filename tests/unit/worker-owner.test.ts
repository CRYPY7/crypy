import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { isWorkerOwner, resetWorkerOwner } from "@/server/worker-owner";

describe("background worker owner (updates without a gap)", () => {
  let dir: string;
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "crypy-owner-"));
    vi.spyOn(process, "cwd").mockReturnValue(dir);
    resetWorkerOwner();
  });
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
    rmSync(dir, { recursive: true, force: true });
  });

  it("without an instance port (PC, tests, the old single service) the process is the owner", () => {
    vi.stubEnv("CRYPY_INSTANCE_PORT", "");
    writeFileSync(join(dir, ".crypy-worker"), "3001\n");
    expect(isWorkerOwner()).toBe(true);
  });

  it("without the file the process is the owner", () => {
    vi.stubEnv("CRYPY_INSTANCE_PORT", "3000");
    expect(isWorkerOwner()).toBe(true);
  });

  it("only the process whose port the file names runs the worker, and follows the hand-over", () => {
    vi.stubEnv("CRYPY_INSTANCE_PORT", "3000");
    writeFileSync(join(dir, ".crypy-worker"), "3000\n");
    expect(isWorkerOwner(1_000)).toBe(true);
    writeFileSync(join(dir, ".crypy-worker"), "3001\n");
    // Read at most every 5 s.
    expect(isWorkerOwner(2_000)).toBe(true);
    expect(isWorkerOwner(6_001)).toBe(false);
  });
});
