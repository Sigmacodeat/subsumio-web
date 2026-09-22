import { describe, expect, test } from "vitest";
import {
  isDocumentLock,
  isLockedFor,
  nextVersionNumber,
  readLock,
  versionSlug,
} from "@/lib/document-versions";

describe("readLock", () => {
  test("liest eine gültige Sperre", () => {
    const lock = readLock({
      checked_out_by: { userId: "u1", userEmail: "a@b.at", at: "2026-09-22T10:00:00Z" },
    });
    expect(lock).toEqual({ userId: "u1", userEmail: "a@b.at", at: "2026-09-22T10:00:00Z" });
  });

  test.each([
    undefined,
    {},
    { checked_out_by: null },
    { checked_out_by: "user-id-string" },
    { checked_out_by: { userId: 42 } },
    { checked_out_by: { userId: "u1" } },
  ])("ungültige/fehlende Sperre → null: %j", (fm: Record<string, unknown> | undefined) => {
    expect(readLock(fm as Record<string, unknown> | undefined)).toBeNull();
  });

  test("fehlende E-Mail wird zu leerem String", () => {
    const lock = readLock({ checked_out_by: { userId: "u1", at: "2026-01-01" } });
    expect(lock?.userEmail).toBe("");
  });
});

describe("isLockedFor", () => {
  const fm = {
    checked_out_by: { userId: "owner", userEmail: "o@k.at", at: "2026-09-22T10:00:00Z" },
  };

  test("Fremdnutzer sieht die Sperre", () => {
    expect(isLockedFor(fm, "other")?.userId).toBe("owner");
  });

  test("Inhaber sieht keine Fremdsperre", () => {
    expect(isLockedFor(fm, "owner")).toBeNull();
  });

  test("entsperrtes Dokument sperrt niemanden", () => {
    expect(isLockedFor({}, "anyone")).toBeNull();
  });
});

describe("isDocumentLock", () => {
  test("Type-Guard akzeptiert nur vollständige Locks", () => {
    expect(isDocumentLock({ userId: "u", at: "t", userEmail: "e" })).toBe(true);
    expect(isDocumentLock({ userId: "u" })).toBe(false);
    expect(isDocumentLock(null)).toBe(false);
    expect(isDocumentLock("x")).toBe(false);
  });
});

describe("versionSlug / nextVersionNumber", () => {
  test("Slug enthält Dokument-Pfad und Versionsnummer", () => {
    expect(versionSlug("legal/akte-1/vertrag", 3)).toBe(
      "legal/doc-versions/legal/akte-1/vertrag/v3"
    );
  });

  test("nächste Version ist max + 1", () => {
    expect(nextVersionNumber([])).toBe(1);
    expect(nextVersionNumber([1, 2, 3])).toBe(4);
    expect(nextVersionNumber([7, 2])).toBe(8);
  });
});
