import { describe, expect, test } from "bun:test";
import {
  dayBefore,
  findSuperseded,
  paragraphKey,
  type Version,
} from "../scripts/mark-superseded-versions.ts";
import {
  landOfDocId,
  landQualifiedStatuteId,
  risReadableUrl,
} from "../scripts/normalize/normalize-corpus.ts";

const v = (over: Partial<Version>): Version => ({
  id: 1,
  slug: "s",
  title: null,
  docId: "LTI12000010",
  statuteId: "10000001",
  paragraphRef: "§ 11",
  inForceFrom: "1900-08-15",
  inForceTo: null,
  ...over,
});

describe("state law identity", () => {
  test("the state comes from the RIS document number", () => {
    expect(landOfDocId("LTI40038778")).toBe("tir");
    expect(landOfDocId("LBG12000001")).toBe("bgld");
    expect(landOfDocId("NOR40120212")).toBeNull();
  });

  test("the same law number in two states gives two statute ids", () => {
    expect(landQualifiedStatuteId("LTI40038778", "10000001")).toBe("tir-10000001");
    expect(landQualifiedStatuteId("LBG12000001", "10000001")).toBe("bgld-10000001");
    expect(landQualifiedStatuteId("NOR40120212", "20006842")).toBe("20006842");
    expect(landQualifiedStatuteId("LTI40038778", "tir-10000001")).toBe("tir-10000001");
  });

  test("RIS links open the readable page", () => {
    expect(
      risReadableUrl("https://www.ris.bka.gv.at/Dokumente/Landesnormen/LTI40038778/LTI40038778.xml")
    ).toBe("https://www.ris.bka.gv.at/Dokumente/Landesnormen/LTI40038778/LTI40038778.html");
    expect(risReadableUrl("https://example.org/a.xml")).toBe("https://example.org/a.xml");
  });
});

describe("mark-superseded-versions", () => {
  test("an older version ends the day before the next one takes effect", () => {
    const old = v({ id: 1, docId: "LTI12000010" });
    const cur = v({
      id: 2,
      docId: "LTI40038786",
      statuteId: "tir-10000001",
      inForceFrom: "2016-08-23",
    });
    const { superseded, withoutSuccessor } = findSuperseded([old, cur], new Set(["LTI40038786"]));
    expect(superseded).toEqual([
      { version: old, inForceTo: "2016-08-22", supersededBy: "LTI40038786" },
    ]);
    expect(withoutSuccessor).toEqual([]);
  });

  test("the same paragraph of another state is not a later version", () => {
    const tirol = v({ id: 1, docId: "LTI12000010" });
    const burgenland = v({ id: 2, docId: "LBG40000001", inForceFrom: "2020-01-01" });
    const { superseded, withoutSuccessor } = findSuperseded(
      [tirol, burgenland],
      new Set(["LBG40000001"])
    );
    expect(superseded).toEqual([]);
    expect(withoutSuccessor).toEqual([tirol]);
  });

  test("versions in force or already dated are left alone", () => {
    const cur = v({ id: 1, docId: "LTI40038786", inForceFrom: "2016-08-23" });
    const dated = v({ id: 2, docId: "LTI1", inForceTo: "2016-08-22" });
    expect(findSuperseded([cur, dated], new Set(["LTI40038786"])).superseded).toEqual([]);
  });

  test("paragraph formatting does not split a paragraph", () => {
    expect(paragraphKey(v({ paragraphRef: "§ 11." }))).toBe(
      paragraphKey(v({ paragraphRef: "§11" }))
    );
  });

  test("day before crosses month and leap day", () => {
    expect(dayBefore("2024-03-01")).toBe("2024-02-29");
    expect(dayBefore("2016-01-01")).toBe("2015-12-31");
  });
});
