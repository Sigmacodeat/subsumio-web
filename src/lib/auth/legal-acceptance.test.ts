import { describe, expect, it } from "vitest";
import {
  LEGAL_VERSIONS,
  buildLegalAcceptance,
  formatLegalVersion,
  legalAcceptancePatch,
  legalAcceptanceRequired,
} from "./legal-acceptance";

const cur = {
  termsVersion: LEGAL_VERSIONS.terms,
  privacyVersion: LEGAL_VERSIONS.privacy,
  dpaVersion: LEGAL_VERSIONS.dpa,
} as never;

describe("legalAcceptanceRequired", () => {
  it("accounts without a record must confirm (existing accounts)", () => {
    expect(legalAcceptanceRequired({ role: "admin" })).toBe(true);
    expect(legalAcceptanceRequired({ role: "lawyer", legalAcceptance: null })).toBe(true);
  });

  it("portal viewers are never asked", () => {
    expect(legalAcceptanceRequired({ role: "client_viewer" })).toBe(false);
  });

  it("a changed text version asks again", () => {
    const old = { ...(cur as object), termsVersion: "2000-01-01" } as never;
    expect(legalAcceptanceRequired({ role: "admin", legalAcceptance: cur })).toBe(false);
    expect(legalAcceptanceRequired({ role: "admin", legalAcceptance: old })).toBe(true);
  });

  it("an admin without AVV must confirm; a member does not need it", () => {
    const noDpa = { ...(cur as object), dpaVersion: null } as never;
    expect(legalAcceptanceRequired({ role: "admin", legalAcceptance: noDpa })).toBe(true);
    expect(legalAcceptanceRequired({ role: "lawyer", legalAcceptance: noDpa })).toBe(false);
  });
});

describe("buildLegalAcceptance / patch", () => {
  it("records versions, time and firm context; history is append-only", () => {
    const now = new Date("2026-09-26T10:00:00Z");
    const rec = buildLegalAcceptance(
      { role: "admin", orgId: null, brainId: "brain_a" },
      "signup",
      now
    );
    expect(rec).toEqual({
      termsVersion: LEGAL_VERSIONS.terms,
      privacyVersion: LEGAL_VERSIONS.privacy,
      dpaVersion: LEGAL_VERSIONS.dpa,
      acceptedAt: "2026-09-26T10:00:00.000Z",
      method: "signup",
      onBehalfOfFirm: true,
      orgId: null,
      brainId: "brain_a",
      role: "admin",
    });
    const patch = legalAcceptancePatch({ legalAcceptanceHistory: [rec] }, rec);
    expect(patch.legalAcceptanceHistory).toHaveLength(2);
    expect(patch.legalAcceptance).toBe(rec);
  });

  it("formats the version for the legal pages", () => {
    expect(formatLegalVersion("2026-09-26")).toBe("26.09.2026");
  });
});
