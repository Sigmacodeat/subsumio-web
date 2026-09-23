/**
 * MCP tokens minted in the firm settings act for the web user who created
 * them: bound at creation, resolved at every use (active account, current
 * matter access), refused without an owner, and every call runs under that
 * user's matter guard — never the whole firm brain.
 */
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import express from "express";
import type { Server } from "node:http";
import { setEnvForFile } from "./helpers/with-env.ts";
import { PGLiteEngine } from "../src/core/pglite-engine.ts";
import { mountWebApi, invalidateMatterAccess } from "../src/commands/web-api.ts";
import { createIdentityToken } from "../src/core/identity-token.ts";
import { GBrainOAuthProvider } from "../src/core/oauth-provider.ts";
import { sqlQueryForEngine, executeRawJsonb } from "../src/core/sql-query.ts";
import { hashToken } from "../src/core/utils.ts";
import { dispatchToolCall } from "../src/mcp/dispatch.ts";
import {
  makeWebUserStatusFetcher,
  readWebMcpBinding,
  resolveWebMcpToken,
  webMcpPermissions,
  type WebUserStatus,
} from "../src/core/web-mcp-token.ts";
import type { AuthInfo } from "../src/core/operations.ts";

const SECRET = "test-shared-secret-key-for-subsumio";
const SOURCE = "firm-mcp";
let engine: PGLiteEngine;
let server: Server;
let base = "";
let releaseEnv: (() => void) | undefined;

/** Web user directory the fake status endpoint answers from. */
const users = new Map<string, WebUserStatus>([
  ["u-lawyer", { active: true, role: "lawyer" }],
  ["u-admin", { active: true, role: "admin" }],
  ["u-gone", { active: false }],
]);
const statusOf = async (userId: string, sourceId: string): Promise<WebUserStatus> =>
  sourceId === SOURCE ? (users.get(userId) ?? { active: false }) : { active: false };

function headers(userId: string | null, role = "lawyer", extra: Record<string, string> = {}) {
  return {
    "content-type": "application/json",
    "x-subsumio-api-key": SECRET,
    "x-subsumio-source": SOURCE,
    ...(userId
      ? {
          "x-subsumio-identity-token": createIdentityToken(
            { sourceId: SOURCE, matterScope: "all", userId, role },
            SECRET
          ),
        }
      : {}),
    ...extra,
  };
}

async function insertToken(token: string, name: string, permissions: unknown) {
  await executeRawJsonb(
    engine,
    `INSERT INTO access_tokens (name, token_hash, permissions) VALUES ($1, $2, $3::jsonb)`,
    [name, hashToken(token)],
    [permissions]
  );
}

function provider(resolver = true) {
  return new GBrainOAuthProvider({
    sql: sqlQueryForEngine(engine),
    ...(resolver ? { resolveWebMcp: (b) => resolveWebMcpToken(engine, b, statusOf) } : {}),
  });
}

beforeAll(async () => {
  releaseEnv = setEnvForFile({ SUBSUMIO_WEB_API_KEY: SECRET });
  engine = new PGLiteEngine();
  await engine.connect({});
  await engine.initSchema();
  const app = express();
  mountWebApi(app, engine, { apiKey: SECRET });
  await new Promise<void>((resolve) => {
    server = app.listen(0, () => resolve());
  });
  const addr = server.address();
  base = `http://127.0.0.1:${typeof addr === "object" && addr ? addr.port : 0}`;
  const put = (h: Record<string, string>, body: unknown) =>
    fetch(`${base}/api/pages`, { method: "POST", headers: h, body: JSON.stringify(body) });
  for (const slug of ["cases/walled", "cases/open"]) {
    const res = await put(headers("u-admin", "admin"), {
      slug,
      type: "legal_case",
      title: `Akte ${slug}`,
      content: `Sachverhalt ${slug} Zebra`,
      frontmatter: {},
    });
    expect(res.status).toBe(200);
  }
  const wall = await put(
    headers("u-admin", "admin", { "x-subsumio-matter-permissions": "write" }),
    {
      slug: "cases/walled",
      merge: true,
      frontmatter: { permissions: { blocked_users: ["u-lawyer"] } },
    }
  );
  expect(wall.status).toBe(200);
  invalidateMatterAccess(SOURCE);
}, 120_000);

