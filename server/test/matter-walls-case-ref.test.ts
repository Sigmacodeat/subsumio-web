/**
 * Ethical walls for pages bound to a matter only through `case_ref` & co.
 *
 * The legal pipeline (burden-of-proof/…, people/<hash>-…, legal-drafts/…),
 * Wiedervorlagen, imports and mobile notes name their matter by `case_ref`,
 * `matter`, `case_slugs`, … — by slug, case number or title — not by
 * `case_slug` or the slug path. Every read path must resolve those references
 * (core/matter-binding.ts): a walled colleague sees none of these pages, an
 * allowed one does, and a reference that names no matter is hidden from
 * everyone who is walled from anything.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, test } from "bun:test";
import { PGLiteEngine } from "../src/core/pglite-engine.ts";
import { importFromContent } from "../src/core/import-file.ts";
import { operations, OperationError, type OperationContext } from "../src/core/operations.ts";
import {
  buildMatterIndex,
  canonicalCaseSlugFor,
  invalidateMatterIndex,
  pageBindingAllowed,
  pageMatterBinding,
  resolveMatterRef,
  scopeIsFirmWide,
  stampCaseSlugFrom,
  withCaseSlugStamp,
} from "../src/core/matter-binding.ts";
import { filterGatherByMatterScope } from "../src/core/think/index.ts";
import type { ThinkGatherResult } from "../src/core/think/gather.ts";
import { buildBrainTools } from "../src/core/minions/tools/brain-allowlist.ts";
import { dispatchToolCall } from "../src/mcp/dispatch.ts";
import { ladeFristenbuch } from "../src/core/legal/fristenbuch.ts";
import type { MatterScope } from "../src/core/matter-access.ts";
import type { GBrainConfig } from "../src/core/config.ts";
import type { ToolCtx, ToolDef } from "../src/core/minions/types.ts";

const WALLED_CASE = "legal/cases/walled";
const OPEN_CASE = "legal/cases/open";
const PRIVATE_DENY = "!chat-sessions/private/someone";
/** A colleague behind the wall of WALLED_CASE. */
const WALLED: MatterScope = ["*", `!${WALLED_CASE}`, PRIVATE_DENY];
/** Firm-wide visibility (every web caller denies colleagues' private chats). */
const FIRMWIDE: MatterScope = ["*", PRIVATE_DENY];
/** A client viewer of the walled matter only. */
const ONLY_WALLED: MatterScope = [WALLED_CASE];

/** Pages bound to the walled matter without case_slug, by every kind of reference. */
const WALLED_PAGES = [
  "burden-of-proof/legal/cases/walled", // case_ref = slug
  "people/abc123-mueller", // case_ref = case number
  "legal-drafts/by-title", // case_ref = matter title
  "notes/mobile-walled", // matter (soft) = title
  "cross-case/walled-and-open", // case_slugs = both matters
  "deadlines/wiedervorlage-walled", // matter_slug = slug below the matter
];
const OPEN_PAGE = "burden-of-proof/legal/cases/open";
const ORPHAN_PAGE = "legal-drafts/orphan"; // case_ref names no matter
const FREE_PAGE = "notes/booking"; // matter = free text, no matter

const config = { engine: "pglite" } as GBrainConfig;
let engine: PGLiteEngine;

const md = (fm: Record<string, unknown>, body: string) =>
  `---\n${Object.entries(fm)
    .map(([k, v]) => `${k}: ${JSON.stringify(v)}`)
    .join("\n")}\n---\n\n${body}\n`;

async function put(slug: string, fm: Record<string, unknown>, body: string) {
  await importFromContent(engine, slug, md(fm, body), { sourceId: "default", noEmbed: true });
}

function ctxOf(scope: MatterScope | undefined): OperationContext {
  return {
    engine: engine as never,
    config: {} as never,
    logger: console as never,
    dryRun: false,
    remote: true,
    sourceId: "default",
    ...(scope !== undefined ? { matterScope: scope } : {}),
  };
}

const op = (name: string) => operations.find((o) => o.name === name)!;

async function visibleViaGet(scope: MatterScope | undefined, slug: string): Promise<boolean> {
  try {
    await op("get_page").handler(ctxOf(scope), { slug });
    return true;
  } catch (e) {
    if (e instanceof OperationError && e.code === "page_not_found") return false;
    throw e;
  }
}

