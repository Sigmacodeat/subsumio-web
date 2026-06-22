/**
 * P0-SECR-002 — engine-side matterScope enforcement (Subsumio Kanzlei-OS).
 *
 * Two things pinned here, both fixed during a follow-up review of the
 * initial engine-side matter-scope landing:
 *
 * 1. get_page's matter-scope denial must be byte-identical in shape to a
 *    genuine "page not found" — a denied caller must not be able to tell
 *    "doesn't exist" apart from "exists but is outside your scope" (same
 *    leak-guard contract already established at the app layer in
 *    src/lib/legal-chat/actions.ts's resolveAuthorizedCase/caseLookupHelp).
 * 2. matterScopeFilter/isSlugInMatterScope's own semantics: "all" passes
 *    everything, an empty array denies everything (fail-closed), a
 *    non-matching prefix denies, a matching prefix passes.
 *
 * The web-api HTTP-layer fail-closed-on-invalid-token behavior (a presented
 * but unverifiable x-subsumio-identity-token must 403, not silently fall
 * back to "all") lives in identity-token.test.ts (signature/expiry) — this
 * file covers the operations.ts contract layer that consumes the verified
 * scope, independent of how it got there.
 */
import { describe, test, expect, beforeAll, afterAll, beforeEach } from "bun:test";
import { PGLiteEngine } from "../src/core/pglite-engine.ts";
import { resetPgliteState } from "./helpers/reset-pglite.ts";
import {
  operations,
  OperationError,
  matterScopeFilter,
  isSlugInMatterScope,
  type OperationContext,
} from "../src/core/operations.ts";
import { importFromContent } from "../src/core/import-file.ts";

let engine: PGLiteEngine;
const get_page = operations.find((o) => o.name === "get_page")!;
const list_pages = operations.find((o) => o.name === "list_pages")!;

function ctxOf(overrides: Partial<OperationContext> = {}): OperationContext {
  return {
    engine: engine as any,
    config: {} as any,
    logger: console as any,
    dryRun: false,
    remote: false,
    sourceId: "default",
    ...overrides,
  };
}

beforeAll(async () => {
  engine = new PGLiteEngine();
  await engine.connect({});
  await engine.initSchema();
}, 60_000);

afterAll(async () => {
  if (engine) await engine.disconnect();
}, 60_000);

beforeEach(async () => {
  await resetPgliteState(engine);
  await engine.putPage(
    "legal/cases/2026-014",
    {
      type: "legal_case",
      title: "In-scope case",
      compiled_truth: "public content",
      frontmatter: {},
    },
    { sourceId: "default" }
  );
  await engine.putPage(
    "legal/cases/2026-099",
    {
      type: "legal_case",
      title: "Out-of-scope case",
      compiled_truth: "secret content",
      frontmatter: {},
    },
    { sourceId: "default" }
  );
});

describe("isSlugInMatterScope / matterScopeFilter — pure semantics", () => {
  test("undefined scope = no enforcement (legacy/CLI)", () => {
    expect(isSlugInMatterScope("legal/cases/anything", ctxOf({ matterScope: undefined }))).toBe(
      true
    );
    expect(
      matterScopeFilter([{ slug: "a" }, { slug: "b" }], ctxOf({ matterScope: undefined }))
    ).toHaveLength(2);
  });

  test('"all" scope passes everything (trusted admin)', () => {
    expect(isSlugInMatterScope("legal/cases/2026-099", ctxOf({ matterScope: "all" }))).toBe(true);
    expect(
      matterScopeFilter([{ slug: "a" }, { slug: "b" }], ctxOf({ matterScope: "all" }))
    ).toHaveLength(2);
  });

  test("empty array scope denies everything (fail-closed)", () => {
    expect(isSlugInMatterScope("legal/cases/2026-014", ctxOf({ matterScope: [] }))).toBe(false);
    expect(
      matterScopeFilter([{ slug: "legal/cases/2026-014" }], ctxOf({ matterScope: [] }))
    ).toHaveLength(0);
  });

  test("scope prefixes match path boundaries, not arbitrary string prefixes", () => {
    const ctx = ctxOf({ matterScope: ["legal/cases/2026-01"] });
    expect(isSlugInMatterScope("legal/cases/2026-01", ctx)).toBe(true);
    expect(isSlugInMatterScope("legal/cases/2026-01/documents/a", ctx)).toBe(true);
    expect(isSlugInMatterScope("legal/cases/2026-014", ctx)).toBe(false);
    expect(
      matterScopeFilter(
        [
          { slug: "documents/assigned", frontmatter: { case_slug: "legal/cases/2026-01" } },
          {
            slug: "documents/prefix-collision",
            frontmatter: { case_slug: "legal/cases/2026-014" },
          },
        ],
        ctx
      ).map((r) => r.slug)
    ).toEqual(["documents/assigned"]);
  });

  test("matching prefix passes, non-matching prefix denies", () => {
    const ctx = ctxOf({ matterScope: ["legal/cases/2026-014"] });
    expect(isSlugInMatterScope("legal/cases/2026-014", ctx)).toBe(true);
    expect(isSlugInMatterScope("legal/cases/2026-099", ctx)).toBe(false);
    expect(
      matterScopeFilter([{ slug: "legal/cases/2026-014" }, { slug: "legal/cases/2026-099" }], ctx)
    ).toEqual([{ slug: "legal/cases/2026-014" }]);
  });

  test("case_slug frontmatter keeps assigned documents in matter scope", () => {
    const ctx = ctxOf({ matterScope: ["legal/cases/2026-014"] });
    expect(
      matterScopeFilter(
        [
          {
            slug: "documents/contract.pdf",
            frontmatter: { case_slug: "legal/cases/2026-014" },
          },
          {
            slug: "documents/other.pdf",
            frontmatter: { case_slug: "legal/cases/2026-099" },
          },
        ],
        ctx
      )
    ).toEqual([
      {
        slug: "documents/contract.pdf",
        frontmatter: { case_slug: "legal/cases/2026-014" },
      },
    ]);
  });
});

