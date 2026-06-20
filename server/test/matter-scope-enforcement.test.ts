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
 * but unverifiable x-sigmabrain-identity-token must 403, not silently fall
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

let engine: PGLiteEngine;
const get_page = operations.find((o) => o.name === "get_page")!;

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

  test("matching prefix passes, non-matching prefix denies", () => {
    const ctx = ctxOf({ matterScope: ["legal/cases/2026-014"] });
    expect(isSlugInMatterScope("legal/cases/2026-014", ctx)).toBe(true);
    expect(isSlugInMatterScope("legal/cases/2026-099", ctx)).toBe(false);
    expect(
      matterScopeFilter([{ slug: "legal/cases/2026-014" }, { slug: "legal/cases/2026-099" }], ctx)
    ).toEqual([{ slug: "legal/cases/2026-014" }]);
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

  test('"all" scope reads everything regardless of slug', async () => {
    const ctx = ctxOf({ matterScope: "all" });
    const page: any = await get_page.handler(ctx, { slug: "legal/cases/2026-099" });
    expect(page.title).toBe("Out-of-scope case");
  });
});
