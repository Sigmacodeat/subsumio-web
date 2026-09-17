import { describe, expect, it } from "vitest";
import {
  BACKUP_MAX_AGE_HOURS,
  describeBackupAge,
  describeDisk,
  DISK_WARN_FREE_RATIO,
} from "./ops-health";

const GB = 1024 ** 3;

describe("disk check", () => {
  it("fails below the free-space threshold and says how much is left", () => {
    expect(describeDisk(2.9 * GB, 150 * GB)).toEqual({
      ok: false,
      detail: "2.9 GB frei von 150.0 GB (2 %)",
    });
    expect(describeDisk(40 * GB, 150 * GB).ok).toBe(true);
    expect(describeDisk(DISK_WARN_FREE_RATIO * 100 * GB, 100 * GB).ok).toBe(true);
    expect(describeDisk(0, 0).ok).toBe(false);
  });
});

describe("backup check", () => {
  const now = new Date("2026-09-18T06:00:00Z");
  it("reports a missing setup, a missing run and a stale backup", () => {
    expect(describeBackupAge(null, now, false).detail).toMatch(/kein Backup eingerichtet/);
    expect(describeBackupAge(null, now, true)).toEqual({
      ok: false,
      detail: "noch kein Backup gelaufen",
    });
    const stale = new Date(now.getTime() - (BACKUP_MAX_AGE_HOURS + 1) * 3_600_000);
    expect(describeBackupAge(stale, now, true).ok).toBe(false);
  });
  it("accepts a backup from last night", () => {
    const result = describeBackupAge(new Date("2026-09-18T02:00:00Z"), now, true);
    expect(result).toEqual({ ok: true, detail: "letztes Backup vor 4 h (2026-09-18 02:00 UTC)" });
  });
});
