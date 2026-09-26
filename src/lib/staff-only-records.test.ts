import { describe, expect, it } from "vitest";
import { isStaffOnlyRecord, mayReceiveRecord, withoutStaffOnlyRecords } from "./staff-only-records";

const kyc = { slug: "legal/kyc/k1", type: "kyc_verification", frontmatter: { risk_level: "high" } };
const idCopy = {
  slug: "docs/ausweis",
  type: "document",
  frontmatter: { doc_type: "ausweiskopie" },
};
const brief = { slug: "docs/brief", type: "document", frontmatter: { case_slug: "legal/cases/a" } };

describe("staff-only records (AML file)", () => {
  it("recognises KYC records and ID copies", () => {
    expect(isStaffOnlyRecord(kyc)).toBe(true);
    expect(isStaffOnlyRecord(idCopy)).toBe(true);
    expect(isStaffOnlyRecord({ slug: "x", frontmatter: { tags: ["kyc", "ausweis"] } })).toBe(true);
    expect(isStaffOnlyRecord(brief)).toBe(false);
  });

  it("client accounts never receive them; staff do", () => {
    expect(withoutStaffOnlyRecords("client_viewer", [kyc, idCopy, brief])).toEqual([brief]);
    expect(withoutStaffOnlyRecords("lawyer", [kyc, brief])).toEqual([kyc, brief]);
    expect(mayReceiveRecord("client_viewer", kyc)).toBe(false);
    expect(mayReceiveRecord(undefined, kyc)).toBe(false);
    expect(mayReceiveRecord("assistant", kyc)).toBe(true);
  });
});
