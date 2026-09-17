import { describe, expect, it } from "vitest";
import { mayBePdf } from "./QesSignButton";

describe("mayBePdf", () => {
  it("uses the media type when the list entry has one", () => {
    expect(mayBePdf("Vollmacht_Berger", "application/pdf")).toBe(true);
    expect(
      mayBePdf(
        "Klage.pdf",
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
      )
    ).toBe(false);
  });
  it("falls back to the extension, and lets the server decide for names without one", () => {
    expect(mayBePdf("Vollmacht.PDF")).toBe(true);
    expect(mayBePdf("Klage.docx")).toBe(false);
    expect(mayBePdf("Honorarvereinbarung_Berger")).toBe(true);
  });
});