beforeAll(async () => {
  engine = new PGLiteEngine();
  await engine.connect({});
  await engine.initSchema();
  await put(
    WALLED_CASE,
    { type: "legal_case", title: "Zebra gegen Walled GmbH", case_number: "26-0001" },
    "Akte Walled"
  );
  await put(
    OPEN_CASE,
    { type: "legal_case", title: "Offene Akte Nord", case_number: "2026/101" },
    "Akte Open"
  );
  await put(
    "burden-of-proof/legal/cases/walled",
    { type: "burden_of_proof", case_ref: WALLED_CASE },
    "needlezeta Beweislast walled"
  );
  await put(
    "people/abc123-mueller",
    { type: "person", case_ref: "26 0001" },
    "needlezeta Müller Zeuge walled"
  );
  await put(
    "legal-drafts/by-title",
    { type: "legal_draft", case_ref: "Zebra gegen Walled GmbH" },
    "needlezeta Entwurf walled"
  );
  await put(
    "notes/mobile-walled",
    { type: "note", matter: "zebra gegen walled gmbh" },
    "needlezeta Notiz walled"
  );
  await put(
    "cross-case/walled-and-open",
    { type: "cross_case_matrix", case_slugs: [OPEN_CASE, WALLED_CASE] },
    "needlezeta Matrix beide"
  );
  await put(
    "deadlines/wiedervorlage-walled",
    { type: "deadline", matter_slug: `${WALLED_CASE}/fristen` },
    "needlezeta Wiedervorlage walled"
  );
  await put(
    OPEN_PAGE,
    { type: "burden_of_proof", case_ref: OPEN_CASE },
    "needlezeta Beweislast open"
  );
  await put(
    ORPHAN_PAGE,
    { type: "legal_draft", case_ref: "legal/cases/ghost" },
    "needlezeta Entwurf ohne Akte"
  );
  await put(FREE_PAGE, { type: "note", matter: "Scheidungsanfrage" }, "needlezeta Terminanfrage");
  await engine.setConfig("search.mcp_keyword_only", "true");
}, 120_000);

beforeEach(() => invalidateMatterIndex());

afterAll(async () => {
  await engine?.disconnect();
}, 60_000);

describe("resolution", () => {
  const index = buildMatterIndex([
    { slug: WALLED_CASE, title: "Zebra gegen Walled GmbH", numbers: ["26-0001"] },
    { slug: OPEN_CASE, title: "Offene Akte Nord", numbers: ["2026/101"] },
  ]);

  test("a reference is a slug, a path below a matter, a case number or a title", () => {
    expect(resolveMatterRef(index, WALLED_CASE)).toEqual([WALLED_CASE]);
    expect(resolveMatterRef(index, `${WALLED_CASE}/docs/x`)).toEqual([WALLED_CASE]);
    expect(resolveMatterRef(index, "26-0001")).toEqual([WALLED_CASE]);
    expect(resolveMatterRef(index, "260001")).toEqual([WALLED_CASE]);
    expect(resolveMatterRef(index, "2026/101")).toEqual([OPEN_CASE]);
    expect(resolveMatterRef(index, "Zebra gegen Walled GmbH")).toEqual([WALLED_CASE]);
    expect(resolveMatterRef(index, "legal/cases/ghost")).toEqual([]);
    expect(resolveMatterRef(index, "12")).toEqual([]);
  });

  test("hard references fail closed, soft ones bind only when they resolve", () => {
    expect(pageMatterBinding({ slug: "x", frontmatter: { case_ref: "nope" } }, index)).toEqual({
      matters: [],
      unresolved: ["nope"],
    });
    expect(pageMatterBinding({ slug: "x", frontmatter: { matter: "nope" } }, index)).toEqual({
      matters: [],
      unresolved: [],
    });
    expect(
      pageMatterBinding({ slug: "x", frontmatter: { matter: "Offene Akte Nord" } }, index).matters
    ).toEqual([OPEN_CASE]);
    // Without the database every reference but case_slug is unresolved.
    expect(
      pageMatterBinding({ slug: "x", frontmatter: { case_ref: OPEN_CASE } }).unresolved
    ).toEqual([OPEN_CASE]);
    // A case page is its own matter; its related matters do not bind it.
    expect(
      pageMatterBinding(
        { slug: OPEN_CASE, type: "legal_case", frontmatter: { related_case_slugs: [WALLED_CASE] } },
        index
      )
    ).toEqual({ matters: [], unresolved: [] });
  });

  test("the scope decision", () => {
    const unresolved = { matters: [], unresolved: ["nope"] };
    expect(scopeIsFirmWide(FIRMWIDE)).toBe(true);
    expect(scopeIsFirmWide(WALLED)).toBe(false);
    expect(scopeIsFirmWide(ONLY_WALLED)).toBe(false);
    expect(pageBindingAllowed(FIRMWIDE, "x", unresolved)).toBe(true);
    expect(pageBindingAllowed("all", "x", unresolved)).toBe(true);
    expect(pageBindingAllowed(WALLED, "x", unresolved)).toBe(false);
    expect(pageBindingAllowed(ONLY_WALLED, "x", unresolved)).toBe(false);
    const both = { matters: [OPEN_CASE, WALLED_CASE], unresolved: [] };
    expect(pageBindingAllowed(WALLED, "x", both)).toBe(false);
    expect(pageBindingAllowed(ONLY_WALLED, "x", both)).toBe(false);
    expect(pageBindingAllowed([OPEN_CASE, WALLED_CASE], "x", both)).toBe(true);
  });
});

