// @vitest-environment node
import { describe, expect, test, vi } from "vitest";

// A revocation store that is configured but unreachable.
const failingPool = {
  query: vi.fn(async () => {
    throw new Error("connection refused");
  }),
};
vi.mock("@/lib/auth/store", () => ({ getSharedPgPool: () => failingPool }));
vi.mock("./auth/store", () => ({ getSharedPgPool: () => failingPool }));

import { isPortalTokenRevoked, signPortalToken, verifyPortalToken } from "./portal-token";

describe("portal token revocation check fails closed", () => {
  test("verifyPortalToken refuses a validly signed token when the revocation list is unreadable", async () => {
    const token = await signPortalToken("cases/a");
    expect(await verifyPortalToken(token)).toBeNull();
    expect(failingPool.query).toHaveBeenCalled();
  });

  test("isPortalTokenRevoked reports revoked when the revocation list is unreadable", async () => {
    const token = await signPortalToken("cases/b");
    expect(await isPortalTokenRevoked(token)).toBe(true);
  });
});
