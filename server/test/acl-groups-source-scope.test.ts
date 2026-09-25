/**
 * Access groups belong to one source. Several firms share one database, so
 * every group operation (delete, members, page permissions) must treat a
 * group of another source exactly like a missing group — at the core helper
 * level and at the REST route level.
 */
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import express from "express";
import type { Server } from "node:http";
import { setEnvForFile } from "./helpers/with-env.ts";
import { PGLiteEngine } from "../src/core/pglite-engine.ts";
import { mountWebApi } from "../src/commands/web-api.ts";
import {
  addGroupMember,
  createAccessGroup,
  deleteAccessGroup,
  getPagePermissions,
  listGroupMembers,
  removeGroupMember,
  setPagePermission,
} from "../src/core/acl.ts";

const SECRET = "test-shared-secret-key-for-subsumio";
let engine: PGLiteEngine;
let server: Server;
let base = "";
let releaseEnv: (() => void) | undefined;

async function ensureSource(id: string) {
  await engine.executeRaw(
    `INSERT INTO sources (id, name, config) VALUES ($1, $1, '{}'::jsonb) ON CONFLICT (id) DO NOTHING`,
    [id]
  );
}

async function groupExists(id: string): Promise<boolean> {
  const rows = await engine.executeRaw<{ id: string }>(
    `SELECT id::text AS id FROM access_groups WHERE id = $1::uuid`,
    [id]
  );
  return rows.length > 0;
}

function call(method: string, path: string, source: string, body?: unknown) {
  return fetch(`${base}${path}`, {
    method,
    headers: {
      "content-type": "application/json",
      "x-subsumio-api-key": SECRET,
      "x-subsumio-source": source,
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
}

beforeAll(async () => {
  releaseEnv = setEnvForFile({ SUBSUMIO_WEB_API_KEY: SECRET });
  engine = new PGLiteEngine();
  await engine.connect({});
  await engine.initSchema();
  await ensureSource("firm-a");
  await ensureSource("firm-b");
  const app = express();
  mountWebApi(app, engine, { apiKey: SECRET });
  await new Promise<void>((resolve) => {
    server = app.listen(0, () => resolve());
  });
  const addr = server.address();
  base = `http://127.0.0.1:${typeof addr === "object" && addr ? addr.port : 0}`;
}, 120_000);

afterAll(async () => {
  server?.close();
  await engine?.disconnect();
  releaseEnv?.();
});

describe("core helpers are bound to the caller's source", () => {
  test("another source cannot delete, list, change or use a group", async () => {
    const g = await createAccessGroup(engine, "firm-a", "Familienrecht");
    expect(await addGroupMember(engine, g.id, "user-a", "firm-a")).toBe(true);

    expect(await deleteAccessGroup(engine, g.id, "firm-b")).toBe(false);
    expect(await groupExists(g.id)).toBe(true);
    expect(await listGroupMembers(engine, g.id, "firm-b")).toEqual([]);
    expect(await removeGroupMember(engine, g.id, "user-a", "firm-b")).toBe(false);
    expect(await addGroupMember(engine, g.id, "user-b", "firm-b")).toBe(false);
    const members = await listGroupMembers(engine, g.id, "firm-a");
    expect(members.map((m) => m.user_id)).toEqual(["user-a"]);

    const page = await engine.putPage(
      "notes/b",
      { type: "note", title: "b", compiled_truth: "x", frontmatter: {} } as any,
      { sourceId: "firm-b" }
    );
    expect(await setPagePermission(engine, page.id, g.id, "read", "firm-b")).toBe(false);
    expect(await getPagePermissions(engine, page.id)).toEqual([]);

    expect(await deleteAccessGroup(engine, g.id, "firm-a")).toBe(true);
    expect(await groupExists(g.id)).toBe(false);
  });

  test("a malformed group id reads as not found, not as a database error", async () => {
    expect(await deleteAccessGroup(engine, "not-a-uuid", "firm-a")).toBe(false);
    expect(await listGroupMembers(engine, "not-a-uuid", "firm-a")).toEqual([]);
  });
});

describe("REST routes are bound to the request's source", () => {
  test("delete and member routes of another source answer 404 and change nothing", async () => {
    const g = await createAccessGroup(engine, "firm-a", "Assistenz");
    await addGroupMember(engine, g.id, "user-a", "firm-a");

    const del = await call("DELETE", `/api/acls/groups/${g.id}`, "firm-b");
    expect(del.status).toBe(404);
    expect(await groupExists(g.id)).toBe(true);

    const list = await call("GET", `/api/acls/groups/${g.id}/members`, "firm-b");
    expect(list.status).toBe(404);

    const add = await call("POST", `/api/acls/groups/${g.id}/members`, "firm-b", {
      user_id: "user-b",
    });
    expect(add.status).toBe(404);

    const rm = await call("DELETE", `/api/acls/groups/${g.id}/members/user-a`, "firm-b");
    expect(((await rm.json()) as { success: boolean }).success).toBe(false);

    const own = await call("GET", `/api/acls/groups/${g.id}/members`, "firm-a");
    expect(own.status).toBe(200);
    expect(((await own.json()) as Array<{ user_id: string }>).map((m) => m.user_id)).toEqual([
      "user-a",
    ]);

    const ownDel = await call("DELETE", `/api/acls/groups/${g.id}`, "firm-a");
    expect(ownDel.status).toBe(200);
    expect(await groupExists(g.id)).toBe(false);
  });
});
