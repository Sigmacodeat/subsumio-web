import { describe, expect, test } from "bun:test";
import { fieldShare, str } from "../scripts/ris-inforce-crawl-landesrecht.ts";

describe("str", () => {
  test("trims and treats whitespace-only as absent", () => {
    expect(str(" Tirol ")).toBe("Tirol");
    expect(str("   ")).toBeNull();
    expect(str(null)).toBeNull();
    expect(str(undefined)).toBeNull();
  });

  test("unwraps a RIS #text node", () => {
    expect(str({ "#text": " Wien " })).toBe("Wien");
  });
});

describe("fieldShare", () => {
  const row = (v: string | null) => ({ v }) as unknown as { v: string | null };
  const get = (r: { v: string | null }) => r.v;

  test("the self-check that would have caught a wrong field path", () => {
    // If the assumed LrKons.Abkuerzung path is wrong, every row reads null —
    // this is what ris-inforce-crawl-landesrecht.ts's selfCheck() must catch.
    const allEmpty = [row(null), row(null), row(null)];
    expect(fieldShare(allEmpty as any, get as any)).toBe(0);
  });

  test("a genuinely sparse-but-correct field stays above the threshold", () => {
    const mostlyFilled = [row("BGBl. 1/2020"), row("BGBl. 2/2020"), row(null)];
    expect(fieldShare(mostlyFilled as any, get as any)).toBeCloseTo(2 / 3);
  });

  test("an empty sample counts as fully covered — nothing to contradict", () => {
    expect(fieldShare([], get as any)).toBe(1);
  });
});
