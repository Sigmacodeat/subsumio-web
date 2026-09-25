// @vitest-environment node
import { mkdtempSync, readFileSync, rmSync } from "fs";
import { tmpdir } from "os";
import path from "path";
import { afterAll, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/logger", () => ({
  logger: () => ({ warn: vi.fn(), error: vi.fn(), info: vi.fn() }),
}));

const dir = mkdtempSync(path.join(tmpdir(), "backup-test-"));
process.env.SUBSUMIO_DATA_DIR = dir;

afterAll(() => rmSync(dir, { recursive: true, force: true }));

describe("createBackup (ENG-7)", () => {
  it("writes the completeness facts into the file and the listed metadata", async () => {
    const { createBackup, listBackups } = await import("./backup");
    const meta = await createBackup(
      [{ slug: "a", type: "case", content: "Text" }],
      "ops@test",
      { brainId: "brain-a", orgId: "org-a", orgName: "Kanzlei A" },
      {
        complete: false,
        truncated: true,
        expected_pages: 2,
        pages_without_content: 0,
        truncated_warning: "abgeschnitten",
      }
    );
    expect(meta).toMatchObject({
      complete: false,
      truncated: true,
      expectedPages: 2,
      brainId: "brain-a",
      orgName: "Kanzlei A",
    });

    const file = JSON.parse(readFileSync(path.join(dir, "backups", meta.filename), "utf-8"));
    expect(file.export_metadata).toMatchObject({
      type: "full_backup",
      total_pages: 1,
      complete: false,
      truncated: true,
      truncated_warning: "abgeschnitten",
      brain_id: "brain-a",
      org_id: "org-a",
    });
    expect(file.pages[0].content).toBe("Text");

    const listed = await listBackups();
    expect(listed[0]).toMatchObject({ id: meta.id, complete: false });
  });

  it("never resolves ids outside the backup folder", async () => {
    const { getBackupFile, deleteBackup, isValidBackupId } = await import("./backup");
    expect(isValidBackupId("backup_2026-09-26T00-00-00-000Z")).toBe(true);
    expect(isValidBackupId("../secrets")).toBe(false);
    expect(await getBackupFile("../../etc/x")).toBeNull();
    expect(await deleteBackup("../x")).toBe(false);
  });
});
