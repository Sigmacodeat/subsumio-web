// @vitest-environment node
//
// Two overlapping drain runs (the cron fires every 2 minutes, a run can take
// longer) analyse a pending document exactly once, and a paid task is leased
// before it runs.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const patches = vi.hoisted(
  () => [] as Array<{ slug: string; type?: string; frontmatter?: Record<string, unknown> }>
);
const tasks = vi.hoisted(() => [] as Array<Record<string, unknown>>);

vi.mock("@/lib/api-handler", () => ({
  createCronHandler: (h: (req: NextRequest) => Promise<Response>) => h,
}));
vi.mock("@/lib/auth/store", () => ({ getSharedPgPool: () => null }));
vi.mock("@/lib/env", () => ({
  env: (k: string) => (k === "SUBSUMIO_INTERNAL_SECRET" ? "secret" : undefined),
}));
vi.mock("@/lib/cron-utils", () => ({
  getRecipientsByBrain: async () => new Map([["brain_a", [{ id: "u1" }]]]),
  mapWithConcurrency: async <T, R>(items: T[], fn: (t: T) => Promise<R>) =>
    Promise.allSettled(items.map(fn)),
}));
vi.mock("@/lib/engine", () => ({
  ENGINE_URL: "http://engine",
  engineHeadersForBrain: () => ({}),
  enginePatchPage: async (
    _h: unknown,
    body: { slug: string; type?: string; frontmatter?: Record<string, unknown> }
  ) => {
    patches.push(body);
    return new Response("{}", { status: 200 });
  },
}));
vi.mock("@/lib/engine-pages", () => ({ listEnginePages: async () => tasks }));
vi.mock("@/lib/case-documents", async (orig) => orig());
vi.mock("@/lib/inbound-register-stamp", () => ({ stampInboundEntry: vi.fn() }));
vi.mock("@/lib/logger", () => ({
  logger: () => ({ error: vi.fn(), info: vi.fn(), warn: vi.fn() }),
}));

import { GET } from "./route";

let analyzeCalls: Array<Record<string, unknown>> = [];
let releaseAnalyze: () => void = () => {};

beforeEach(() => {
  patches.length = 0;
  tasks.length = 0;
  analyzeCalls = [];
  tasks.push({
    slug: "legal/post-upload-tasks/analyze/doc-1",
    frontmatter: {
      doc_slug: "documents/doc-1",
      brain_id: "brain_a",
      task_type: "analyze",
      attempts: 0,
      status: "pending",
      owner_id: "org-1",
      owner_type: "org",
    },
  });
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: RequestInit) => {
      const u = String(url);
      if (u.startsWith("http://engine/api/pages/")) {
        return Response.json({
          frontmatter: { extraction_status: "ready", embedding_status: "done" },
        });
      }
      if (u.endsWith("/api/legal/analyze")) {
        analyzeCalls.push(JSON.parse(String(init?.body)));
        await new Promise<void>((r) => (releaseAnalyze = r));
        return Response.json({ ok: true });
      }
      return new Response("unexpected", { status: 500 });
    })
  );
});

const run = () =>
  (GET as unknown as (r: NextRequest) => Promise<Response>)(
    new NextRequest("http://app/api/cron/post-upload-drain")
  ).then((r) => r.json() as Promise<Record<string, unknown>>);

