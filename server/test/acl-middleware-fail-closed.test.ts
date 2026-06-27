/**
 * ACL middleware fail-closed test.
 *
 * If the ACL lookup throws (e.g. database unreachable), the middleware must
 * refuse the request instead of silently widening access to "all".
 */
import { describe, test, expect } from "bun:test";
import type { Request, Response } from "express";
import { aclGroupsMiddleware } from "../src/commands/web-api.ts";
import { createIdentityToken } from "../src/core/identity-token.ts";
import type { BrainEngine } from "../src/core/engine.ts";
import { withEnv } from "./helpers/with-env.ts";

const SECRET = "test-shared-secret-key-for-subsumio";

function makeMockEngine(throws: boolean): BrainEngine {
  return {
    executeRaw: async () => {
      if (throws) throw new Error("database unreachable");
      return [];
    },
  } as unknown as BrainEngine;
}

function makeReq(token?: string): Partial<Request> & { headers: Record<string, string> } {
  return {
    headers: token ? { "x-subsumio-identity-token": token } : {},
  } as unknown as Partial<Request> & { headers: Record<string, string> };
}

function makeRes(): Partial<Response> & {
  statusCode?: number;
  body?: unknown;
  headers: Record<string, string>;
} {
  const res: Partial<Response> & {
    statusCode?: number;
    body?: unknown;
    headers: Record<string, string>;
  } = {
    headers: {},
  };
  res.status = (code: number) => {
    res.statusCode = code;
    return res as Response;
  };
  res.json = (body: unknown) => {
    res.body = body;
    return res as Response;
  };
  return res;
}

describe("aclGroupsMiddleware", () => {
  test('no identity token → aclGroups = "all" (legacy callers)', async () => {
    await withEnv({ SUBSUMIO_WEB_API_KEY: SECRET }, async () => {
      const middleware = aclGroupsMiddleware(makeMockEngine(false));
      const req = makeReq();
      const res = makeRes();
      let nextCalled = false;

      await middleware(req as Request, res as Response, () => {
        nextCalled = true;
      });

      expect(nextCalled).toBe(true);
      expect(req.aclGroups).toBe("all");
    });
  });

  test('valid non-admin token with no groups → aclGroups = "all" (open-by-default)', async () => {
    await withEnv({ SUBSUMIO_WEB_API_KEY: SECRET }, async () => {
      const token = createIdentityToken(
        { sourceId: "tenant-1", matterScope: "all", userId: "user-1" },
        SECRET
      );
      const middleware = aclGroupsMiddleware(makeMockEngine(false));
      const req = makeReq(token);
      const res = makeRes();
      let nextCalled = false;

      await middleware(req as Request, res as Response, () => {
        nextCalled = true;
      });

      expect(nextCalled).toBe(true);
      expect(req.aclGroups).toBe("all");
    });
  });

  test('admin token → aclGroups = "all"', async () => {
    await withEnv({ SUBSUMIO_WEB_API_KEY: SECRET }, async () => {
      const token = createIdentityToken(
        { sourceId: "tenant-1", matterScope: "all", userId: "admin-1", role: "admin" },
        SECRET
      );
      const middleware = aclGroupsMiddleware(makeMockEngine(false));
      const req = makeReq(token);
      const res = makeRes();
      let nextCalled = false;

      await middleware(req as Request, res as Response, () => {
        nextCalled = true;
      });

      expect(nextCalled).toBe(true);
      expect(req.aclGroups).toBe("all");
    });
  });

  test("ACL lookup throws → fail-closed with 500, no next()", async () => {
    await withEnv({ SUBSUMIO_WEB_API_KEY: SECRET }, async () => {
      const token = createIdentityToken(
        { sourceId: "tenant-1", matterScope: "all", userId: "user-1" },
        SECRET
      );
      const middleware = aclGroupsMiddleware(makeMockEngine(true));
      const req = makeReq(token);
      const res = makeRes();
      let nextCalled = false;

      await middleware(req as Request, res as Response, () => {
        nextCalled = true;
      });

      expect(nextCalled).toBe(false);
      expect(res.statusCode).toBe(500);
      expect(res.body).toEqual({
        error: "acl_resolution_failed",
        message: "Document access control could not be resolved.",
      });
      expect(req.aclGroups).toBeUndefined();
    });
  });
});