describe("get_page", () => {
  test("a walled colleague reads every case_ref-bound page as not found", async () => {
    for (const slug of WALLED_PAGES) expect(await visibleViaGet(WALLED, slug)).toBe(false);
    expect(await visibleViaGet(WALLED, OPEN_PAGE)).toBe(true);
    expect(await visibleViaGet(WALLED, FREE_PAGE)).toBe(true);
  });

  test("an unresolvable reference is hidden from walled users, shown firm-wide", async () => {
    expect(await visibleViaGet(WALLED, ORPHAN_PAGE)).toBe(false);
    expect(await visibleViaGet(ONLY_WALLED, ORPHAN_PAGE)).toBe(false);
    expect(await visibleViaGet(FIRMWIDE, ORPHAN_PAGE)).toBe(true);
    expect(await visibleViaGet(undefined, ORPHAN_PAGE)).toBe(true);
  });

  test("a user allowed on the matter sees its pages", async () => {
    for (const slug of WALLED_PAGES.filter((s) => s !== "cross-case/walled-and-open")) {
      expect(await visibleViaGet(ONLY_WALLED, slug)).toBe(true);
    }
    // A page about two matters needs both.
    expect(await visibleViaGet(ONLY_WALLED, "cross-case/walled-and-open")).toBe(false);
    expect(await visibleViaGet([WALLED_CASE, OPEN_CASE], "cross-case/walled-and-open")).toBe(true);
    for (const slug of WALLED_PAGES) expect(await visibleViaGet(FIRMWIDE, slug)).toBe(true);
  });
});

describe("list_pages and search", () => {
  const listed = async (scope: MatterScope) =>
    ((await op("list_pages").handler(ctxOf(scope), { limit: 100 })) as Array<{ slug: string }>).map(
      (p) => p.slug
    );
  const searched = async (scope: MatterScope) =>
    (
      (await op("search").handler(ctxOf(scope), { query: "needlezeta", limit: 50 })) as Array<{
        slug: string;
      }>
    ).map((r) => r.slug);

  test("list_pages hides case_ref-bound pages from the walled colleague", async () => {
    const walled = await listed(WALLED);
    for (const slug of [...WALLED_PAGES, ORPHAN_PAGE]) expect(walled).not.toContain(slug);
    expect(walled).toContain(OPEN_PAGE);
    expect(walled).toContain(FREE_PAGE);
    const firmwide = await listed(FIRMWIDE);
    for (const slug of [...WALLED_PAGES, ORPHAN_PAGE, OPEN_PAGE]) expect(firmwide).toContain(slug);
  });

  test("search hits carry no walled page, whatever field binds it", async () => {
    const walled = await searched(WALLED);
    expect(walled).toContain(OPEN_PAGE);
    expect(walled).toContain(FREE_PAGE);
    for (const slug of [...WALLED_PAGES, ORPHAN_PAGE]) expect(walled).not.toContain(slug);
    const allowed = await searched(ONLY_WALLED);
    expect(allowed).toContain("burden-of-proof/legal/cases/walled");
    expect(allowed).toContain("people/abc123-mueller");
    expect(allowed).not.toContain(OPEN_PAGE);
    expect(allowed).not.toContain(ORPHAN_PAGE);
    const firmwide = await searched(FIRMWIDE);
    for (const slug of [...WALLED_PAGES, ORPHAN_PAGE]) expect(firmwide).toContain(slug);
  });

  test("a binding added after the search cache was filled still counts", async () => {
    await put("notes/late-bound", { type: "note" }, "needlezeta spät gebunden");
    expect(await searched(WALLED)).toContain("notes/late-bound");
    await put(
      "notes/late-bound",
      { type: "note", case_ref: "26-0001" },
      "needlezeta spät gebunden"
    );
    expect(await searched(WALLED)).not.toContain("notes/late-bound");
    await engine.softDeletePage("notes/late-bound");
  });
});

