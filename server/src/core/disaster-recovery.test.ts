/**
 * Tests for EPIC 8 — T8.6 Backups and Disaster Recovery
 */
import { describe, it, expect, beforeEach } from "vitest";
import {
  BACKUP_TARGETS,
  createBackupManifest,
  verifyBackupIntegrity,
  runRestoreDrill,
  listBackupManifests,
  getBackupManifest,
  listRestoreDrills,
  getRestoreDrill,
  getDRStatus,
  getBackupTargets,
  _resetDRStore,
} from "./disaster-recovery.ts";

describe("Disaster Recovery", () => {
  beforeEach(() => {
    _resetDRStore();
  });

  describe("BACKUP_TARGETS", () => {
    it("defines all 5 required backup targets", () => {
      expect(BACKUP_TARGETS).toHaveLength(5);
      const types = BACKUP_TARGETS.map((t) => t.type);
      expect(types).toContain("postgres_db");
      expect(types).toContain("object_store");
      expect(types).toContain("corpus_snapshots");
      expect(types).toContain("audit_logs");
      expect(types).toContain("eval_data");
    });

    it("all targets have RPO and RTO defined", () => {
      for (const target of BACKUP_TARGETS) {
        expect(target.rpo_hours).toBeGreaterThan(0);
        expect(target.rto_hours).toBeGreaterThan(0);
        expect(target.name).toBeTruthy();
        expect(target.tool).toBeTruthy();
        expect(target.description).toBeTruthy();
      }
    });

    it("critical targets have shorter RPO/RTO", () => {
      const critical = BACKUP_TARGETS.filter((t) => t.critical);
      const nonCritical = BACKUP_TARGETS.filter((t) => !t.critical);
      for (const c of critical) {
        expect(c.rpo_hours).toBeLessThanOrEqual(24);
        expect(c.rto_hours).toBeLessThanOrEqual(2);
      }
      for (const nc of nonCritical) {
        expect(nc.rpo_hours).toBeGreaterThanOrEqual(critical[0].rpo_hours);
      }
    });

    it("postgres_db is critical with 24h RPO and 1h RTO", () => {
      const db = BACKUP_TARGETS.find((t) => t.type === "postgres_db")!;
      expect(db.critical).toBe(true);
      expect(db.rpo_hours).toBe(24);
      expect(db.rto_hours).toBe(1);
    });

    it("object_store is critical", () => {
      const obj = BACKUP_TARGETS.find((t) => t.type === "object_store")!;
      expect(obj.critical).toBe(true);
    });

    it("audit_logs is critical", () => {
      const audit = BACKUP_TARGETS.find((t) => t.type === "audit_logs")!;
      expect(audit.critical).toBe(true);
    });
  });

  describe("createBackupManifest", () => {
    it("creates a manifest with all targets", async () => {
      const manifest = await createBackupManifest("admin", { simulate: true });
      expect(manifest.id).toBeDefined();
      expect(manifest.created_by).toBe("admin");
      expect(manifest.entries).toHaveLength(5);
      expect(manifest.overall_status).toBe("completed");
    });

    it("each entry has required fields when simulated", async () => {
      const manifest = await createBackupManifest("admin", { simulate: true });
      for (const entry of manifest.entries) {
        expect(entry.status).toBe("completed");
        expect(entry.size_bytes).toBeGreaterThan(0);
        expect(entry.checksum).toBeDefined();
        expect(entry.backup_path).toBeDefined();
        expect(entry.completed_at).toBeDefined();
        expect(entry.rpo_hours).toBeGreaterThan(0);
        expect(entry.rto_hours).toBeGreaterThan(0);
      }
    });

    it("computes total size", async () => {
      const manifest = await createBackupManifest("admin", { simulate: true });
      expect(manifest.total_size_bytes).toBeGreaterThan(0);
    });

    it("creates manifest without simulation (entries pending)", async () => {
      const manifest = await createBackupManifest("admin");
      expect(manifest.overall_status).toBe("in_progress");
      for (const entry of manifest.entries) {
        expect(entry.status).toBe("in_progress");
        expect(entry.size_bytes).toBeUndefined();
      }
    });
  });

  describe("verifyBackupIntegrity", () => {
    it("verifies a simulated manifest successfully", async () => {
      const manifest = await createBackupManifest("admin", { simulate: true });
      const result = await verifyBackupIntegrity(manifest.id);
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it("fails for non-existent manifest", async () => {
      const result = await verifyBackupIntegrity("nonexistent");
      expect(result.valid).toBe(false);
      expect(result.errors[0]).toContain("not found");
    });

    it("fails for incomplete manifest", async () => {
      const manifest = await createBackupManifest("admin"); // no simulate
      const result = await verifyBackupIntegrity(manifest.id);
      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
    });
  });

  describe("runRestoreDrill", () => {
    it("runs a successful restore drill on simulated manifest", async () => {
      const manifest = await createBackupManifest("admin", { simulate: true });
      const drill = await runRestoreDrill(manifest.id, { simulate: true });
      expect(drill.id).toBeDefined();
      expect(drill.targets_tested).toBe(5);
      expect(drill.targets_passed).toBe(5);
      expect(drill.targets_failed).toBe(0);
      expect(drill.overall_passed).toBe(true);
      expect(drill.rpo_met).toBe(true);
      expect(drill.rto_met).toBe(true);
    });

    it("measures restore time per target", async () => {
      const manifest = await createBackupManifest("admin", { simulate: true });
      const drill = await runRestoreDrill(manifest.id, { simulate: true });
      for (const result of drill.results) {
        expect(result.restore_time_ms).toBeGreaterThan(0);
        expect(result.passed).toBe(true);
        expect(result.integrity_check_passed).toBe(true);
      }
    });

    it("throws for non-existent manifest", async () => {
      await expect(runRestoreDrill("nonexistent")).rejects.toThrow(/not found/);
    });

    it("fails drill when backup was not completed", async () => {
      const manifest = await createBackupManifest("admin"); // no simulate
      const drill = await runRestoreDrill(manifest.id, { simulate: true });
      expect(drill.targets_failed).toBeGreaterThan(0);
      expect(drill.overall_passed).toBe(false);
    });

    it("records drill duration", async () => {
      const manifest = await createBackupManifest("admin", { simulate: true });
      const drill = await runRestoreDrill(manifest.id, { simulate: true });
      expect(drill.duration_ms).toBeGreaterThanOrEqual(0);
      expect(drill.started_at).toBeDefined();
      expect(drill.completed_at).toBeDefined();
    });

    it("computes actual RTO from duration", async () => {
      const manifest = await createBackupManifest("admin", { simulate: true });
      const drill = await runRestoreDrill(manifest.id, { simulate: true });
      expect(drill.rto_actual_hours).toBeGreaterThanOrEqual(0);
      expect(drill.rto_met).toBe(true);
    });
  });

  describe("list and get operations", () => {
    it("lists backup manifests", async () => {
      await createBackupManifest("admin", { simulate: true });
      await createBackupManifest("admin2", { simulate: true });
      const manifests = listBackupManifests();
      expect(manifests).toHaveLength(2);
    });

    it("gets a specific manifest", async () => {
      const manifest = await createBackupManifest("admin", { simulate: true });
      const found = getBackupManifest(manifest.id);
      expect(found).toBeDefined();
      expect(found?.id).toBe(manifest.id);
    });

    it("lists restore drills", async () => {
      const manifest = await createBackupManifest("admin", { simulate: true });
      await runRestoreDrill(manifest.id, { simulate: true });
      const drills = listRestoreDrills();
      expect(drills).toHaveLength(1);
    });

    it("gets a specific drill", async () => {
      const manifest = await createBackupManifest("admin", { simulate: true });
      const drill = await runRestoreDrill(manifest.id, { simulate: true });
      const found = getRestoreDrill(drill.id);
      expect(found).toBeDefined();
      expect(found?.id).toBe(drill.id);
    });
  });

  describe("getDRStatus", () => {
    it("returns empty status when no manifests or drills exist", () => {
      const status = getDRStatus();
      expect(status.total_manifests).toBe(0);
      expect(status.total_drills).toBe(0);
      expect(status.last_backup_at).toBeNull();
      expect(status.last_drill_at).toBeNull();
      expect(status.last_drill_passed).toBeNull();
    });

    it("returns status after backup and drill", async () => {
      const manifest = await createBackupManifest("admin", { simulate: true });
      await runRestoreDrill(manifest.id, { simulate: true });
      const status = getDRStatus();
      expect(status.total_manifests).toBe(1);
      expect(status.total_drills).toBe(1);
      expect(status.last_backup_at).not.toBeNull();
      expect(status.last_drill_at).not.toBeNull();
      expect(status.last_drill_passed).toBe(true);
    });

    it("reports critical target count", () => {
      const status = getDRStatus();
      expect(status.critical_targets).toBe(3); // postgres_db, object_store, audit_logs
    });

    it("reports max RPO and RTO across all targets", () => {
      const status = getDRStatus();
      expect(status.rpo_max_hours).toBe(168); // 7 days for corpus/eval
      expect(status.rto_max_hours).toBe(4); // 4 hours for eval_data
    });
  });

  describe("getBackupTargets", () => {
    it("returns all backup targets", () => {
      const targets = getBackupTargets();
      expect(targets).toHaveLength(5);
    });
  });
});
