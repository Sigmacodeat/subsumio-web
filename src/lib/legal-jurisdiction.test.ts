import { describe, expect, test } from "vitest";
import { trustedLegalJurisdiction } from "./legal-jurisdiction";

describe("trustedLegalJurisdiction", () => {
  test("prefers the server-resolved case jurisdiction", () => {
    expect(
      trustedLegalJurisdiction(
        {
          "x-subsumio-jurisdiction": "AT",
          "x-subsumio-case-jurisdiction": "de",
        },
        "ch"
      )
    ).toBe("de");
  });

  test("uses the verified user jurisdiction when there is no case", () => {
    expect(trustedLegalJurisdiction({ "x-subsumio-jurisdiction": "CH" }, "de")).toBe("ch");
  });

  test("does not trust a body-only jurisdiction", () => {
    expect(trustedLegalJurisdiction({}, "de")).toBeUndefined();
  });

  test("ignores invalid server headers", () => {
    expect(
      trustedLegalJurisdiction({
        "x-subsumio-case-jurisdiction": "xx",
        "x-subsumio-jurisdiction": "also-invalid",
      })
    ).toBeUndefined();
  });
});
