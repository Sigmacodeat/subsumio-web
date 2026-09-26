/* eslint-disable @typescript-eslint/no-explicit-any */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/lib/audit", () => ({ logAudit: vi.fn() }));
vi.mock("@/lib/auth/rate-limit", () => ({
  hit: vi.fn().mockResolvedValue({ ok: true, retryAfterSeconds: 0 }),
}));
vi.mock("@/lib/engine", async () => ({
  ENGINE_URL: "http://engine.test",
  engineConfigurationResponse: () => null,
  requireEngineContext: vi.fn(),
  recordQuota: vi.fn(),
}));

import { POST as checkout } from "./checkout/route";
import { POST as checkin } from "./checkin/route";
import { POST as release } from "./release/route";
import { GET as versions } from "./versions/route";
import { requireEngineContext } from "@/lib/engine";

const ctx = {
  headers: { "x-subsumio-source": "brain_a" },
  brainId: "brain_a",
  plan: "team",
  user: { id: "u1", email: "anwalt@kanzlei.example", role: "lawyer", name: "Anwalt" },
};

function post(handler: (req: NextRequest) => Promise<Response>, body: unknown) {
  return handler(
    new NextRequest("http://localhost:3000/api/legal/documents/x", {
      method: "POST",
      headers: { "content-type": "application/json", "x-csrf-token": "t", cookie: "sb_csrf=t" },
      body: JSON.stringify(body),
    })
  );
}

const docPage = (frontmatter: Record<string, unknown> = {}) => ({
  slug: "legal/akte-1/vertrag",
  title: "Vertrag",
  content: "Text",
  frontmatter,
});

let calls: Array<{ url: string; body: any }>;
function stubFetch(pageData: Record<string, unknown>) {
  calls = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: RequestInit) => {
      calls.push({ url, body: JSON.parse(String(init?.body ?? "{}")) });
      if (init?.body === undefined) {
        // Version listing vs. page read differ by query string.
        return Response.json(String(url).includes("slug_prefix") ? [] : pageData);
      }
      return Response.json({ success: true });
    })
  );
}
const writes = () => calls.filter((c) => Object.keys(c.body).length > 0);

describe("checkout", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(requireEngineContext).mockResolvedValue(ctx as any);
  });

  it("locks a free document for the caller", async () => {
    stubFetch(docPage());
    const res = await post(checkout, { slug: "legal/akte-1/vertrag" });
    expect(res.status).toBe(200);
    const fm = writes()[0].body.frontmatter;
    expect(fm.checked_out_by.userId).toBe("u1");
  });

  it("rejects checkout when another user holds the lock", async () => {
    stubFetch(docPage({ checked_out_by: { userId: "u2", userEmail: "k@k.at", at: "t" } }));
    const res = await post(checkout, { slug: "legal/akte-1/vertrag" });
    expect(res.status).toBe(409);
    expect(writes()).toHaveLength(0);
  });
});

describe("checkin", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(requireEngineContext).mockResolvedValue(ctx as any);
  });

  it("creates a document_version snapshot and clears the lock", async () => {
    stubFetch(docPage({ checked_out_by: { userId: "u1", userEmail: "a@k.at", at: "t" } }));
    const res = await post(checkin, { slug: "legal/akte-1/vertrag", note: "Entwurf" });
    expect(res.status).toBe(200);
    const snapshot = writes().find((w) => w.body.type === "document_version");
    expect(snapshot?.body.slug).toBe("legal/doc-versions/legal/akte-1/vertrag/v1");
    expect(snapshot?.body.frontmatter.doc_content).toBe("Text");
    const unlock = writes().at(-1);
    expect(unlock?.body.frontmatter.checked_out_by).toBeNull();
  });

  it("rejects checkin without a held lock", async () => {
    stubFetch(docPage());
    const res = await post(checkin, { slug: "legal/akte-1/vertrag" });
    expect(res.status).toBe(400);
  });
});

describe("release", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(requireEngineContext).mockResolvedValue(ctx as any);
  });

  it("rejects release by a non-owner, non-admin", async () => {
    stubFetch(docPage({ checked_out_by: { userId: "u2", userEmail: "k@k.at", at: "t" } }));
    const res = await post(release, { slug: "legal/akte-1/vertrag" });
    expect(res.status).toBe(409);
    expect(writes()).toHaveLength(0);
  });

  it("lets the owner release the lock", async () => {
    stubFetch(docPage({ checked_out_by: { userId: "u1", userEmail: "a@k.at", at: "t" } }));
    const res = await post(release, { slug: "legal/akte-1/vertrag" });
    expect(res.status).toBe(200);
  });
});

describe("versions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(requireEngineContext).mockResolvedValue(ctx as any);
  });

  it("check-in stamps the document's matter on the snapshot", async () => {
    stubFetch(
      docPage({
        case_slug: "legal/cases/akte-1",
        checked_out_by: { userId: "u1", userEmail: "a@k.at", at: "t" },
      })
    );
    const res = await post(checkin, { slug: "legal/akte-1/vertrag" });
    expect(res.status).toBe(200);
    const snapshot = writes().find((c) => c.body.type === "document_version")!;
    expect(snapshot.body.frontmatter.case_slug).toBe("legal/cases/akte-1");
    expect(snapshot.body.frontmatter.doc_frontmatter.case_slug).toBe("legal/cases/akte-1");
  });

  it("lists no versions of a document the caller cannot read", async () => {
    calls = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        calls.push({ url, body: {} });
        // The engine answers a document outside the caller's scope with 404.
        return String(url).includes("slug_prefix")
          ? Response.json([{ frontmatter: { doc_slug: "legal/akte-1/vertrag", version: 1 } }])
          : new Response("{}", { status: 404 });
      })
    );
    const res = await versions(
      new NextRequest(
        "http://localhost:3000/api/legal/documents/versions?slug=legal/akte-1/vertrag"
      )
    );
    expect(res.status).toBe(404);
    expect(calls.some((c) => c.url.includes("slug_prefix"))).toBe(false);
  });
});
