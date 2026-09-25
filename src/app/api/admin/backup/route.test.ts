// @vitest-environment node
import type { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/engine", () => ({ ENGINE_URL: "http://engine.test" }));
vi.mock("@/lib/api-handler", () => ({
  createHandler: (_opts: unknown, handler: (ctx: unknown) => Promise<Response>) => async () =>
    handler({ headers: { "x-subsumio-source": "b1" }, user: { id: "u1", email: "ops@test" } }),
  apiError: (code: string, message: string, status: number) =>
    Response.json({ error: message, code }, { status }),
}));
const createBackup = vi.fn(async (pages: unknown[], _by: string, completeness?: unknown) => ({
  id: "b",
  totalPages: pages.length,
  ...(completeness as object),
}));
vi.mock("@/lib/backup", () => ({
  createBackup: (...args: [unknown[], string, unknown]) => createBackup(...args),
  listBackups: vi.fn(),
  getBackupStats: vi.fn(),
}));

import { POST } from "./route";

let engineUp: boolean;

beforeEach(() => {
  createBackup.mockClear();
  engineUp = true;
  const pages = [
    { slug: "akten/a-1", title: "A 1", type: "case", frontmatter: {} },
    {
      slug: "legal/settings/kanzlei",
      title: "Kanzlei",
      type: "kanzlei_settings",
      frontmatter: { smtpPasswordEnc: "cipher", smtpPassword: "klartext" },
    },
    { slug: "notizen/n-1", title: "N 1", type: "note", frontmatter: {} },
  ];
  global.fetch = vi.fn(async (input: RequestInfo | URL) => {
    if (!engineUp) return new Response("down", { status: 503 });
    const url = new URL(String(input));
    if (url.pathname === "/api/stats") return Response.json({ total_pages: 3 });
    if (url.pathname === "/api/pages") {
      const offset = Number(url.searchParams.get("offset"));
      return Response.json(offset === 0 ? pages.map((p) => ({ ...p, content: "" })) : []);
    }
    const slug = decodeURIComponent(url.pathname.slice("/api/pages/".length));
    return Response.json({ slug, content: `Text von ${slug}` });
  }) as unknown as typeof fetch;
});

async function run() {
  return POST(new Request("http://x/api/admin/backup") as unknown as NextRequest);
}

describe("POST /api/admin/backup (ENG-7)", () => {
  it("stores every entry with its text, secrets removed, flagged complete", async () => {
    const res = await run();
    expect(res.status).toBe(200);
    const [stored, by, completeness] = createBackup.mock.calls[0] as unknown as [
      Array<Record<string, unknown>>,
      string,
      Record<string, unknown>,
    ];
    expect(by).toBe("ops@test");
    expect(stored.map((p) => p.content)).toEqual([
      "Text von akten/a-1",
      "Text von legal/settings/kanzlei",
      "Text von notizen/n-1",
    ]);
    const settings = stored.find((p) => p.slug === "legal/settings/kanzlei")!;
    const fm = settings.frontmatter as Record<string, unknown>;
    expect(fm.smtpPasswordEnc).toBeUndefined();
    expect(fm.smtpPassword).toBeUndefined();
    expect(completeness).toMatchObject({ complete: true, truncated: false, total_pages: 3 });
  });

  it("answers with an error instead of an empty backup when the engine is down", async () => {
    engineUp = false;
    const res = await run();
    expect(res.status).toBe(502);
    expect(createBackup).not.toHaveBeenCalled();
  });
});