afterAll(async () => {
  server?.close();
  await engine?.disconnect();
  releaseEnv?.();
});

describe("binding", () => {
  test("reads the creator binding; the name must agree with the bound source", () => {
    expect(readWebMcpBinding("gbrain-cli", {})).toBeNull();
    expect(readWebMcpBinding(`web-mcp:${SOURCE}:x`, webMcpPermissions(SOURCE, "u1"))).toEqual({
      sourceId: SOURCE,
      userId: "u1",
    });
    // Legacy token: no binding → no owner.
    expect(readWebMcpBinding(`web-mcp:${SOURCE}:x`, { takes_holders: ["world"] })?.userId).toBe(
      undefined
    );
    // A binding for another firm does not count.
    expect(
      readWebMcpBinding(`web-mcp:${SOURCE}:x`, webMcpPermissions("other-firm", "u1"))?.userId
    ).toBeUndefined();
    expect(
      readWebMcpBinding(`web-mcp:${SOURCE}:x`, JSON.stringify(webMcpPermissions(SOURCE, "u1")))
        ?.userId
    ).toBe("u1");
  });
});

describe("user status from the web app", () => {
  test("unconfigured or failing checks answer inactive; answers are cached briefly", async () => {
    const off = makeWebUserStatusFetcher({ baseUrl: "", key: "" });
    expect(await off("u1", SOURCE)).toEqual({ active: false });

    let calls = 0;
    let lastUrl = "";
    let lastKey = "";
    const ok = makeWebUserStatusFetcher({
      baseUrl: "http://web.test/",
      key: "k",
      fetchImpl: (async (url: string, init?: RequestInit) => {
        calls++;
        lastUrl = url;
        lastKey = (init?.headers as Record<string, string>)["x-engine-webhook-key"];
        return Response.json({ active: true, role: "lawyer" });
      }) as unknown as typeof fetch,
    });
    expect(await ok("u 1", SOURCE)).toEqual({ active: true, role: "lawyer" });
    expect(await ok("u 1", SOURCE)).toEqual({ active: true, role: "lawyer" });
    expect(calls).toBe(1);
    expect(lastUrl).toBe(
      `http://web.test/api/internal/engine-user-status?uid=u%201&source=${SOURCE}`
    );
    expect(lastKey).toBe("k");

    const broken = makeWebUserStatusFetcher({
      baseUrl: "http://web.test",
      key: "k",
      fetchImpl: (async () => {
        throw new Error("down");
      }) as unknown as typeof fetch,
    });
    expect(await broken("u1", SOURCE)).toEqual({ active: false });
  });
});

describe("resolving a token", () => {
  test("walls of the owner apply; owner missing or inactive is refused", async () => {
    const lawyer = await resolveWebMcpToken(
      engine,
      { sourceId: SOURCE, userId: "u-lawyer" },
      statusOf
    );
    expect(typeof lawyer).toBe("object");
    if (typeof lawyer === "object") {
      expect(lawyer.matterScope).toEqual(expect.arrayContaining(["*", "!cases/walled"]));
      expect(lawyer.sourceId).toBe(SOURCE);
    }
    const adm = await resolveWebMcpToken(engine, { sourceId: SOURCE, userId: "u-admin" }, statusOf);
    // No walls for the admin: still an explicit list, so the guard runs.
    expect(typeof adm === "object" && adm.matterScope).toEqual(["*"]);
    expect(await resolveWebMcpToken(engine, { sourceId: SOURCE }, statusOf)).toBe("owner_missing");
    expect(await resolveWebMcpToken(engine, { sourceId: SOURCE, userId: "u-gone" }, statusOf)).toBe(
      "owner_inactive"
    );
  });
});

