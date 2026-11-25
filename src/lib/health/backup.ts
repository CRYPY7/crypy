import { z } from "zod";

/**
 * Backups (stabilization S4). `scripts/server/backup.sh` (installed as crypy-backup) writes two small status files
 * after each nightly backup and weekly restore test; the health check reads them with these rules, so /admin shows
 * the real state and the owner gets a Telegram message when a backup, its R2 copy or a restore test fails.
 * Pure: no files, no clock.
 */
const iso = z.string().refine((s) => !Number.isNaN(Date.parse(s)));
const count = z.number().int().nonnegative().nullable();

export const backupStatusSchema = z.object({
  at: iso,
  ok: z.boolean(),
  failedStep: z.string().max(40).nullable(),
  bytes: z.number().int().nonnegative().nullable(),
  /** null: no copy off the server is set up (R2 not configured yet). */
  uploaded: z.boolean().nullable(),
  remote: z.string().max(120).nullable(),
});
export type BackupStatus = z.infer<typeof backupStatusSchema>;

export const restoreStatusSchema = z.object({
  at: iso,
  ok: z.boolean(),
  failedStep: z.string().max(40).nullable(),
  problem: z.string().max(200).nullable(),
  dump: z.string().max(120).nullable(),
  tables: z.record(z.string().max(40), z.object({ live: count, restored: count })),
  /** The newest copy in R2 at the time of the test; null when R2 isn't set up. */
  remote: z.object({ name: z.string().max(120).nullable(), bytes: count, ageHours: z.number().nullable() }).nullable(),
});
export type RestoreStatus = z.infer<typeof restoreStatusSchema>;

/** The nightly run is at 03:17 UTC; a backup older than this has missed a night. */
export const BACKUP_MAX_AGE_HOURS = 26;
/** The restore test runs every Sunday; older than this means it missed a week. */
export const RESTORE_MAX_AGE_DAYS = 8;

export interface BackupVerdict {
  state: "pass" | "slow" | "fail";
  detail: string;
}

const hours = (from: string, now: number) => (now - Date.parse(from)) / 3_600_000;
const size = (bytes: number) =>
  bytes < 1_048_576
    ? `${Math.max(1, Math.round(bytes / 1024))} KB`
    : `${(bytes / 1_048_576).toFixed(bytes < 10_485_760 ? 1 : 0)} MB`;

export function judgeBackups(backup: BackupStatus | null, restore: RestoreStatus | null, now: number): BackupVerdict {
  if (!backup) return { state: "fail", detail: "no backup has run yet" };
  if (!backup.ok)
    return {
      state: "fail",
      detail:
        backup.failedStep === "upload" || backup.failedStep === "verify-upload" || backup.failedStep === "encrypt"
          ? `last night's copy to R2 failed (${backup.failedStep}); the copy on the server may be fine`
          : `last backup failed (${backup.failedStep ?? "unknown step"})`,
    };
  const backupAge = hours(backup.at, now);
  if (backupAge > BACKUP_MAX_AGE_HOURS) return { state: "fail", detail: `last backup ${Math.floor(backupAge)} h ago` };
  if (restore && !restore.ok)
    return {
      state: "fail",
      detail: `restore test failed: ${restore.problem ?? `at ${restore.failedStep ?? "unknown step"}`}`,
    };

  const parts = [
    `backed up ${Math.floor(backupAge)} h ago${backup.bytes === null ? "" : ` (${size(backup.bytes)})`}`,
    backup.uploaded ? "copied to R2" : "not copied off the server: R2 not set up",
  ];
  if (!restore) return { state: "slow", detail: [...parts, "restore not tested yet"].join("; ") };
  const restoreDays = hours(restore.at, now) / 24;
  parts.push(`restore tested ${Math.floor(restoreDays)} d ago`);
  if (restoreDays > RESTORE_MAX_AGE_DAYS || backup.uploaded !== true)
    return { state: "slow", detail: parts.join("; ") };
  return { state: "pass", detail: parts.join("; ") };
}
