/**
 * Matter access end to end: the web API on a real PGLite brain. A wall set
 * through the permissions channel hides the matter and its documents from
 * the walled user; ordinary page writes can neither change nor drop it.
 */
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import express from "express";
import type { Server } from "node:http";
import { setEnvForFile } from "./helpers/with-env.ts";
import { PGLiteEngine } from "../src/core/pglite-engine.ts";
import { mountWebApi, invalidateMatterAccess } from "../src/commands/web-api.ts";
import { createIdentityToken } from "../src/core/identity-token.ts";

const SECRET = "test-shared-secret-key-for-subsumio";
const SOURCE = "firm-a";
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
  return fetch(`${base}/api/pages`, { method: "POST", headers: h, body: JSON.stringify(body) });
}

async function getPage(h: Record<string, string>, slug: string) {
  return fetch(`${base}/api/pages/${encodeURIComponent(slug)}`, { headers: h });
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
  await putPage(admin, {
    slug: "cases/walled",
    type: "legal_case",
    title: "Walled",
    content: "Akte",
    frontmatter: {},
  });
  await putPage(admin, {
    slug: "cases/open",
    type: "legal_case",
    title: "Open",
    content: "Akte",
    frontmatter: {},
  });
  await putPage(admin, {
    slug: "documents/klage",
    type: "document",
    title: "Klage",
    content: "Klagetext",
    frontmatter: { case_slug: "cases/walled" },
  });
}, 120_000);

afterAll(async () => {
  server?.close();
  await engine?.disconnect();
  releaseEnv?.();
});

describe("matter access over HTTP", () => {
  test("a page write without the permissions channel cannot set a wall", async () => {
    const res = await putPage(headers("u-lawyer", "lawyer"), {
      slug: "cases/open",
      merge: true,
      frontmatter: { permissions: { blocked_users: ["u-admin"] } },
    });
    expect(res.status).toBe(200);
    invalidateMatterAccess(SOURCE);
    expect((await getPage(headers("u-admin", "admin"), "cases/open")).status).toBe(200);
  });

  test("a wall hides the matter and its documents from the walled user only", async () => {
    const set = await putPage(
      headers("u-admin", "admin", { "x-subsumio-matter-permissions": "write" }),
      {
        slug: "cases/walled",
        merge: true,
        frontmatter: { permissions: { blocked_users: ["u-lawyer"] } },
      }
    );
    expect(set.status).toBe(200);

    const lawyer = headers("u-lawyer", "lawyer");
    expect((await getPage(lawyer, "cases/walled")).status).toBe(404);
    expect((await getPage(lawyer, "documents/klage")).status).toBe(404);
    expect((await getPage(lawyer, "cases/open")).status).toBe(200);
    const list = (await (
      await fetch(`${base}/api/pages?type=legal_case`, { headers: lawyer })
    ).json()) as Array<{ slug: string }>;
    expect(list.map((p) => p.slug)).not.toContain("cases/walled");
    const write = await putPage(lawyer, {
      slug: "documents/new",
      content: "x",
      frontmatter: { case_slug: "cases/walled" },
    });
    expect(write.status).toBe(404);

    expect((await getPage(headers("u-assistant", "assistant"), "cases/walled")).status).toBe(200);
  });

  test("a full overwrite of the case keeps its wall", async () => {
    const res = await putPage(headers("u-admin", "admin"), {
      slug: "cases/walled",
      type: "legal_case",
      title: "Walled",
      content: "Neu",
      frontmatter: {},
    });
    expect(res.status).toBe(200);
    expect((await getPage(headers("u-lawyer", "lawyer"), "cases/walled")).status).toBe(404);
  });

  test("a read-only grant refuses writes to the matter", async () => {
    await putPage(headers("u-admin", "admin", { "x-subsumio-matter-permissions": "write" }), {
      slug: "cases/open",
      merge: true,
      frontmatter: {
        permissions: {
          visibility: "restricted",
          grants: [{ user_id: "u-assistant", level: "read" }],
        },
      },
    });
    const assistant = headers("u-assistant", "assistant");
    expect((await getPage(assistant, "cases/open")).status).toBe(200);
    const write = await putPage(assistant, {
      slug: "cases/open",
      merge: true,
      frontmatter: { note: "x" },
    });
    expect(write.status).toBe(403);
  });

  test("a private conversation is the owner's alone; a shared copy reaches colleagues", async () => {
    const owner = headers("u-lawyer", "lawyer");
    const colleague = headers("u-assistant", "assistant");
    const admin = headers("u-admin", "admin");
    expect(
      (
        await putPage(owner, {
          slug: "chat-sessions/private/u-lawyer/s1",
          type: "chat_session",
          title: "Frage",
          content: "Vertrauliche Mandatsfrage Zebrastreifen",
          frontmatter: { owner_id: "u-lawyer" },
        })
      ).status
    ).toBe(200);
    await putPage(owner, {
      slug: "chat-sessions/shared/u-lawyer/s2",
      type: "chat_session",
      title: "Geteilt",
      content: "Geteilte Unterhaltung",
      frontmatter: { owner_id: "u-lawyer", shared: true },
    });

    expect((await getPage(owner, "chat-sessions/private/u-lawyer/s1")).status).toBe(200);
    expect((await getPage(colleague, "chat-sessions/private/u-lawyer/s1")).status).toBe(404);
    expect((await getPage(admin, "chat-sessions/private/u-lawyer/s1")).status).toBe(404);
    expect((await getPage(colleague, "chat-sessions/shared/u-lawyer/s2")).status).toBe(200);

    const listed = (await (
      await fetch(`${base}/api/pages?type=chat_session`, { headers: colleague })
    ).json()) as Array<{ slug: string }>;
    expect(listed.map((p) => p.slug)).toEqual(["chat-sessions/shared/u-lawyer/s2"]);

    // Keyword search needs no embeddings (vector search times out offline).
    await putPage(owner, {
      slug: "documents/gutachten",
      type: "document",
      title: "Gutachten",
      content: "Gutachten zum Zebrastreifen an der Kreuzung",
      frontmatter: {},
    });
    const found = await engine.searchKeyword("Zebrastreifen", { limit: 10, sourceId: SOURCE });
    expect(found.some((r) => r.slug === "documents/gutachten")).toBe(true);
    expect(found.some((r) => r.slug.startsWith("chat-sessions/"))).toBe(false);
  });
});
