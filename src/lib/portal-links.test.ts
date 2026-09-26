// @vitest-environment node
import { describe, expect, it } from "vitest";
import {
  appendPortalLink,
  markPortalLinkRevoked,
  MAX_PORTAL_LINKS,
  portalLinkStatus,
  portalLinksLockKey,
  readPortalLinks,
} from "./portal-links";

describe("portalLinksLockKey", () => {
  it("scopes the registry lock by firm, so equal matter slugs don't contend", () => {
    const a = portalLinksLockKey({ "x-subsumio-source": "brain-a" }, "legal/case-1");
    const b = portalLinksLockKey({ "x-subsumio-source": "brain-b" }, "legal/case-1");
    expect(a).not.toBe(b);
    expect(a).toContain("brain-a");
  });
});
import { isPortalTokenSuperseded, portalTokenHash, signPortalToken } from "./portal-token";

const fm = (links: unknown) => ({ portal_links: links }) as Record<string, unknown>;

const entry = (hash: string, overrides: Record<string, unknown> = {}) => ({
  token_hash: hash,
  created_at: "2026-01-01T00:00:00.000Z",
  expires_at: "2030-01-01T00:00:00.000Z",
  ...overrides,
});

describe("portal-links registry", () => {
  it("reads only well-formed entries", () => {
    expect(readPortalLinks(undefined)).toEqual([]);
    expect(readPortalLinks({ portal_links: "nope" })).toEqual([]);
    const links = [entry("a".repeat(64)), { broken: true }, entry("b".repeat(64))];
    expect(readPortalLinks(fm(links))).toHaveLength(2);
  });

  it("stores the token hash, never the raw token", async () => {
    const token = await signPortalToken("cases/a", 3600, "brain-x");
    const links = appendPortalLink(undefined, {
      token,
      created_at: "2026-01-01T00:00:00.000Z",
      expires_at: "2030-01-01T00:00:00.000Z",
    });
    expect(links).toHaveLength(1);
    expect(links[0]!.token_hash).toBe(portalTokenHash(token));
    expect(JSON.stringify(links)).not.toContain(token);
  });

  it("caps the registry, dropping revoked/expired entries first", () => {
    const links = Array.from({ length: MAX_PORTAL_LINKS }, (_, i) =>
      entry(String(i).padStart(64, "0"), {
        revoked_at: i < 10 ? "2026-01-02T00:00:00.000Z" : undefined,
      })
    );
    const next = appendPortalLink(fm(links), {
      token: "x.y",
      created_at: "2026-06-01T00:00:00.000Z",
      expires_at: "2030-01-01T00:00:00.000Z",
    });
    expect(next).toHaveLength(MAX_PORTAL_LINKS);
    // All 41 live entries stay; only the 9 newest dead ones fill the cap.
    expect(next.filter((l) => l.revoked_at)).toHaveLength(9);
    expect(next.some((l) => l.token_hash === portalTokenHash("x.y"))).toBe(true);
  });

  it("computes status: active → expired → revoked", () => {
    const active = entry("a".repeat(64));
    expect(portalLinkStatus(active)).toBe("active");
    expect(portalLinkStatus({ ...active, expires_at: "2020-01-01T00:00:00.000Z" })).toBe("expired");
    expect(portalLinkStatus({ ...active, revoked_at: "2026-01-02T00:00:00.000Z" })).toBe("revoked");
    // Revoked wins over a still-valid expiry.
    expect(
      portalLinkStatus({ ...active, expires_at: "2030-01-01T00:00:00.000Z", revoked_at: "x" })
    ).toBe("revoked");
  });

  it("marks a single entry revoked without touching others", () => {
    const links = [entry("a".repeat(64)), entry("b".repeat(64))];
    const next = markPortalLinkRevoked(fm(links), "b".repeat(64), "2026-06-01T00:00:00.000Z");
    expect(next).toHaveLength(2);
    expect(next![0]!.revoked_at).toBeUndefined();
    expect(next![1]!.revoked_at).toBe("2026-06-01T00:00:00.000Z");
    expect(markPortalLinkRevoked(fm(links), "unknown")).toBeNull();
  });
});

describe("isPortalTokenSuperseded — link reset cutoff", () => {
  const resetAt = "2026-06-01T00:00:00.000Z";

  it("kills tokens issued before the reset, keeps newer ones", () => {
    expect(
      isPortalTokenSuperseded({ case_slug: "c", exp: 4_000_000_000, iat: 1_700_000_000 }, resetAt)
    ).toBe(true);
    expect(
      isPortalTokenSuperseded(
        { case_slug: "c", exp: 4_000_000_000, iat: Date.parse(resetAt) / 1000 + 60 },
        resetAt
      )
    ).toBe(false);
  });

  it("treats pre-iat tokens via their expiry and kills them on reset", () => {
    // Legacy token without iat: issued-at ≈ exp − 30d default TTL.
    const legacy = { case_slug: "c", exp: 1_800_000_000 }; // ~Jan 2027 expiry → issued ~Dec 2026
    expect(isPortalTokenSuperseded(legacy, "2099-01-01T00:00:00.000Z")).toBe(true);
    expect(isPortalTokenSuperseded(legacy, undefined)).toBe(false);
    expect(isPortalTokenSuperseded(legacy, "garbage")).toBe(false);
  });
});
