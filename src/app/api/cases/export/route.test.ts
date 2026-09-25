// @vitest-environment node
import { describe, test, expect, vi, beforeEach } from "vitest";
import JSZip from "jszip";

vi.mock("@/lib/engine", () => ({ ENGINE_URL: "http://engine-test:3001" }));

vi.mock("@/lib/api-handler", () => ({
  createHandler:
    (_opts: unknown, handler: (ctx: unknown, body: unknown, query: unknown) => Promise<Response>) =>
    async (req: Request) => {
      const ctx = {
        headers: { Authorization: "Bearer test" },
        brainId: "b",
        user: { id: "u", email: "a@b.at" },
      };
      const slug = new URL(req.url).searchParams.get("slug") ?? "";
      return handler(ctx, undefined, { slug });
    },
  apiError: (code: string, message: string, status: number) =>
    Response.json({ error: message, code }, { status }),
}));

global.fetch = vi.fn() as unknown as typeof fetch;
const fetchMock = global.fetch as ReturnType<typeof vi.fn>;

import { GET } from "./route";
import { uniqueZipPath } from "@/lib/case-export";

const CASE = "legal/cases/akte-1";

interface EngineOpts {
  documents: Array<{ slug: string; name: string }>;
  listed?: Array<{ slug: string; title: string; frontmatter: Record<string, unknown> }>;
  listStatus?: number;
  fileSize?: number;
  contentLength?: number;
}

function engine(opts: EngineOpts) {
  fetchMock.mockImplementation(async (url: string) => {
    if (url.includes("/api/pages/legal/cases/")) {
      return Response.json({
        slug: CASE,
        title: "Akte 1",
        frontmatter: { documents: opts.documents },
      });
    }
    if (url.includes("/api/pages?")) {
      if (opts.listStatus) return new Response("{}", { status: opts.listStatus });
      const offset = Number(new URL(url).searchParams.get("offset") ?? "0");
      return Response.json(offset === 0 ? (opts.listed ?? []) : []);
    }
    if (url.includes("/api/files/")) {
      const headers: Record<string, string> = {};
      if (opts.contentLength) headers["content-length"] = String(opts.contentLength);
      return new Response(new Uint8Array(opts.fileSize ?? 4), { status: 200, headers });
    }
    return new Response("not found", { status: 404 });
  });
}

async function exportZip() {
  const res = await GET(
    new Request(`http://localhost/api/cases/export?slug=${encodeURIComponent(CASE)}`) as never
  );
  expect(res.status).toBe(200);
  const zip = await JSZip.loadAsync(await res.arrayBuffer());
  const manifest = JSON.parse(await zip.file("export-manifest.json")!.async("string"));
  return { zip, manifest };
}

describe("uniqueZipPath", () => {
  test("gives every duplicate its own name and terminates", () => {
    const used = new Set<string>();
    const paths: string[] = [];
    for (let i = 0; i < 5; i++) {
      const p = uniqueZipPath("scan.pdf", used);
      used.add(p);
      paths.push(p);
    }
    expect(new Set(paths).size).toBe(5);
    expect(paths.slice(0, 3)).toEqual([
      "dokumente/scan.pdf",
      "dokumente/scan_1.pdf",
      "dokumente/scan_2.pdf",
    ]);
  });
});

describe("GET /api/cases/export", () => {
  beforeEach(() => {
    fetchMock.mockReset();
  });

  test("three documents with the same name land under three paths", async () => {
    engine({
      documents: [
        { slug: "docs/a", name: "scan.pdf" },
        { slug: "docs/b", name: "scan.pdf" },
        { slug: "docs/c", name: "scan.pdf" },
      ],
    });
    const started = Date.now();
    const { zip, manifest } = await exportZip();
    expect(Date.now() - started).toBeLessThan(1000);
    const files = Object.keys(zip.files).filter(
      (f) => f.startsWith("dokumente/") && !zip.files[f]!.dir
    );
    expect(files.sort()).toEqual([
      "dokumente/scan.pdf",
      "dokumente/scan_1.pdf",
      "dokumente/scan_2.pdf",
    ]);
    expect(manifest.complete).toBe(true);
  });

  test("more than 500 documents: the rest is listed as skipped, not complete", async () => {
    const documents = Array.from({ length: 501 }, (_, i) => ({
      slug: `docs/d${i}`,
      name: `d${i}.pdf`,
    }));
    engine({ documents });
    const { manifest } = await exportZip();
    expect(manifest.complete).toBe(false);
    expect(manifest.documents_included).toBe(500);
    const limited = manifest.documents_skipped.filter(
      (s: { reason: string }) => s.reason === "export_item_limit"
    );
    expect(limited).toHaveLength(1);
  });

  test("an oversized file is skipped from its declared length without being read", async () => {
    engine({
      documents: [{ slug: "docs/big", name: "big.pdf" }],
      fileSize: 4,
      contentLength: 200 * 1024 * 1024,
    });
    const { manifest } = await exportZip();
    expect(manifest.documents_skipped).toEqual([{ name: "big.pdf", reason: "file_too_large" }]);
    expect(manifest.complete).toBe(false);
  });

  test("documents linked only by case_slug are exported; removed/deleted ones are not", async () => {
    engine({
      documents: [
        { slug: "docs/kept", name: "kept.pdf" },
        { slug: "docs/removed", name: "removed.pdf" },
        { slug: "docs/deleted", name: "deleted.pdf" },
      ],
      listed: [
        { slug: "docs/kept", title: "kept", frontmatter: { case_slug: CASE } },
        { slug: "docs/removed", title: "removed", frontmatter: { case_slug: null } },
        {
          slug: "docs/deleted",
          title: "deleted",
          frontmatter: { case_slug: CASE, status: "tombstoned" },
        },
        {
          slug: "docs/linked-only",
          title: "Nachgereicht",
          frontmatter: { case_slug: CASE, source_filename: "nachgereicht.pdf" },
        },
      ],
    });
    const { zip, manifest } = await exportZip();
    const files = Object.keys(zip.files).filter(
      (f) => f.startsWith("dokumente/") && !zip.files[f]!.dir
    );
    expect(files.sort()).toEqual(["dokumente/kept.pdf", "dokumente/nachgereicht.pdf"]);
    expect(manifest.documents_total).toBe(2);
    expect(manifest.complete).toBe(true);
  });

  test("a failed document listing marks the export incomplete", async () => {
    engine({ documents: [{ slug: "docs/a", name: "a.pdf" }], listStatus: 500 });
    const { manifest } = await exportZip();
    expect(manifest.document_listing_failed).toBe(true);
    expect(manifest.complete).toBe(false);
  });
});
