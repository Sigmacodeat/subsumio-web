// UIS-3-13: POST /api/intake answers `{ intake: {...} }`; the wizard must open
// on that record (reading `result.slug` never matched).
import { describe, expect, it } from "vitest";
import { createdIntakeRecord } from "./created-intake";

const intake = {
  slug: "legal/intake/2026-09-25-abc",
  title: "Anfrage",
  content: "",
  frontmatter: { type: "intake_request", status: "new", source: "manual" },
};

describe("createdIntakeRecord", () => {
  it("returns the record from the route's response shape", () => {
    expect(createdIntakeRecord({ intake })).toBe(intake);
  });

  it("returns null for responses without a usable record", () => {
    expect(createdIntakeRecord(null)).toBeNull();
    expect(createdIntakeRecord({ slug: "x" })).toBeNull();
    expect(createdIntakeRecord({ intake: { slug: "", frontmatter: {} } })).toBeNull();
    expect(createdIntakeRecord({ intake: { slug: "x" } })).toBeNull();
  });
});
