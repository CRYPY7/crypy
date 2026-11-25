import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { type BackupStatus, type RestoreStatus, judgeBackups } from "@/lib/health/backup";

process.env.PGLITE_DIR = "memory";
const { probes, Skip } = await import("@/server/health/probes");
const { resetDb } = await import("@/server/db/client");
afterAll(() => resetDb());

const NOW = Date.UTC(2026, 10, 25, 12, 0, 0);
const hoursAgo = (h: number) => new Date(NOW - h * 3_600_000).toISOString();

const backup = (over: Partial<BackupStatus> = {}): BackupStatus => ({
  at: hoursAgo(9),
  ok: true,
  failedStep: null,
  bytes: 2_200_000,
  uploaded: true,
  remote: "crypy-2026-11-25T0317Z.dump.age",
  ...over,
});
const restore = (over: Partial<RestoreStatus> = {}): RestoreStatus => ({
  at: hoursAgo(3 * 24),
  ok: true,
  failedStep: null,
  problem: null,
  dump: "crypy-2026-11-22.dump",
  tables: { users: { live: 12, restored: 12 } },
  remote: { name: "crypy-2026-11-22T0317Z.dump.age", bytes: 2_300_000, ageHours: 1.5 },
  ...over,
});

describe("backup rules", () => {
  it("passes with a recent backup copied to R2 and a passed restore test", () => {
    expect(judgeBackups(backup(), restore(), NOW)).toEqual({
      state: "pass",
      detail: "backed up 9 h ago (2.1 MB); copied to R2; restore tested 3 d ago",
    });
  });

  it("fails when a backup, its R2 copy or a restore test failed, or a night was missed", () => {
    expect(judgeBackups(null, null, NOW).state).toBe("fail");
    expect(judgeBackups(backup({ ok: false, failedStep: "dump" }), restore(), NOW).detail).toBe(
      "last backup failed (dump)",
    );
    expect(judgeBackups(backup({ ok: false, failedStep: "upload" }), restore(), NOW).detail).toMatch(
      /copy to R2 failed \(upload\)/,
    );
    expect(judgeBackups(backup({ at: hoursAgo(30) }), restore(), NOW)).toEqual({
      state: "fail",
      detail: "last backup 30 h ago",
    });
    expect(judgeBackups(backup(), restore({ ok: false, problem: "empty in the backup: users" }), NOW).detail).toBe(
      "restore test failed: empty in the backup: users",
    );
  });

  it("warns (no message) when R2 isn't set up or the restore test is missing or old", () => {
    expect(judgeBackups(backup({ uploaded: null }), restore(), NOW)).toMatchObject({
      state: "slow",
      detail: expect.stringContaining("R2 not set up"),
    });
    expect(judgeBackups(backup(), null, NOW).state).toBe("slow");
    expect(judgeBackups(backup(), restore({ at: hoursAgo(9 * 24) }), NOW).state).toBe("slow");
  });
});

describe("backup health check", () => {
  const dir = mkdtempSync(join(tmpdir(), "crypy-backup-"));
  afterAll(() => rmSync(dir, { recursive: true, force: true }));
  const run = probes["server:backup"]!;

  it("is skipped where backups aren't installed", async () => {
    process.env.CRYPY_BACKUP_STATUS_DIR = join(dir, "missing");
    await expect(run()).rejects.toBeInstanceOf(Skip);
  });

  it("reads the status files the backup script writes", async () => {
    process.env.CRYPY_BACKUP_STATUS_DIR = dir;
    const at = new Date(Date.now() - 2 * 3_600_000).toISOString();
    // Exactly the shape backup.sh writes (checked in the server rehearsal).
    writeFileSync(
      join(dir, "backup.json"),
      `{"at":"${at}","ok":true,"failedStep":null,"bytes":22694,"uploaded":true,"remote":"crypy-x.dump.age"}\n`,
    );
    writeFileSync(
      join(dir, "restore.json"),
      `{"at":"${at}","ok":true,"failedStep":null,"problem":null,"dump":"crypy-x.dump","tables":{"users":{"live":2,"restored":2},"status_updates":{"live":0,"restored":0}},"remote":{"name":"crypy-x.dump.age","bytes":22894,"ageHours":0.0}}\n`,
    );
    await expect(run()).resolves.toMatch("backed up 2 h ago (22 KB); copied to R2; restore tested 0 d ago");

    writeFileSync(
      join(dir, "backup.json"),
      `{"at":"${at}","ok":false,"failedStep":"upload","bytes":null,"uploaded":false,"remote":"crypy-x.dump.age"}\n`,
    );
    await expect(run()).rejects.toThrow(/copy to R2 failed/);

    writeFileSync(join(dir, "backup.json"), "not json");
    await expect(run()).rejects.toThrow("backup status file unreadable");
  });
});
