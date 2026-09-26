// @vitest-environment node
//
// Analysis retry cron: a document stuck "retrying" (the run died) is picked
// up again; without the "retrying" mark no paid analysis starts; failures
// the upload outbox still owns are left to it.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const docs = vi.hoisted(() => [] as Array<Record<string, unknown>>);
const patchStatus = vi.hoisted(() => ({ value: 200 }));
const patches = vi.hoisted(() => [] as Array<Record<string, unknown>>);

vi.mock("@/lib/api-handler", () => ({
  createCronHandler: (h: (req: NextRequest) => Promise<Response>) => h,
}));
vi.mock("@/lib/env", () => ({
  env: (k: string) => (k === "SUBSUMIO_INTERNAL_SECRET" ? "secret" : undefined),
}));
vi.mock("@/lib/cron-utils", () => ({
  getRecipientsByBrain: async () => new Map([["brain_a", [{ id: "u1" }]]]),
}));
vi.mock("@/lib/engine-pages", () => ({ listEnginePages: async () => docs }));
vi.mock("@/lib/engine", () => ({
  engineHeadersForBrain: () => ({}),
  enginePatchPage: async (_h: unknown, body: Record<string, unknown>) => {
    patches.push(body);
    return new Response("{}", { status: patchStatus.value });
  },
}));

import { GET } from "./route";

let analyzeCalls = 0;
const hoursAgo = (h: number) => new Date(Date.now() - h * 3_600_000).toISOString();

beforeEach(() => {
  docs.length = 0;
  patches.length = 0;
  patchStatus.value = 200;
  analyzeCalls = 0;
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => {
      analyzeCalls++;
      return Response.json({ ok: true });
    })
  );
});

const run = async () =>
  (await (GET as unknown as (r: NextRequest) => Promise<Response>)(
    new NextRequest("http://app/api/cron/analysis-retry")
  ).then((r) => r.json())) as Record<string, unknown>;

describe("analysis-retry cron", () => {
  it("a document 'retrying' for over 30 minutes is retried again", async () => {
    docs.push({
      slug: "documents/d1",
      frontmatter: {
        analysis_status: "retrying",
        analysis_retry_count: 1,
        analysis_retry_at: hoursAgo(2),
        analysis_failed_at: hoursAgo(6),
      },
    });
    const out = await run();
    expect(out.retried).toBe(1);
    expect(analyzeCalls).toBe(1);
  });

  it("a fresh 'retrying' document is left to the running retry", async () => {
    docs.push({
      slug: "documents/d1",
      frontmatter: {
        analysis_status: "retrying",
        analysis_retry_count: 1,
        analysis_retry_at: new Date().toISOString(),
        analysis_failed_at: hoursAgo(6),
      },
    });
    await run();
    expect(analyzeCalls).toBe(0);
  });

  it("a failed 'retrying' mark starts no analysis", async () => {
    docs.push({
      slug: "documents/d1",
      frontmatter: { analysis_status: "failed", analysis_failed_at: hoursAgo(2) },
    });
    patchStatus.value = 503;
    const out = await run();
    expect(analyzeCalls).toBe(0);
    expect(String((out.errors as string[])[0])).toContain("HTTP 503");
  });

  it("a failure the upload outbox still retries is not retried here", async () => {
    docs.push({
      slug: "documents/d1",
      frontmatter: {
        analysis_status: "failed",
        analysis_failed_at: hoursAgo(2),
        analysis_retry_owner: "outbox",
      },
    });
    await run();
    expect(analyzeCalls).toBe(0);
  });
});
