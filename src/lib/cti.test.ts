import { describe, expect, test } from "vitest";

import { findCallerMatches, normalisePhone, parseCtiPayload, phoneMatches } from "./cti";

describe("normalisePhone / phoneMatches", () => {
  test("normalisiert österreichische Schreibweisen", () => {
    expect(normalisePhone("+43 676 123 45 67")).toBe("436761234567");
    expect(normalisePhone("0043 (676) 123-45-67")).toBe("436761234567");
    expect(normalisePhone("0676/1234567")).toBe("06761234567");
  });

  test("matcht über die letzten 9 Ziffern", () => {
    expect(phoneMatches("+43 676 1234567", "0676 1234567")).toBe(true);
    expect(phoneMatches("+43 1 234567", "+43 5 999999")).toBe(false);
    expect(phoneMatches("", "+43 1")).toBe(false);
  });
});

describe("parseCtiPayload", () => {
  test("neutrales Format", () => {
    const e = parseCtiPayload({
      event: "ringing",
      call_id: "c1",
      caller: "+43 1 234",
      direction: "inbound",
    });
    expect(e?.event).toBe("ringing");
    expect(e?.callId).toBe("c1");
  });

  test("Placetel-Variante (IncomingCall, from/to)", () => {
    const e = parseCtiPayload({ event: "IncomingCall", call_id: "p1", from: "0123", to: "5" });
    expect(e?.event).toBe("ringing");
    expect(e?.caller).toBe("0123");
    expect(e?.direction).toBe("inbound");
  });

  test("sipgate-Variante (newCall/hangup, callId)", () => {
    expect(parseCtiPayload({ event: "newCall", callId: "s1", from: "01" })?.event).toBe("ringing");
    expect(
      parseCtiPayload({ event: "hangup", callId: "s1", from: "01", duration: 66 })?.event
    ).toBe("ended");
  });

  test("3CX-Variante (event_type, caller_number)", () => {
    const e = parseCtiPayload({ event_type: "missed", call_id: "x", caller_number: "0664" });
    expect(e?.event).toBe("missed");
  });

  test("unbekanntes Event oder fehlende Nummer → null", () => {
    expect(parseCtiPayload({ event: "bogus", caller: "1" })).toBeNull();
    expect(parseCtiPayload({ event: "ringing" })).toBeNull();
  });
});

describe("findCallerMatches", () => {
  const contacts = [
    {
      slug: "c1",
      title: "Muster GmbH",
      frontmatter: { name: "Muster GmbH", phone: "+43 1 505 00 00", role: "client" },
    },
    { slug: "c2", title: "OG", frontmatter: { name: "Gegner", phone: "+43 660 111" } },
  ];
  const cases = [
    { slug: "cases/26-1", title: "Muster ./. OG", frontmatter: { client_slug: "c1" } },
    { slug: "cases/26-2", title: "Andere", frontmatter: {} },
  ];

  test("Kontakt + verlinkte Akte werden gefunden", () => {
    const m = findCallerMatches("01 505 0000", contacts, cases);
    expect(m).toHaveLength(1);
    expect(m[0].contactName).toBe("Muster GmbH");
    expect(m[0].caseSlugs[0]?.slug).toBe("cases/26-1");
  });

  test("keine Nummer → kein Match", () => {
    expect(findCallerMatches("+43 999 999", contacts, cases)).toHaveLength(0);
  });
});