describe("post-upload drain — overlapping runs", () => {
  it("two parallel runs call the analysis exactly once", async () => {
    const first = run();
    await vi.waitFor(() => expect(analyzeCalls).toHaveLength(1));
    const second = await run();
    expect(second.skipped).toBe("already_running");
    releaseAnalyze();
    const out = await first;
    expect(out.done).toBe(1);
    expect(analyzeCalls).toHaveLength(1);
  });

  it("leases the task before the paid call and books it on the uploading firm", async () => {
    const first = run();
    await vi.waitFor(() => expect(analyzeCalls).toHaveLength(1));
    expect(patches[0]!.frontmatter?.lease_until).toBeTruthy();
    expect(analyzeCalls[0]).toMatchObject({
      owner_id: "org-1",
      owner_type: "org",
      retry_owner: "outbox",
    });
    releaseAnalyze();
    await first;
  });

  it("a budget stop keeps the task pending without burning an attempt", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) =>
        String(url).startsWith("http://engine/api/pages/")
          ? Response.json({ frontmatter: { extraction_status: "ready" } })
          : new Response("{}", { status: 429 })
      )
    );
    const out = await run();
    expect(out.blocked).toBe(1);
    const last = patches[patches.length - 1]!;
    expect(last.frontmatter?.status).toBe("pending");
    expect(last.frontmatter).not.toHaveProperty("attempts");
    expect(last.frontmatter?.last_error).toBe("internal_analysis_budget_exhausted");
  });
});

describe("post-upload drain — embeddings", () => {
  it("the analysis runs although embeddings are still pending (it reads the text)", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, init?: RequestInit) => {
        if (String(url).startsWith("http://engine/api/pages/")) {
          return Response.json({
            frontmatter: { extraction_status: "ready", embedding_status: "pending" },
          });
        }
        analyzeCalls.push(JSON.parse(String(init?.body)));
        return Response.json({ ok: true });
      })
    );
    const out = await run();
    expect(out.done).toBe(1);
    expect(analyzeCalls).toHaveLength(1);
  });

  it("a contradiction probe waits for embeddings, but not longer than 30 minutes", async () => {
    const task = (uploadedMinutesAgo: number) => ({
      slug: `legal/post-upload-tasks/contradiction/doc-${uploadedMinutesAgo}`,
      frontmatter: {
        doc_slug: "documents/doc-1",
        case_slug: "legal/cases/m1",
        brain_id: "brain_a",
        task_type: "contradiction",
        attempts: 0,
        status: "pending",
        uploaded_at: new Date(Date.now() - uploadedMinutesAgo * 60_000).toISOString(),
      },
    });
    tasks.length = 0;
    tasks.push(task(5), task(45));
    const probes: string[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        if (String(url).startsWith("http://engine/api/pages/")) {
          return Response.json({
            frontmatter: { extraction_status: "ready", embedding_status: "pending" },
          });
        }
        probes.push(String(url));
        return Response.json({ ok: true });
      })
    );
    const out = await run();
    expect(probes).toHaveLength(1); // only the 45-minute-old one
    expect(out.done).toBe(1);
    const waiting = patches.find((p) => p.slug.endsWith("doc-5"));
    expect(waiting?.frontmatter?.last_error).toBe("waiting_for_embedding_pending");
  });
});

describe("post-upload drain — terminal states reach the document", () => {
  it("after the last failed attempt the document shows 'failed' and the retry cron takes over", async () => {
    (tasks[0]!.frontmatter as Record<string, unknown>).attempts = 3; // MAX_ATTEMPTS - 1
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) =>
        String(url).startsWith("http://engine/api/pages/")
          ? Response.json({ frontmatter: { extraction_status: "ready" } })
          : new Response("{}", { status: 502 })
      )
    );
    const out = await run();
    expect(out.exhausted).toBe(1);
    const docPatch = patches.find((p) => p.slug === "documents/doc-1");
    expect(docPatch?.frontmatter).toMatchObject({
      analysis_status: "failed",
      analysis_retry_owner: "cron",
    });
    expect(String(docPatch?.frontmatter?.analysis_error)).toContain("502");
  });

  it("a document that can never be analysed is marked blocked with the reason", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => Response.json({ frontmatter: { extraction_status: "failed" } }))
    );
    const out = await run();
    expect(out.blocked).toBe(1);
    const docPatch = patches.find((p) => p.slug === "documents/doc-1");
    expect(docPatch?.frontmatter).toMatchObject({
      analysis_status: "blocked",
      analysis_error: "blocked_extraction_failed",
    });
  });
});
