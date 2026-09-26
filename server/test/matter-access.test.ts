/**
 * Matter access: walls, restricted matters, grants with expiry, client
 * viewers — and the matter-scope predicate that enforces them.
 */
import { describe, test, expect } from "bun:test";
import type { Request, Response } from "express";
import {
  callerMatterAccess,
  matterAccessLevel,
  matterScopeAllows,
  scopeForCaller,
  withDeniedMatters,
} from "../src/core/matter-access.ts";
import { aclGroupsMiddleware, invalidateMatterAccess } from "../src/commands/web-api.ts";
import { createIdentityToken } from "../src/core/identity-token.ts";
import type { BrainEngine } from "../src/core/engine.ts";
import { withEnv } from "./helpers/with-env.ts";

const NOW = Date.parse("2026-09-19T12:00:00Z");
const lawyer = { userId: "u-lawyer", role: "lawyer" };
const admin = { userId: "u-admin", role: "admin" };
const assistant = { userId: "u-assistant", role: "assistant" };
const client = { userId: "u-client", role: "client_viewer" };

describe("matterScopeAllows", () => {
  test("all-except scope admits everything but denied matters and their documents", () => {
    const scope = withDeniedMatters("all", ["cases/walled"]);
    expect(matterScopeAllows(scope, "cases/open")).toBe(true);
    expect(matterScopeAllows(scope, "law-at/abgb/1295")).toBe(true);
    expect(matterScopeAllows(scope, "cases/walled")).toBe(false);
    expect(matterScopeAllows(scope, "cases/walled/notes")).toBe(false);
    expect(matterScopeAllows(scope, "documents/klage", "cases/walled")).toBe(false);
    expect(matterScopeAllows(scope, "cases/walled-other")).toBe(true);
  });

  test("allow lists keep working, and a deny entry wins", () => {
    expect(matterScopeAllows(["cases/a"], "cases/a/doc")).toBe(true);
    expect(matterScopeAllows(["cases/a"], "cases/b")).toBe(false);
    expect(matterScopeAllows(["cases/a", "!cases/a"], "cases/a")).toBe(false);
    expect(matterScopeAllows([], "cases/a")).toBe(false);
    expect(matterScopeAllows("all", "anything")).toBe(true);
  });
});

describe("matterAccessLevel", () => {
  test("a matter without rules follows the role", () => {
    expect(matterAccessLevel(lawyer, undefined, NOW)).toBe("write");
    expect(matterAccessLevel(assistant, {}, NOW)).toBe("write");
  });

  test("the ethical wall shuts out everyone listed, admins included", () => {
    const perms = { blocked_users: ["u-admin", "u-lawyer"] };
    expect(matterAccessLevel(admin, perms, NOW)).toBe("none");
    expect(matterAccessLevel(lawyer, perms, NOW)).toBe("none");
    expect(matterAccessLevel(assistant, perms, NOW)).toBe("write");
  });

  test("restricted: team and admins; confidential: team only", () => {
    const restricted = { visibility: "restricted" as const, allowed_users: ["u-lawyer"] };
    expect(matterAccessLevel(lawyer, restricted, NOW)).toBe("write");
    expect(matterAccessLevel(admin, restricted, NOW)).toBe("write");
    expect(matterAccessLevel(assistant, restricted, NOW)).toBe("none");
    const confidential = { ...restricted, visibility: "confidential" as const };
    expect(matterAccessLevel(admin, confidential, NOW)).toBe("none");
  });

  test("grants give their level until they expire, never more than the role", () => {
    const perms = {
      visibility: "restricted" as const,
      grants: [
        { user_id: "u-assistant", level: "read" as const, expires_at: "2026-09-20T00:00:00Z" },
        { user_id: "u-client", level: "write" as const },
      ],
    };
    expect(matterAccessLevel(assistant, perms, NOW)).toBe("read");
    expect(matterAccessLevel(assistant, perms, Date.parse("2026-09-21T00:00:00Z"))).toBe("none");
    expect(matterAccessLevel(client, perms, NOW)).toBe("read");
  });

  test("client viewers see only matters they were given", () => {
    expect(matterAccessLevel(client, undefined, NOW)).toBe("none");
    expect(matterAccessLevel(client, { allowed_users: ["u-client"] }, NOW)).toBe("read");
  });
});