describe("think gather", () => {
  test("walled evidence, takes and graph slugs are dropped", async () => {
    const ids = new Map<string, number>();
    for (const slug of [...WALLED_PAGES, OPEN_PAGE, ORPHAN_PAGE]) {
      ids.set(slug, (await engine.getPage(slug))!.id);
    }
    const gather = {
      pages: [...ids].map(([slug, page_id]) => ({ slug, page_id }) as never),
      takes: [
        { page_id: ids.get("people/abc123-mueller")!, page_slug: "people/abc123-mueller" } as never,
        { page_id: ids.get(OPEN_PAGE)!, page_slug: OPEN_PAGE } as never,
      ],
      graphSlugs: ["legal-drafts/by-title", OPEN_PAGE, "legal/statutes/abgb/1"],
      diagnostics: {},
    } as unknown as ThinkGatherResult;
    const walled = await filterGatherByMatterScope(engine, gather, {
      matterScope: WALLED as string[],
      sourceId: "default",
    });
    expect(walled.pages.map((p) => p.slug)).toEqual([OPEN_PAGE]);
    expect(walled.takes.map((t) => t.page_slug)).toEqual([OPEN_PAGE]);
    expect(walled.graphSlugs).toEqual([OPEN_PAGE, "legal/statutes/abgb/1"]);
    const allowed = await filterGatherByMatterScope(engine, gather, {
      matterScope: ONLY_WALLED as string[],
      sourceId: "default",
    });
    expect(allowed.pages.map((p) => p.slug)).toContain("people/abc123-mueller");
    expect(allowed.pages.map((p) => p.slug)).not.toContain(ORPHAN_PAGE);
    const firmwide = await filterGatherByMatterScope(engine, gather, {
      matterScope: FIRMWIDE as string[],
      sourceId: "default",
    });
    expect(firmwide.pages).toHaveLength(gather.pages.length);
  });
});

describe("agent tools and MCP", () => {
  const tools = (scope: MatterScope) =>
    buildBrainTools({ subagentId: 9, engine, config, matterScope: scope });
  const tool = (defs: ToolDef[], name: string) => defs.find((d) => d.name === `brain_${name}`)!;
  const ctx = (): ToolCtx => ({ engine, jobId: 1, remote: true });

  test("a walled job's brain tools never return a case_ref-bound page", async () => {
    const t = tools(WALLED);
    for (const slug of [...WALLED_PAGES, ORPHAN_PAGE]) {
      await expect(tool(t, "get_page").execute({ slug }, ctx())).rejects.toBeInstanceOf(
        OperationError
      );
    }
    const found = (await tool(t, "search").execute({ query: "needlezeta" }, ctx())) as Array<{
      slug: string;
    }>;
    expect(found.map((r) => r.slug)).toContain(OPEN_PAGE);
    for (const slug of WALLED_PAGES) expect(found.map((r) => r.slug)).not.toContain(slug);
    const listed = (await tool(t, "list_pages").execute({ limit: 100 }, ctx())) as Array<{
      slug: string;
    }>;
    for (const slug of WALLED_PAGES) expect(listed.map((p) => p.slug)).not.toContain(slug);
    // An allowed job sees them.
    const allowed = tools(ONLY_WALLED);
    const page = (await tool(allowed, "get_page").execute(
      { slug: "people/abc123-mueller" },
      ctx()
    )) as { slug: string };
    expect(page.slug).toBe("people/abc123-mueller");
  });

  test("a walled job may not write a page claiming the walled matter by case_ref", async () => {
    const putPage = tool(tools(WALLED), "put_page");
    await expect(
      putPage.execute(
        { slug: "wiki/agents/9/sneak", content: md({ title: "x", case_ref: "26-0001" }, "b") },
        ctx()
      )
    ).rejects.toMatchObject({ code: "page_not_found" });
    expect(await engine.getPage("wiki/agents/9/sneak")).toBeNull();
  });

  test("an MCP token bound to a walled user reads the same", async () => {
    const call = (name: string, params: Record<string, unknown>) =>
      dispatchToolCall(engine, name, params, {
        remote: true,
        sourceId: "default",
        matterScope: WALLED,
        matterGuard: { scope: WALLED, readOnly: [] },
      });
    for (const slug of WALLED_PAGES) {
      expect((await call("get_page", { slug })).isError).toBe(true);
    }
    expect((await call("get_page", { slug: OPEN_PAGE })).isError).toBeFalsy();
    const res = await call("search", { query: "needlezeta", limit: 50 });
    const slugs = (JSON.parse(res.content[0]!.text) as Array<{ slug: string }>).map((r) => r.slug);
    expect(slugs).toContain(OPEN_PAGE);
    for (const slug of [...WALLED_PAGES, ORPHAN_PAGE]) expect(slugs).not.toContain(slug);
  });
});

