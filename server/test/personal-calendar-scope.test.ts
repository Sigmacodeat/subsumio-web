/**
 * Personal calendar mirrors (a lawyer's own Outlook appointments) reach only
 * their owner — page list, direct read, search and MCP token alike; a mirror
 * without a recorded owner reaches nobody. The rule lives in the shared
 * matter scope (core/matter-access-db.ts), like the matter walls.
 */
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import express from "express";
import type { Server } from "node:http";
import { setEnvForFile } from "./helpers/with-env.ts";
import { PGLiteEngine } from "../src/core/pglite-engine.ts";
import { mountWebApi, invalidateMatterAccess } from "../src/commands/web-api.ts";
import { createIdentityToken } from "../src/core/identity-token.ts";
import { matterScopeAllows, personalCalendarDenies } from "../src/core/matter-access.ts";
import { resolveWebMcpToken } from "../src/core/web-mcp-token.ts";

const SECRET = "test-shared-secret-key-for-subsumio";
const SOURCE = "firm-cal";
let engine: PGLiteEngine;
let server: Server;
let base = "";
let releaseEnv: (() => void) | undefined;

function headers(userId: string, role: string, extra: Record<string, string> = {}) {
  return {
    "content-type": "application/json",
    "x-subsumio-api-key": SECRET,
    "x-subsumio-source": SOURCE,
    "x-subsumio-identity-token": createIdentityToken(
      { sourceId: SOURCE, matterScope: "all", userId, role },
      SECRET
    ),
    ...extra,
  };
}

async function putPage(h: Record<string, string>, body: Record<string, unknown>) {
  const res = await fetch(`${base}/api/pages`, {
    method: "POST",
    headers: h,
    body: JSON.stringify(body),
  });
  expect(res.status).toBe(200);
}

async function getStatus(h: Record<string, string>, slug: string) {
  const res = await fetch(
    `${base}/api/pages/${slug.split("/").map(encodeURIComponent).join("/")}`,
    {
      headers: h,
    }
  );
  await res.body?.cancel();
  return res.status;
}

async function listSlugs(h: Record<string, string>, query: string): Promise<string[]> {
  const res = await fetch(`${base}/api/pages?${query}`, { headers: h });
  const raw = (await res.json()) as unknown;
  const pages = Array.isArray(raw)
    ? raw
    : Array.isArray((raw as { pages?: unknown[] })?.pages)
      ? (raw as { pages: unknown[] }).pages
      : [];
  return (pages as Array<{ slug: string }>).map((p) => p.slug);
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

  const admin = headers("u-admin", "admin");
  // Anna's mailbox mirror, one without a recorded owner, and a firm appointment.
  await putPage(admin, {
    slug: "calendar/outlook/anna@kanzlei.test/e1",
    type: "calendar_event",
    title: "Termin: Arzt Pelikanweg",
    content: "Arzt Pelikanweg",
    frontmatter: { type: "calendar_event", owner_user_id: "u-anna", subject: "Arzt" },
  });
  await putPage(admin, {
    slug: "calendar/outlook/alt@kanzlei.test/e2",
    type: "calendar_event",
    title: "Termin: Alt Pelikanweg",
    content: "Alt Pelikanweg",
    frontmatter: { type: "calendar_event", subject: "Alt" },
  });
  await putPage(admin, {
    slug: "appointments/besprechung",
    type: "calendar_event",
    title: "Besprechung Pelikanweg",
    content: "Besprechung Pelikanweg",
    frontmatter: { type: "calendar_event" },
  });
  invalidateMatterAccess(SOURCE);
}, 120_000);

afterAll(async () => {
  server?.close();
  await engine?.disconnect();
  releaseEnv?.();
});

describe("personal calendar mirrors reach only their owner", () => {
  test("the owner reads the mirror, colleagues and admins do not", async () => {
    const anna = headers("u-anna", "lawyer");
    const bert = headers("u-bert", "lawyer");
    const admin = headers("u-admin", "admin");
    expect(await getStatus(anna, "calendar/outlook/anna@kanzlei.test/e1")).toBe(200);
    expect(await getStatus(bert, "calendar/outlook/anna@kanzlei.test/e1")).toBe(404);
    expect(await getStatus(admin, "calendar/outlook/anna@kanzlei.test/e1")).toBe(404);
    const list = await listSlugs(bert, "type=calendar_event");
    expect(list).toContain("appointments/besprechung");
    expect(list).not.toContain("calendar/outlook/anna@kanzlei.test/e1");
    expect(await listSlugs(anna, "type=calendar_event")).toContain(
      "calendar/outlook/anna@kanzlei.test/e1"
    );
  }, 60_000);

  test("a mirror without a recorded owner reaches nobody (fail-closed)", async () => {
    expect(
      await getStatus(headers("u-anna", "lawyer"), "calendar/outlook/alt@kanzlei.test/e2")
    ).toBe(404);
    expect(
      await getStatus(headers("u-admin", "admin"), "calendar/outlook/alt@kanzlei.test/e2")
    ).toBe(404);
  }, 60_000);

  test("keyword search leaves colleagues' mirrors out", async () => {
    const res = await fetch(`${base}/api/search?q=Pelikanweg`, {
      headers: headers("u-bert", "lawyer"),
    });
    const text = await res.text();
    expect(text).not.toContain("calendar/outlook/");
  }, 60_000);

  test("a mirror written a moment ago is hidden from colleagues at once", async () => {
    const bert = headers("u-bert", "lawyer");
    // Warm the cached access rules, then sync a new appointment.
    expect(await getStatus(bert, "appointments/besprechung")).toBe(200);
    await putPage(headers("u-admin", "admin"), {
      slug: "calendar/outlook/carla@kanzlei.test/e9",
      type: "calendar_event",
      title: "Termin: neu",
      content: "neu",
      frontmatter: { type: "calendar_event", owner_user_id: "u-carla" },
    });
    expect(await getStatus(bert, "calendar/outlook/carla@kanzlei.test/e9")).toBe(404);
    expect(
      await getStatus(headers("u-carla", "lawyer"), "calendar/outlook/carla@kanzlei.test/e9")
    ).toBe(200);
  }, 60_000);

  test("an MCP token carries the same rule", async () => {
    const access = await resolveWebMcpToken(
      engine,
      { sourceId: SOURCE, userId: "u-bert" },
      async () => ({ active: true, role: "lawyer" })
    );
    if (typeof access === "string") throw new Error(access);
    expect(matterScopeAllows(access.matterScope, "calendar/outlook/anna@kanzlei.test/e1")).toBe(
      false
    );
    expect(matterScopeAllows(access.matterScope, "appointments/besprechung")).toBe(true);
  }, 60_000);

  test("a whole foreign mailbox collapses to one deny entry", () => {
    expect(
      personalCalendarDenies(
        [
          { slug: "calendar/outlook/a@x/1", owner: "u-a" },
          { slug: "calendar/outlook/a@x/2", owner: "u-a" },
          { slug: "calendar/outlook/b@x/1", owner: "u-me" },
          { slug: "calendar/outlook/c@x/1", owner: null },
          { slug: "events/imported", owner: "u-a" },
        ],
        "u-me"
      )
    ).toEqual(["calendar/outlook/a@x", "calendar/outlook/c@x/1", "events/imported"]);
  });
});
