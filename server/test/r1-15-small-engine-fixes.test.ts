/**
 * Small engine hardening:
 *  - a firm's MCP token list/revoke matches its own source exactly (no LIKE
 *    wildcard via `_`, no prefix match onto a longer source id);
 *  - purging a document's stored originals needs write access and respects
 *    a legal hold on the document or its matter;
 *  - changing access groups and document rights is an admin operation.
 */
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import express from "express";
import type { Server } from "node:http";
import { setEnvForFile } from "./helpers/with-env.ts";
import { PGLiteEngine } from "../src/core/pglite-engine.ts";
import { importFromContent } from "../src/core/import-file.ts";
import { mountWebApi, invalidateMatterAccess } from "../src/commands/web-api.ts";
import { createIdentityToken } from "../src/core/identity-token.ts";
import { operations } from "../src/core/operations.ts";

const SECRET = "test-shared-secret-key-for-subsumio";
let engine: PGLiteEngine;
let server: Server;
let base = "";
let releaseEnv: (() => void) | undefined;

function headers(source: string, userId: string, role: string, extra: Record<string, string> = {}) {
  return {
    "content-type": "application/json",
    "x-subsumio-api-key": SECRET,
    "x-subsumio-source": source,
    "x-subsumio-identity-token": createIdentityToken(
      { sourceId: source, matterScope: "all", userId, role },
      SECRET
    ),
    ...extra,
  };
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
}, 120_000);

afterAll(async () => {
  server?.close();
  await engine?.disconnect();
  releaseEnv?.();
});

describe("MCP tokens of a firm", () => {
  test("sources that differ only in `_` / `-` never see each other's tokens", async () => {
    for (const src of ["brain_abc", "brain-abc", "brainxabc"]) {
      const res = await fetch(`${base}/api/mcp-tokens`, {
        method: "POST",
        headers: headers(src, "u-1", "admin"),
        body: JSON.stringify({ name: `Token ${src.length}` }),
      });
      expect(res.status).toBe(201);
    }
    const list = async (src: string) =>
      (
        (await (
          await fetch(`${base}/api/mcp-tokens`, { headers: headers(src, "u-1", "admin") })
        ).json()) as {
          tokens: Array<{ id: string; name: string }>;
        }
      ).tokens;
    const own = await list("brain_abc");
    expect(own).toHaveLength(1);
    const other = await list("brain-abc");
    expect(other).toHaveLength(1);
    // Revoking another firm's token by id is refused.
    const res = await fetch(`${base}/api/mcp-tokens/${other[0]!.id}`, {
      method: "DELETE",
      headers: headers("brain_abc", "u-1", "admin"),
    });
    expect(res.status).toBe(404);
  });
});

describe("DELETE /api/files", () => {
  const SRC = "firm-files";
  beforeAll(async () => {
    const admin = headers(SRC, "u-admin", "admin", { "x-subsumio-matter-permissions": "write" });
    const put = (body: unknown) =>
      fetch(`${base}/api/pages`, { method: "POST", headers: admin, body: JSON.stringify(body) });
    for (const slug of ["cases/ro", "cases/hold"]) {
      expect((await put({ slug, type: "legal_case", title: slug, content: "Akte" })).status).toBe(
        200
      );
    }
    await put({
      slug: "cases/ro",
      merge: true,
      frontmatter: {
        permissions: {
          visibility: "confidential",
          grants: [{ user_id: "u-reader", level: "read" }],
        },
      },
    });
    await engine.executeRaw(
      `UPDATE pages SET frontmatter = frontmatter || '{"legal_hold": true}'::jsonb WHERE slug = 'cases/hold' AND source_id = $1`,
      [SRC]
    );
    invalidateMatterAccess(SRC);
    for (const [slug, caseSlug] of [
      ["docs/ro", "cases/ro"],
      ["docs/hold", "cases/hold"],
    ] as const) {
      await importFromContent(
        engine,
        slug,
        `---\ntitle: ${slug}\ntype: document\ncase_slug: ${caseSlug}\n---\n\ntext\n`,
        { sourceId: SRC, noEmbed: true }
      );
    }
  });

  test("a user who may only read the matter cannot purge (403)", async () => {
    const res = await fetch(`${base}/api/files/docs/ro`, {
      method: "DELETE",
      headers: headers(SRC, "u-reader", "lawyer"),
    });
    expect(res.status).toBe(403);
  });

  test("a legal hold on the matter blocks the purge (409)", async () => {
    const res = await fetch(`${base}/api/files/docs/hold`, {
      method: "DELETE",
      headers: headers(SRC, "u-admin", "admin"),
    });
    expect(res.status).toBe(409);
    expect(((await res.json()) as { error: string }).error).toBe("legal_hold_active");
  });
});

describe("access-group operations", () => {
  test("changing groups, members and document rights needs the admin scope", () => {
    for (const name of [
      "acl_create_group",
      "acl_delete_group",
      "acl_add_member",
      "acl_remove_member",
      "acl_set_page_permission",
      "acl_remove_page_permission",
    ]) {
      expect(operations.find((o) => o.name === name)?.scope).toBe("admin");
    }
  });
});