describe("scopeForCaller", () => {
  const rows = [
    { slug: "cases/walled", permissions: { blocked_users: ["u-lawyer"] } },
    {
      slug: "cases/readonly",
      permissions: {
        visibility: "restricted" as const,
        grants: [{ user_id: "u-lawyer", level: "read" as const }],
      },
    },
    { slug: "cases/mine", permissions: { allowed_users: ["u-client"] } },
  ];

  test("denies walled matters and reports read-only ones", () => {
    const access = callerMatterAccess(lawyer, rows, NOW);
    expect(access.denied).toEqual(["cases/walled"]);
    expect(access.readOnly).toEqual(["cases/readonly"]);
    expect(scopeForCaller("all", access)).toEqual(["*", "!cases/walled"]);
  });

  test("a client viewer's scope is exactly their matters", () => {
    expect(scopeForCaller("all", callerMatterAccess(client, rows, NOW))).toEqual(["cases/mine"]);
    expect(scopeForCaller("all", callerMatterAccess(client, [], NOW))).toEqual([]);
  });
});

function makeRes() {
  const res: Partial<Response> & { statusCode?: number; body?: unknown } = {};
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

describe("aclGroupsMiddleware matter access", () => {
  const SECRET = "test-shared-secret-key-for-subsumio";
  const engine = {
    executeRaw: async (sql: string) =>
      sql.includes("legal_case")
        ? [{ slug: "cases/walled", permissions: { blocked_users: ["u-admin"] } }]
        : [],
  } as unknown as BrainEngine;

  test("walls an admin out of a blocked matter", async () => {
    await withEnv({ SUBSUMIO_WEB_API_KEY: SECRET }, async () => {
      invalidateMatterAccess("firm-a");
      const token = createIdentityToken(
        { sourceId: "firm-a", matterScope: "all", userId: "u-admin", role: "admin" },
        SECRET
      );
      const req = {
        headers: { "x-subsumio-identity-token": token, "x-subsumio-source": "firm-a" },
        matterScope: "all",
      } as unknown as Request;
      let next = false;
      await aclGroupsMiddleware(engine)(req, makeRes() as Response, () => {
        next = true;
      });
      expect(next).toBe(true);
      expect(req.matterScope).toEqual(["*", "!cases/walled"]);
    });
  });

  test("a support-session token gets neither restricted matters nor the ACL bypass", async () => {
    const supportEngine = {
      executeRaw: async (sql: string) =>
        sql.includes("legal_case")
          ? [{ slug: "cases/restricted", permissions: { visibility: "restricted" } }]
          : [],
    } as unknown as BrainEngine;
    await withEnv({ SUBSUMIO_WEB_API_KEY: SECRET }, async () => {
      invalidateMatterAccess("firm-s");
      const token = createIdentityToken(
        { sourceId: "firm-s", matterScope: "all", userId: "u-operator", role: "support" },
        SECRET
      );
      const req = {
        headers: { "x-subsumio-identity-token": token, "x-subsumio-source": "firm-s" },
        matterScope: "all",
      } as unknown as Request & { aclGroups?: unknown };
      let next = false;
      await aclGroupsMiddleware(supportEngine)(req, makeRes() as Response, () => {
        next = true;
      });
      expect(next).toBe(true);
      expect(req.matterScope).toEqual(["*", "!cases/restricted"]);
      expect(req.aclGroups).not.toBe("all");
    });
  });

  test("refuses a token issued for another firm", async () => {
    await withEnv({ SUBSUMIO_WEB_API_KEY: SECRET }, async () => {
      const token = createIdentityToken(
        { sourceId: "firm-a", matterScope: "all", userId: "u-admin", role: "admin" },
        SECRET
      );
      const req = {
        headers: { "x-subsumio-identity-token": token, "x-subsumio-source": "firm-b" },
      } as unknown as Request;
      const res = makeRes();
      let next = false;
      await aclGroupsMiddleware(engine)(req, res as Response, () => {
        next = true;
      });
      expect(next).toBe(false);
      expect(res.statusCode).toBe(403);
    });
  });
});
