// @vitest-environment node
//
// Outbox drain: a reconcile task whose matter was archived meanwhile is closed
// for good (no retry loop), with a note that the document is not listed on
// any active matter. Transient failures keep retrying as before.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const patches = vi.hoisted(
  () => [] as Array<{ slug: string; type?: string; frontmatter?: Record<string, unknown> }>
);
const tasks = vi.hoisted(() => [] as Array<Record<string, unknown>>);
const reconcileImpl = vi.hoisted(() => ({ fn: async (): Promise<void> => {} }));

vi.mock("@/lib/api-handler", () => ({
  createCronHandler: (h: (req: NextRequest) => Promise<Response>) => h,
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
vi.mock("@/lib/engine-pages", () => ({
  listEnginePages: async () => tasks,
}));
vi.mock("@/lib/case-documents", async (orig) => {
  const actual = await orig<typeof import("@/lib/case-documents")>();
  return { ...actual, reconcileCaseDocuments: () => reconcileImpl.fn() };
});
vi.mock("@/lib/inbound-register-stamp", () => ({ stampInboundEntry: vi.fn() }));
vi.mock("@/lib/logger", () => ({
  logger: () => ({ error: vi.fn(), info: vi.fn(), warn: vi.fn() }),
}));

import { GET } from "./route";
import { CaseArchivedError } from "@/lib/case-documents";

function reconcileTask(): Record<string, unknown> {
  return {
    slug: "legal/post-upload-tasks/reconcile_case/doc-1",
    frontmatter: {
      doc_slug: "documents/doc-1",
      case_slug: "legal/cases/alt",
      brain_id: "brain_a",
      task_type: "reconcile_case",
      attempts: 0,
      status: "pending",
    },
  };
}

async function drain(): Promise<Record<string, unknown>> {
  const res = await (GET as unknown as (r: NextRequest) => Promise<Response>)(
    new NextRequest("http://app/api/cron/post-upload-drain")
  );
  return (await res.json()) as Record<string, unknown>;
}

beforeEach(() => {
  patches.length = 0;
  tasks.length = 0;
});

describe("post-upload drain — reconcile into an archived matter", () => {
  it("closes the task as final (no retry) with a note", async () => {
    tasks.push(reconcileTask());
    reconcileImpl.fn = async () => {
      throw new CaseArchivedError("legal/cases/alt", "archived");
    };
    const out = await drain();
    expect(out.blocked).toBe(1);
    expect(out.retrying).toBe(0);
    expect(patches).toHaveLength(1);
    const p = patches[0]!;
    expect(p.type).toBe("post_upload_task_blocked");
    expect(p.frontmatter?.status).toBe("blocked");
    expect(p.frontmatter?.last_error).toBe("blocked_case_archived");
    expect(String(p.frontmatter?.note)).toContain("keiner aktiven Akte");
    expect(p.frontmatter).not.toHaveProperty("next_attempt_at");
  });

  it("a transient failure is still retried", async () => {
    tasks.push(reconcileTask());
    reconcileImpl.fn = async () => {
      throw new Error("case_fetch_failed_503");
    };
    const out = await drain();
    expect(out.retrying).toBe(1);
    expect(patches[0]!.frontmatter?.status).toBe("pending");
    expect(patches[0]!.frontmatter?.next_attempt_at).toBeTruthy();
  });
});