describe("verifyAccessToken", () => {
  test("a bound firm token gets the firm source, read/write and the owner's walls", async () => {
    await insertToken(
      "tok-lawyer",
      `web-mcp:${SOURCE}:desk`,
      webMcpPermissions(SOURCE, "u-lawyer")
    );
    const auth = (await provider().verifyAccessToken("tok-lawyer")) as unknown as AuthInfo;
    expect(auth.sourceId).toBe(SOURCE);
    expect(auth.scopes).toEqual(["read", "write"]);
    expect(auth.webUserId).toBe("u-lawyer");
    expect(auth.matterScope).toEqual(expect.arrayContaining(["!cases/walled"]));
  });

  test("tokens without owner, with an inactive owner, or without a resolver are refused", async () => {
    await insertToken("tok-legacy", `web-mcp:${SOURCE}:old`, { takes_holders: ["world"] });
    await expect(provider().verifyAccessToken("tok-legacy")).rejects.toThrow(/no owner/);
    await insertToken("tok-gone", `web-mcp:${SOURCE}:gone`, webMcpPermissions(SOURCE, "u-gone"));
    await expect(provider().verifyAccessToken("tok-gone")).rejects.toThrow(/no longer/);
    await expect(provider(false).verifyAccessToken("tok-lawyer")).rejects.toThrow();
  });

  test("operator bearer tokens (not web-mcp) keep their behaviour", async () => {
    await insertToken("tok-cli", "operator-cli", { takes_holders: ["world"] });
    const auth = (await provider().verifyAccessToken("tok-cli")) as unknown as AuthInfo;
    expect(auth.scopes).toEqual(["read", "write", "admin"]);
    expect(auth.webUserId).toBeUndefined();
  });
});

describe("tool calls under the owner's matter guard", () => {
  const guard = { scope: ["*", "!cases/walled"], readOnly: [] as string[] };
  const call = (name: string, params: Record<string, unknown>) =>
    dispatchToolCall(engine, name, params, {
      remote: true,
      sourceId: SOURCE,
      matterScope: guard.scope,
      matterGuard: guard,
    });

  test("a walled matter reads as not found; visible ones work", async () => {
    const walled = await call("get_page", { slug: "cases/walled" });
    expect(walled.isError).toBe(true);
    const open = await call("get_page", { slug: "cases/open" });
    expect(open.isError).toBeFalsy();
    const listed = await call("list_pages", { limit: 50 });
    const slugs = (JSON.parse(listed.content[0]!.text) as Array<{ slug: string }>).map(
      (p) => p.slug
    );
    expect(slugs).toContain("cases/open");
    expect(slugs).not.toContain("cases/walled");
  });

  test("tools that cannot filter by matter are refused", async () => {
    const res = await call("get_stats", {});
    expect(res.isError).toBe(true);
    expect(res.content[0]!.text).toContain("permission_denied");
  });
});

describe("token management routes", () => {
  test("creating a token needs a signed identity and binds it to that user", async () => {
    const anon = await fetch(`${base}/api/mcp-tokens`, {
      method: "POST",
      headers: headers(null),
      body: JSON.stringify({ name: "Claude" }),
    });
    expect(anon.status).toBe(403);

    const res = await fetch(`${base}/api/mcp-tokens`, {
      method: "POST",
      headers: headers("u-lawyer"),
      body: JSON.stringify({ name: "Claude" }),
    });
    expect(res.status).toBe(201);
    const { token } = (await res.json()) as { token: string };
    const [row] = await engine.executeRaw<{ permissions: unknown }>(
      `SELECT permissions FROM access_tokens WHERE token_hash = $1`,
      [hashToken(token)]
    );
    const perms = (
      typeof row!.permissions === "string" ? JSON.parse(row!.permissions) : row!.permissions
    ) as { web_mcp: { user_id: string; source_id: string } };
    expect(perms.web_mcp).toEqual({ user_id: "u-lawyer", source_id: SOURCE });
  });

  test("the list flags tokens without owner", async () => {
    const res = await fetch(`${base}/api/mcp-tokens`, { headers: headers("u-lawyer") });
    const { tokens } = (await res.json()) as {
      tokens: Array<{ name: string; ownerMissing: boolean; ownedByCaller: boolean }>;
    };
    const byName = new Map(tokens.map((t) => [t.name, t]));
    expect(byName.get("old")?.ownerMissing).toBe(true);
    expect(byName.get("desk")).toMatchObject({ ownerMissing: false, ownedByCaller: true });
    expect(byName.get("Claude")?.ownerMissing).toBe(false);
  });
});
