/**
 * In-memory stand-in for the engine's page HTTP API, close enough to the
 * real one for the automations tests:
 *   - listings return the page type in its own field and NOT in the
 *     frontmatter (the engine strips it), plus the first-write `created_at`;
 *   - POST with merge:true overlays the stored frontmatter, `null` deletes a
 *     key, an explicit `type` re-types the page;
 *   - DELETE soft-deletes; walls hide matters per `x-test-user`.
 */

export interface FakePage {
  slug: string;
  title: string;
  type: string;
  frontmatter: Record<string, unknown>;
  created_at: string;
  content?: string;
  deleted?: boolean;
}

export interface FakeEngine {
  pages: Map<string, FakePage>;
  writes: Array<{ slug: string; body: Record<string, unknown> }>;
  /** Matters a user is walled from. */
  walls: Map<string, string[]>;
  now: () => string;
  fetch: (url: string, init?: RequestInit) => Promise<Response>;
  put: (page: Omit<FakePage, "created_at"> & { created_at?: string }) => void;
}

export function createFakeEngine(baseUrl: string, now: () => string): FakeEngine {
  const pages = new Map<string, FakePage>();
  const writes: FakeEngine["writes"] = [];
  const walls = new Map<string, string[]>();

  const visible = (slug: string, headers: Record<string, string>) =>
    !(walls.get(headers["x-test-user"] ?? "") ?? []).includes(slug);

  const listed = (p: FakePage) => ({
    slug: p.slug,
    title: p.title,
    type: p.type,
    content: "",
    created_at: p.created_at,
    frontmatter: { ...p.frontmatter },
  });

  async function fakeFetch(url: string, init?: RequestInit): Promise<Response> {
    const u = new URL(String(url));
    if (!String(url).startsWith(baseUrl)) return new Response("unexpected", { status: 500 });
    const headers = (init?.headers ?? {}) as Record<string, string>;
    const method = init?.method ?? "GET";

    if (u.pathname === "/api/pages" && method === "GET") {
      const type = u.searchParams.get("type");
      const limit = Number(u.searchParams.get("limit") ?? 50);
      const offset = Number(u.searchParams.get("offset") ?? 0);
      const rows = [...pages.values()]
        .filter((p) => !p.deleted && (!type || p.type === type) && visible(p.slug, headers))
        .slice(offset, offset + limit)
        .map(listed);
      return Response.json(rows);
    }

    if (u.pathname === "/api/pages" && method === "POST") {
      const body = JSON.parse(String(init?.body)) as Record<string, unknown>;
      const slug = String(body.slug);
      writes.push({ slug, body });
      const existing = pages.get(slug);
      const merge = body.merge === true && existing && !existing.deleted;
      const fm: Record<string, unknown> = {
        ...(merge ? existing!.frontmatter : {}),
        ...((body.frontmatter as Record<string, unknown>) ?? {}),
      };
      const type = String(body.type ?? fm.type ?? (merge ? existing!.type : "concept"));
      delete fm.type;
      for (const k of Object.keys(fm)) if (fm[k] === null || fm[k] === undefined) delete fm[k];
      pages.set(slug, {
        slug,
        title: String(body.title ?? (merge ? existing!.title : slug)),
        type,
        frontmatter: fm,
        created_at: existing?.created_at ?? now(),
        content: body.content !== undefined ? String(body.content) : existing?.content,
      });
      return Response.json({ slug, success: true });
    }

    const m = /^\/api\/pages\/(.+)$/.exec(u.pathname);
    if (m) {
      const slug = decodeURIComponent(m[1]!);
      const page = pages.get(slug);
      if (!page || page.deleted || !visible(slug, headers)) {
        return new Response("not found", { status: 404 });
      }
      if (method === "DELETE") {
        page.deleted = true;
        return Response.json({ ok: true });
      }
      if (method === "GET") return Response.json(listed(page));
    }
    return new Response("unexpected", { status: 500 });
  }

  return {
    pages,
    writes,
    walls,
    now,
    fetch: fakeFetch,
    put: (p) => pages.set(p.slug, { created_at: now(), ...p }),
  };
}
