// @vitest-environment node
import { describe, expect, it } from "vitest";
import {
  appendPortalLink,
  markPortalLinkRevoked,
  MAX_PORTAL_LINKS,
  portalLinkStatus,
  readPortalLinks,
} from "./portal-links";
import { portalTokenHash, signPortalToken } from "./portal-token";

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
