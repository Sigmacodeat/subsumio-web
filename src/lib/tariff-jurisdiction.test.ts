import { describe, expect, it } from "vitest";
import { tariffJurisdictionOf } from "./tariff-jurisdiction";

describe("tariffJurisdictionOf (W4-09 Nebenbefund)", () => {
  it('a German firm as stored ("DE") gets the German tariffs', () => {
    expect(tariffJurisdictionOf("DE")).toBe("de");
    expect(tariffJurisdictionOf("de")).toBe("de");
  });
  it("Austria, Switzerland and unknown stay on RATG/AHK", () => {
    expect(tariffJurisdictionOf("AT")).toBe("at");
    expect(tariffJurisdictionOf("CH")).toBe("at");
    expect(tariffJurisdictionOf(undefined)).toBe("at");
  });
});
