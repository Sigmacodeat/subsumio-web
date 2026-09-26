import { describe, expect, it } from "vitest";
import { backupNotice } from "./backup-completeness";

describe("backupNotice (UIS-3-9)", () => {
  it("calls a backup complete only when the server confirmed it", () => {
    expect(backupNotice({ complete: true, total_pages: 350 })).toMatchObject({
      kind: "complete",
    });
  });

  it("shows an incomplete backup with every reason the server gave", () => {
    const notice = backupNotice({
      complete: false,
      total_pages: 100,
      warning: "Engine nicht erreichbar",
      truncated_warning: "abgeschnitten",
      count_warning: "Sicherung enthält 100 von 350 Einträgen",
      pages_without_content: 2,
    });
    expect(notice.kind).toBe("incomplete");
    if (notice.kind !== "incomplete") return;
    expect(notice.message).toContain("unvollständig");
    expect(notice.reasons).toEqual([
      "Engine nicht erreichbar",
      "abgeschnitten",
      "Sicherung enthält 100 von 350 Einträgen",
      expect.stringContaining("2 Einträge ohne Text"),
    ]);
  });

  it("treats missing metadata as incomplete", () => {
    expect(backupNotice(undefined).kind).toBe("incomplete");
    expect(backupNotice({ total_pages: 5 }).kind).toBe("incomplete");
  });
});