describe("Fristenbuch", () => {
  test("a calendar bound to the walled matter by case_ref is left out", async () => {
    await put(
      "deadline-calendars/legal/cases/open-alias",
      { type: "deadline_calendar", case_ref: "26-0001" },
      "| Datum | Ampel | Frist | Rechtsgrundlage | Folge | Beleg |\n" +
        "|---|---|---|---|---|---|\n" +
        "| 01.10.2026 | rot | Klagebeantwortung | § 230 ZPO | Versäumung | ON 1 |"
    );
    const cases = async (scope: MatterScope) =>
      (await ladeFristenbuch(engine, { heute: "2026-09-23", matterScope: scope })).eintraege.map(
        (e) => e.case_slug
      );
    expect(await cases(FIRMWIDE)).toContain("legal/cases/open-alias");
    expect(await cases(WALLED)).not.toContain("legal/cases/open-alias");
    await engine.softDeletePage("deadline-calendars/legal/cases/open-alias");
  });
});

describe("writers", () => {
  test("stampCaseSlugFrom stamps only pages naming the writer's matter", () => {
    expect(
      stampCaseSlugFrom({ type: "note", frontmatter: { case_ref: WALLED_CASE } }, WALLED_CASE)
        .frontmatter
    ).toEqual({ case_ref: WALLED_CASE, case_slug: WALLED_CASE });
    const other = { type: "note", frontmatter: { case_ref: OPEN_CASE } };
    expect(stampCaseSlugFrom(other, WALLED_CASE)).toBe(other);
    const casePage = { type: "legal_case", frontmatter: { case_ref: WALLED_CASE } };
    expect(stampCaseSlugFrom(casePage, WALLED_CASE)).toBe(casePage);
  });

  test("the pipeline's engine stamps case_slug on its case_ref pages", async () => {
    const stamped = withCaseSlugStamp(engine, OPEN_CASE);
    await stamped.putPage("counter-arguments/legal/cases/open", {
      type: "counter_arguments" as never,
      title: "Gegenargumente",
      compiled_truth: "x",
      frontmatter: { case_ref: OPEN_CASE },
    });
    await stamped.transaction(async (tx) => {
      await tx.putPage("people/open-hash-zeuge", {
        type: "person" as never,
        title: "Zeuge",
        compiled_truth: "y",
        frontmatter: { case_ref: OPEN_CASE },
      });
    });
    expect(
      (await engine.getPage("counter-arguments/legal/cases/open"))!.frontmatter.case_slug
    ).toBe(OPEN_CASE);
    expect((await engine.getPage("people/open-hash-zeuge"))!.frontmatter.case_slug).toBe(OPEN_CASE);
    // Other methods pass through to the engine.
    expect((await stamped.getPage(OPEN_CASE))!.slug).toBe(OPEN_CASE);
  });

  test("canonicalCaseSlugFor names the one matter all references resolve to", () => {
    const index = buildMatterIndex([
      { slug: WALLED_CASE, title: "Zebra gegen Walled GmbH", numbers: ["26-0001"] },
      { slug: OPEN_CASE, numbers: ["2026/101"] },
    ]);
    expect(canonicalCaseSlugFor({ frontmatter: { case_ref: "26-0001" } }, index)).toBe(WALLED_CASE);
    expect(canonicalCaseSlugFor({ frontmatter: { case_ref: "ghost" } }, index)).toBeUndefined();
    expect(
      canonicalCaseSlugFor({ frontmatter: { case_slugs: [WALLED_CASE, OPEN_CASE] } }, index)
    ).toBeUndefined();
    expect(
      canonicalCaseSlugFor({ frontmatter: { case_ref: "26-0001", case_slug: OPEN_CASE } }, index)
    ).toBeUndefined();
  });
});
