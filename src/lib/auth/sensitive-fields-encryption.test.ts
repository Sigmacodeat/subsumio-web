// @vitest-environment node
/**
 * Locks in encryption-at-rest for DocuSign tokens (and the other entries in
 * SENSITIVE_USER_FIELDS), using the REAL encryption module — not mocked, as
 * store.test.ts does. store.ts already routes both adapters' read/write paths
 * (FileUserStore.load/persist, PostgresUserStore get/create/update) through
 * encryptUser/decryptUser, which apply to every field in this list. This test
 * exists so a future edit can't silently drop docusignAccessToken/
 * docusignRefreshToken from the list without a red test.
 */
import { describe, test, expect, beforeEach, afterEach, vi } from "vitest";
import { SENSITIVE_USER_FIELDS } from "./store";
import { encryptFields, decryptFields } from "@/lib/encryption";

describe("SENSITIVE_USER_FIELDS — real encryption round-trip", () => {
  test("includes the DocuSign OAuth tokens", () => {
    expect(SENSITIVE_USER_FIELDS).toContain("docusignAccessToken");
    expect(SENSITIVE_USER_FIELDS).toContain("docusignRefreshToken");
  });

  describe("with SUBSUMIO_ENCRYPTION_KEY set", () => {
    const ORIGINAL_ENV = process.env.SUBSUMIO_ENCRYPTION_KEY;

    beforeEach(() => {
      process.env.SUBSUMIO_ENCRYPTION_KEY = "test-encryption-key-32-bytes-ok!";
      vi.resetModules();
    });

    afterEach(() => {
      if (ORIGINAL_ENV === undefined) delete process.env.SUBSUMIO_ENCRYPTION_KEY;
      else process.env.SUBSUMIO_ENCRYPTION_KEY = ORIGINAL_ENV;
      vi.resetModules();
    });

    test("docusignAccessToken/docusignRefreshToken are unreadable at rest and round-trip correctly", async () => {
      // Re-import with the env var active so the module picks up the key.
      const { encryptFields: encryptFresh, decryptFields: decryptFresh } =
        await import("@/lib/encryption");

      const plain = {
        id: "u1",
        docusignAccessToken: "secret-access-token-value",
        docusignRefreshToken: "secret-refresh-token-value",
      };

      const encrypted = await encryptFresh({ ...plain }, [...SENSITIVE_USER_FIELDS]);

      expect(encrypted.docusignAccessToken).not.toBe(plain.docusignAccessToken);
      expect(encrypted.docusignRefreshToken).not.toBe(plain.docusignRefreshToken);
      expect(String(encrypted.docusignAccessToken)).toMatch(/^sbenc:/);
      expect(String(encrypted.docusignRefreshToken)).toMatch(/^sbenc:/);

      const decrypted = await decryptFresh(encrypted, [...SENSITIVE_USER_FIELDS]);
      expect(decrypted.docusignAccessToken).toBe(plain.docusignAccessToken);
      expect(decrypted.docusignRefreshToken).toBe(plain.docusignRefreshToken);
    });
  });

  test("encryptFields/decryptFields are exercised generically (sanity, no env mutation)", async () => {
    const encrypted = await encryptFields({ docusignAccessToken: "x" }, ["docusignAccessToken"]);
    const decrypted = await decryptFields(encrypted, ["docusignAccessToken"]);
    expect(decrypted.docusignAccessToken).toBe("x");
  });
});