describe('get_page — matter-scope denial is indistinguishable from "not found"', () => {
  test("out-of-scope slug rejects with the SAME error code as a genuinely missing slug", async () => {
    const inScope = ctxOf({ matterScope: ["legal/cases/2026-014"] });
    const missing = ctxOf({ matterScope: "all" });

    let outOfScopeError: OperationError | undefined;
    try {
      await get_page.handler(inScope, { slug: "legal/cases/2026-099" });
    } catch (e) {
      outOfScopeError = e as OperationError;
    }

    let notFoundError: OperationError | undefined;
    try {
      await get_page.handler(missing, { slug: "legal/cases/does-not-exist" });
    } catch (e) {
      notFoundError = e as OperationError;
    }

    expect(outOfScopeError).toBeInstanceOf(OperationError);
    expect(notFoundError).toBeInstanceOf(OperationError);
    // Byte-identical error code — a caller cannot branch on this to learn
    // "exists but forbidden" vs "doesn't exist".
    expect(outOfScopeError!.code).toBe(notFoundError!.code);
    expect(outOfScopeError!.code).toBe("page_not_found");
  });

  test("in-scope slug is readable", async () => {
    const ctx = ctxOf({ matterScope: ["legal/cases/2026-014"] });
    const page: any = await get_page.handler(ctx, { slug: "legal/cases/2026-014" });
    expect(page.title).toBe("In-scope case");
  });

  test("assigned document outside the case slug tree is readable", async () => {
    await engine.putPage(
      "documents/mandate-agreement",
      {
        type: "legal_document",
        title: "Mandate agreement",
        compiled_truth: "Assigned matter document",
        frontmatter: { case_slug: "legal/cases/2026-014" },
      },
      { sourceId: "default" }
    );

    const ctx = ctxOf({ matterScope: ["legal/cases/2026-014"] });
    const page: any = await get_page.handler(ctx, { slug: "documents/mandate-agreement" });
    expect(page.title).toBe("Mandate agreement");
  });

  test('"all" scope reads everything regardless of slug', async () => {
    const ctx = ctxOf({ matterScope: "all" });
    const page: any = await get_page.handler(ctx, { slug: "legal/cases/2026-099" });
    expect(page.title).toBe("Out-of-scope case");
  });
});

describe("list_pages — matter documents remain visible only to their assigned case", () => {
  test("filters by frontmatter.case_slug, not only slug prefix", async () => {
    await engine.putPage(
      "documents/in-scope",
      {
        type: "legal_document",
        title: "In-scope document",
        compiled_truth: "alpha",
        frontmatter: { case_slug: "legal/cases/2026-014" },
      },
      { sourceId: "default" }
    );
    await engine.putPage(
      "documents/out-of-scope",
      {
        type: "legal_document",
        title: "Out-of-scope document",
        compiled_truth: "beta",
        frontmatter: { case_slug: "legal/cases/2026-099" },
      },
      { sourceId: "default" }
    );

    const pages = (await list_pages.handler(ctxOf({ matterScope: ["legal/cases/2026-014"] }), {
      include_frontmatter: true,
      limit: 20,
    })) as Array<{ slug: string }>;

    expect(pages.map((p) => p.slug)).toContain("documents/in-scope");
    expect(pages.map((p) => p.slug)).not.toContain("documents/out-of-scope");
  });
});

describe("search retrieval — assigned document chunks carry case_slug scope", () => {
  test("keyword results keep in-scope assigned documents and drop other matters", async () => {
    await importFromContent(
      engine,
      "documents/search-in-scope",
      `---\ntitle: Search in scope\ntype: legal_document\ncase_slug: legal/cases/2026-014\n---\n\nneedle-alpha searchable text`,
      { sourceId: "default", noEmbed: true }
    );
    await importFromContent(
      engine,
      "documents/search-out-of-scope",
      `---\ntitle: Search out of scope\ntype: legal_document\ncase_slug: legal/cases/2026-099\n---\n\nneedle-alpha searchable text`,
      { sourceId: "default", noEmbed: true }
    );

    const raw = await engine.searchKeyword("needle-alpha", { limit: 10, sourceId: "default" });
    const scoped = matterScopeFilter(raw, ctxOf({ matterScope: ["legal/cases/2026-014"] }));

    expect(raw.find((r) => r.slug === "documents/search-in-scope")?.case_slug).toBe(
      "legal/cases/2026-014"
    );
    expect(scoped.map((r) => r.slug)).toContain("documents/search-in-scope");
    expect(scoped.map((r) => r.slug)).not.toContain("documents/search-out-of-scope");
  });
});
