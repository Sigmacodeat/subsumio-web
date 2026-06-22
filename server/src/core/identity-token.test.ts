import { describe, test, expect } from "bun:test";
import {
  createIdentityToken,
  verifyIdentityToken,
  filterResultsByMatterScope,
  type MatterScope,
} from "./identity-token.ts";

const SECRET = "test-shared-secret-key-for-subsumio";

describe("identity-token", () => {
  describe("createIdentityToken + verifyIdentityToken", () => {
    test("round-trips a valid token", () => {
      const token = createIdentityToken(
        { sourceId: "tenant-1", matterScope: ["legal/cases/123", "legal/cases/456"] },
        SECRET
      );
      const payload = verifyIdentityToken(token, SECRET);
      expect(payload).not.toBeNull();
      expect(payload!.sourceId).toBe("tenant-1");
      expect(payload!.matterScope).toEqual(["legal/cases/123", "legal/cases/456"]);
      expect(payload!.exp).toBeGreaterThan(Math.floor(Date.now() / 1000));
    });

    test('round-trips matterScope "all"', () => {
      const token = createIdentityToken({ sourceId: "tenant-1", matterScope: "all" }, SECRET);
      const payload = verifyIdentityToken(token, SECRET);
      expect(payload).not.toBeNull();
      expect(payload!.matterScope).toBe("all");
    });

    test("rejects tampered payload", () => {
      const token = createIdentityToken(
        { sourceId: "tenant-1", matterScope: ["legal/cases/123"] },
        SECRET
      );
      // Tamper with the payload portion
      const [payloadB64, sigB64] = token.split(".");
      const tamperedPayload = Buffer.from(
        JSON.stringify({
          sourceId: "tenant-1",
          matterScope: "all",
          exp: Math.floor(Date.now() / 1000) + 999,
        })
      ).toString("base64url");
      const tamperedToken = `${tamperedPayload}.${sigB64}`;
      const result = verifyIdentityToken(tamperedToken, SECRET);
      expect(result).toBeNull();
    });

    test("rejects wrong secret", () => {
      const token = createIdentityToken(
        { sourceId: "tenant-1", matterScope: ["legal/cases/123"] },
        SECRET
      );
      const result = verifyIdentityToken(token, "wrong-secret");
      expect(result).toBeNull();
    });

    test("rejects expired token", () => {
      const token = createIdentityToken(
        { sourceId: "tenant-1", matterScope: ["legal/cases/123"] },
        SECRET,
        -600 // expired 10 minutes ago
      );
      const result = verifyIdentityToken(token, SECRET);
      expect(result).toBeNull();
    });

    test("rejects malformed token", () => {
      expect(verifyIdentityToken("not-a-token", SECRET)).toBeNull();
      expect(verifyIdentityToken("", SECRET)).toBeNull();
      expect(verifyIdentityToken("a.b.c", SECRET)).toBeNull();
      expect(verifyIdentityToken("only-payload", SECRET)).toBeNull();
    });

    test("rejects token with missing required fields", () => {
      // Create a token with a valid signature but missing sourceId
      const payload = JSON.stringify({
        matterScope: "all",
        exp: Math.floor(Date.now() / 1000) + 300,
      });
      const payloadB64 = Buffer.from(payload, "utf8").toString("base64url");
      const { createHmac } = require("node:crypto");
      const sig = createHmac("sha256", SECRET).update(payloadB64).digest();
      const sigB64 = sig.toString("base64url");
      const token = `${payloadB64}.${sigB64}`;
      const result = verifyIdentityToken(token, SECRET);
      expect(result).toBeNull();
    });
  });

  describe("filterResultsByMatterScope", () => {
    const results = [
      { slug: "legal/cases/123/doc1", title: "Doc 1" },
      { slug: "legal/cases/123/doc2", title: "Doc 2" },
      { slug: "legal/cases/456/doc1", title: "Other Case Doc" },
      { slug: "legal/cases/789/doc1", title: "Forbidden Doc" },
      { slug: "wiki/notes/private", title: "Wiki Note" },
    ];

    test("filters to allowed prefixes", () => {
      const filtered = filterResultsByMatterScope(results, ["legal/cases/123"]);
      expect(filtered).toHaveLength(2);
      expect(filtered.every((r) => r.slug.startsWith("legal/cases/123"))).toBe(true);
    });

    test("matches matter scope on path boundaries only", () => {
      const filtered = filterResultsByMatterScope(
        [
          { slug: "legal/cases/12/doc", title: "Allowed" },
          { slug: "legal/cases/123/doc", title: "Prefix collision" },
        ],
        ["legal/cases/12"]
      );
      expect(filtered).toEqual([{ slug: "legal/cases/12/doc", title: "Allowed" }]);
    });

    test('allows all when scope is "all"', () => {
      const filtered = filterResultsByMatterScope(results, "all");
      expect(filtered).toHaveLength(5);
    });

    test("no filtering when scope is undefined", () => {
      const filtered = filterResultsByMatterScope(results, undefined);
      expect(filtered).toHaveLength(5);
    });

    test("deny all when scope is empty array", () => {
      const filtered = filterResultsByMatterScope(results, []);
      expect(filtered).toHaveLength(0);
    });

    test("multiple prefixes work", () => {
      const filtered = filterResultsByMatterScope(results, ["legal/cases/123", "legal/cases/456"]);
      expect(filtered).toHaveLength(3);
    });

    test("exact slug match works", () => {
      const filtered = filterResultsByMatterScope(
        [{ slug: "legal/cases/123" }, { slug: "legal/cases/456" }],
        ["legal/cases/123"]
      );
      expect(filtered).toHaveLength(1);
      expect(filtered[0]!.slug).toBe("legal/cases/123");
    });
  });
});
