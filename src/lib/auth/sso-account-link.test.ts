import { describe, expect, it } from "vitest";
import { decideSsoAccountLink } from "./sso-account-link";

const base = {
  workosUserId: "wu_1",
  emailVerified: true,
  authOrganizationId: null as string | null,
};

describe("decideSsoAccountLink", () => {
  it("never links an existing password account by e-mail when the firm has no SSO tenant", () => {
    expect(decideSsoAccountLink({ ...base, user: { workosUserId: null }, org: null })).toEqual({
      ok: false,
      reason: "not_linked",
    });
    expect(
      decideSsoAccountLink({
        ...base,
        user: { workosUserId: null },
        org: { workosOrganizationId: null },
      })
    ).toEqual({ ok: false, reason: "not_linked" });
  });

  it("refuses a different WorkOS identity than the one the account is bound to", () => {
    expect(
      decideSsoAccountLink({
        ...base,
        workosUserId: "wu_other",
        user: { workosUserId: "wu_1" },
        org: null,
      })
    ).toEqual({ ok: false, reason: "not_linked" });
  });

  it("allows the bound WorkOS identity without a tenant", () => {
    expect(decideSsoAccountLink({ ...base, user: { workosUserId: "wu_1" }, org: null })).toEqual({
      ok: true,
      bind: false,
    });
  });

  it("requires the firm's WorkOS organization when one is configured", () => {
    const org = { workosOrganizationId: "org_firm" };
    // Social login / other tenant: no or foreign organization.
    expect(decideSsoAccountLink({ ...base, user: { workosUserId: "wu_1" }, org })).toEqual({
      ok: false,
      reason: "org_mismatch",
    });
    expect(
      decideSsoAccountLink({
        ...base,
        authOrganizationId: "org_attacker",
        user: { workosUserId: null },
        org,
      })
    ).toEqual({ ok: false, reason: "org_mismatch" });
  });

  it("binds a verified identity from the firm's own organization", () => {
    expect(
      decideSsoAccountLink({
        ...base,
        authOrganizationId: "org_firm",
        user: { workosUserId: null },
        org: { workosOrganizationId: "org_firm" },
      })
    ).toEqual({ ok: true, bind: true });
  });

  it("refuses to bind an unverified e-mail even from the firm's organization", () => {
    expect(
      decideSsoAccountLink({
        ...base,
        emailVerified: false,
        authOrganizationId: "org_firm",
        user: { workosUserId: null },
        org: { workosOrganizationId: "org_firm" },
      })
    ).toEqual({ ok: false, reason: "email_unverified" });
  });
});
