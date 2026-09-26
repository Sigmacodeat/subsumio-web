// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const m = vi.hoisted(() => ({
  pages: [] as Array<{ slug: string; frontmatter: Record<string, unknown> }>,
  patches: [] as Array<{ slug: string; frontmatter: Record<string, unknown> }>,
}));

vi.mock("@/lib/engine", () => ({
  ENGINE_URL: "http://engine.test",
  engineHeadersForBrain: () => ({}),
  enginePatchPage: vi.fn(
    async (_h: unknown, p: { slug: string; frontmatter: Record<string, unknown> }) => {
      m.patches.push(p);
      const page = m.pages.find((x) => x.slug === p.slug);
      if (page) Object.assign(page.frontmatter, p.frontmatter);
      return new Response("{}", { status: 200 });
    }
  ),
}));
vi.mock("@/lib/engine-pages", () => ({
  listEnginePages: vi.fn(async () => m.pages),
}));

import { pullOutlookEvents } from "./graph-user-sync";

const owner = { email: "anwalt@kanzlei.at", userId: "u1" };
const window = { start: new Date("2026-10-01T00:00:00Z"), end: new Date("2026-12-01T00:00:00Z") };
const ev = (id: string) => ({
  id,
  subject: id,
  start: { dateTime: "2026-10-20T09:00:00.0000000", timeZone: "Europe/Vienna" },
  end: { dateTime: "2026-10-20T10:00:00.0000000", timeZone: "Europe/Vienna" },
});
let graph: () => Response;

beforeEach(() => {
  m.pages = [];
  m.patches = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: string, init?: RequestInit) => {
      const url = String(input);
      if (url.startsWith("https://graph.microsoft.com")) return graph();
      // Engine upsert of a pulled event: keep it as a stored page.
      const page = JSON.parse(String(init?.body));
      m.pages = m.pages.filter((p) => p.slug !== page.slug);
      m.pages.push({ slug: page.slug, frontmatter: { ...page.frontmatter } });
      return new Response("{}", { status: 200 });
    })
  );
});
afterEach(() => vi.unstubAllGlobals());

describe("Outlook deletions reach Subsumio (R8-6)", () => {
  it("an event missing from the next complete pull is marked deleted", async () => {
    graph = () => Response.json({ value: [ev("A"), ev("B")] });
    await pullOutlookEvents("tok", {}, owner, window);
    expect(m.pages).toHaveLength(2);

    graph = () => Response.json({ value: [ev("A")] });
    const second = await pullOutlookEvents("tok", {}, owner, window);
    expect(second.removed).toBe(1);
    const b = m.pages.find((p) => p.slug.endsWith("/B"))!;
    const a = m.pages.find((p) => p.slug.endsWith("/A"))!;
    expect(b.frontmatter.cancelled).toBe(true);
    expect(a.frontmatter.cancelled).toBe(false);
  });

  it("a failed pull marks nothing", async () => {
    graph = () => Response.json({ value: [ev("A"), ev("B")] });
    await pullOutlookEvents("tok", {}, owner, window);
    graph = () => new Response("down", { status: 503 });
    await expect(pullOutlookEvents("tok", {}, owner, window)).rejects.toThrow();
    expect(m.patches).toHaveLength(0);
  });

  it("another mailbox's events are left alone", async () => {
    m.pages.push({
      slug: "calendar/outlook/kollegin@kanzlei.at/X",
      frontmatter: { outlook_event_id: "X", start: "2026-10-20T09:00:00" },
    });
    graph = () => Response.json({ value: [] });
    const out = await pullOutlookEvents("tok", {}, owner, window);
    expect(out.removed).toBe(0);
    expect(m.patches).toHaveLength(0);
  });
});
