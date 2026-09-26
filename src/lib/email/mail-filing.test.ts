import { describe, expect, it } from "vitest";
import { isFileableAttachment, mergeSuggestedDeadlines, toSuggestedDeadlines } from "./mail-filing";
import type { DetectedDeadline } from "@/lib/ai-deadline-detect";

describe("isFileableAttachment", () => {
  it("files documents", () => {
    expect(
      isFileableAttachment({ contentType: "application/pdf", size: 120_000, filename: "klage.pdf" })
    ).toBe(true);
  });
  it("skips signature logos, tracking pixels, S/MIME signatures and calendar invites", () => {
    expect(
      isFileableAttachment({ contentType: "image/png", size: 4_000, filename: "logo.png" })
    ).toBe(false);
    expect(
      isFileableAttachment({
        contentType: "image/jpeg",
        size: 400_000,
        inline: true,
        filename: "sig.jpg",
      })
    ).toBe(false);
    expect(
      isFileableAttachment({
        contentType: "application/pkcs7-signature",
        size: 3_000,
        filename: "smime.p7s",
      })
    ).toBe(false);
    expect(
      isFileableAttachment({ contentType: "text/calendar", size: 2_000, filename: "invite.ics" })
    ).toBe(false);
  });
  it("keeps real photos and rejects oversize or empty files", () => {
    expect(
      isFileableAttachment({ contentType: "image/jpeg", size: 900_000, filename: "schaden.jpg" })
    ).toBe(true);
    expect(
      isFileableAttachment({ contentType: "application/pdf", size: 0, filename: "leer.pdf" })
    ).toBe(false);
    expect(
      isFileableAttachment({
        contentType: "application/pdf",
        size: 30 * 1024 * 1024,
        filename: "gross.pdf",
      })
    ).toBe(false);
  });
});

const base: DetectedDeadline = {
  type: "klagebeantwortung",
  description: "Klagebeantwortung",
  confidence: "high",
  sourceSnippet: "binnen vier Wochen ab Zustellung",
  matchedRule: "zpo",
};

describe("toSuggestedDeadlines", () => {
  it("suggests only deadlines with a concrete date and never confirms them", () => {
    const out = toSuggestedDeadlines(
      [
        { ...base, date: "2026-10-14" },
        { ...base, description: "ohne Datum", daysFromNow: 28 },
      ],
      "E-Mail vom 16.09.2026"
    );
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({
      title: "Klagebeantwortung",
      due_date: "2026-10-14",
      urgency: "high",
      source: "E-Mail vom 16.09.2026",
      confirmed: false,
    });
  });
});

describe("mergeSuggestedDeadlines", () => {
  it("does not suggest the same deadline twice", () => {
    const s = toSuggestedDeadlines([{ ...base, date: "2026-10-14" }], "a");
    const merged = mergeSuggestedDeadlines(
      s,
      toSuggestedDeadlines([{ ...base, date: "2026-10-14" }], "b")
    );
    expect(merged).toHaveLength(1);
    expect(mergeSuggestedDeadlines(undefined, s)).toHaveLength(1);
  });
});

describe("toSuggestedDeadlines — Frist-Engine im Mailweg (W1-1)", () => {
  it("a Rechtsmittelfrist from mail text is computed from the Zustelldatum and keeps its basis", async () => {
    const { recognizeDeadlines } = await import("@/lib/ai-deadline-detect");
    const text =
      "Anbei das Urteil, zugestellt am 03.04.2026. Gegen dieses Urteil kann binnen vier Wochen Berufung erhoben werden.";
    const [s] = toSuggestedDeadlines(recognizeDeadlines(text), "Mail: Urteil");
    expect(s).toMatchObject({
      due_date: "2026-05-04",
      zustellungsdatum: "2026-04-03",
      frist_art: "berufung",
      rechtsgrundlage: "§ 464 Abs 1 ZPO",
      notfrist: true,
      confirmed: false,
    });
  });
});
