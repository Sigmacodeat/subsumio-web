// @vitest-environment node
// Two portal uploads into the same matter at the same time: both documents and
// both communication entries must remain on the matter.
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/auth/store", () => ({ getSharedPgPool: () => null }));
vi.mock("@/lib/auth/rate-limit", () => ({
  hit: vi.fn(async () => ({ ok: true, retryAfterSeconds: 0 })),
  clientIp: () => "203.0.113.9",
}));
vi.mock("@/lib/audit", () => ({ logAudit: vi.fn() }));
vi.mock("@/lib/realtime-bus", () => ({ broadcastSseEvent: vi.fn() }));
vi.mock("@/lib/portal-token", () => ({
  verifyPortalToken: vi.fn(async () => ({
    case_slug: "cases/a",
    brain_id: "brain_1",
    exp: Math.floor(Date.now() / 1000) + 3600,
  })),
  isPortalTokenSuperseded: () => false,
}));
vi.mock("@/lib/upload-pipeline", () => ({
  scanUploadWithDuplicateCheck: vi.fn(async (file: File) => ({
    ok: true,
    buffer: Buffer.from(await file.arrayBuffer()),
    cleanName: file.name,
    mimeType: "application/pdf",
  })),
}));
vi.mock("@/lib/duplicate-store", () => ({ brainDuplicateStore: () => ({}) }));
vi.mock("@/lib/engine-pages", () => ({ listEnginePages: vi.fn(async () => []) }));
vi.mock("@/lib/inbound-register-stamp", () => ({
  stampInboundEntryBestEffort: vi.fn(async () => undefined),
}));
vi.mock("@/lib/post-upload-outbox", () => ({
  enqueueAllPostUploadTasks: vi.fn(async () => undefined),
}));
vi.mock("@/lib/engine", async (orig) => ({
  ...(await orig<typeof import("@/lib/engine")>()),
  engineConfigurationResponse: () => null,
  ENGINE_URL: "http://engine.test",
  engineHeadersForBrain: (b: string) => ({ "x-subsumio-source": b }),
  enginePatchPage: vi.fn(async () => new Response("{}", { status: 200 })),
}));

import { POST } from "./route";

let caseFm: Record<string, unknown>;
let uploadCounter = 0;

beforeEach(() => {
  caseFm = { portal_enabled: true, status: "open", documents: [], communications: [] };
  uploadCounter = 0;
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: RequestInit) => {
      const u = String(url);
      if (u === "http://engine.test/api/upload") {
        const n = ++uploadCounter;
        // The first upload is slow: the second one finishes in between.
        await new Promise((r) => setTimeout(r, n === 1 ? 40 : 5));
        return new Response(JSON.stringify({ slug: `documents/upload-${n}`, title: `Datei ${n}` }));
      }
      if (u === "http://engine.test/api/pages" && init?.method === "POST") {
        const body = JSON.parse(String(init.body)) as {
          slug: string;
          frontmatter: Record<string, unknown>;
        };
        if (body.slug === "cases/a") {
          // Engine merge: top-level keys replace — like the real merge write.
          await new Promise((r) => setTimeout(r, 5));
          caseFm = { ...caseFm, ...body.frontmatter };
        }
        return new Response("{}", { status: 200 });
      }
      if (u.startsWith("http://engine.test/api/pages/")) {
        const slug = decodeURIComponent(u.replace("http://engine.test/api/pages/", ""));
        if (slug === "cases/a")
          return new Response(
            JSON.stringify({
              slug: "cases/a",
              title: "Akte A",
              frontmatter: structuredClone(caseFm),
            })
          );
      }
      return new Response("{}", { status: 404 });
    })
  );
});

function upload(name: string) {
  const form = new FormData();
  form.append("token", "tok");
  form.append("file", new File([`%PDF ${name}`], name, { type: "application/pdf" }));
  return POST(new Request("http://x/api/portal/upload", { method: "POST", body: form }) as never);
}

describe("POST /api/portal/upload", () => {
  it("two parallel uploads keep both documents and both communications", async () => {
    const [a, b] = await Promise.all([upload("a.pdf"), upload("b.pdf")]);
    expect(a.status).toBe(200);
    expect(b.status).toBe(200);
    const docs = (caseFm.documents as Array<{ slug: string }>).map((d) => d.slug).sort();
    expect(docs).toEqual(["documents/upload-1", "documents/upload-2"]);
    expect(caseFm.communications as unknown[]).toHaveLength(2);
  });
});
