// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

const mockPatch = vi.fn();

vi.mock("@/lib/engine", () => ({
  ENGINE_URL: "http://engine.test",
  enginePatchPage: (...args: unknown[]) => mockPatch(...args),
}));
vi.mock("@/lib/audit", () => ({ logAudit: vi.fn(async () => undefined) }));
vi.mock("@/lib/logger", () => ({
  logger: () => ({ warn: vi.fn(), error: vi.fn(), info: vi.fn() }),
}));
let user = { id: "u1", email: "anwalt@example.com", name: "Anwalt", role: "lawyer" };
vi.mock("@/lib/api-handler", () => ({
  createHandler: (_opts: unknown, handler: (ctx: unknown, body: unknown) => Promise<Response>) => {
    return async (req: Request) =>
      handler({ headers: {}, brainId: "brain-at", user }, await req.json());
  },
  apiError: (code: string, message: string, status: number) =>
    Response.json({ error: code, message }, { status }),
}));

import { POST as MUTATE } from "./route";
import { POST as APPEND } from "../array-append/route";

let stored: Record<string, unknown>;
let engineMutations: Array<Record<string, unknown>>;
let engineAppends: Array<Record<string, unknown>>;

beforeEach(() => {
  vi.clearAllMocks();
  user = { id: "u1", email: "anwalt@example.com", name: "Anwalt", role: "lawyer" };
  engineMutations = [];
  engineAppends = [];
  mockPatch.mockResolvedValue(Response.json({ success: true }));
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: RequestInit) => {
      const body = init?.body ? JSON.parse(String(init.body)) : null;
      if (String(url).endsWith("/api/pages/array-mutate")) {
        engineMutations.push(body);
        return Response.json({ updated_ids: body.match, items: [] });
      }
      if (String(url).endsWith("/api/pages/array-append")) {
        engineAppends.push(body);
        return Response.json({ appended: body.items.length, items: body.items });
      }
      return Response.json(stored);
    })
  );
});

const post = (handler: unknown, body: unknown) =>
  (handler as (r: Request) => Promise<Response>)(
    new Request("http://localhost/api/pages/x", { method: "POST", body: JSON.stringify(body) })
  );

const matter = () => ({
  slug: "legal/cases/akte-1",
  type: "legal_case",
  frontmatter: {
    version: 3,
    deadlines: [
      { id: "d1", title: "Berufung", due_date: "2026-03-30", is_notfrist: true, status: "pending" },
      { id: "d2", title: "Termin", due_date: "2026-04-01", status: "pending" },
    ],
  },
});

describe("POST /api/pages/array-mutate — deadlines[] (FRI-7/FRI-8)", () => {
  it("patches one entry atomically by id and advances the matter version", async () => {
    stored = matter();
    const res = await post(MUTATE, {
      slug: "legal/cases/akte-1",
      field: "deadlines",
      match: ["d2"],
      set: { review_status: "approved" },
    });
    expect(res.status).toBe(200);
    expect(engineMutations).toHaveLength(1);
    expect(engineMutations[0]).toMatchObject({
      match_key: "id",
      match: ["d2"],
      set: { review_status: "approved", reviewed_by_id: "u1" },
    });
    expect(mockPatch.mock.calls[0][1]).toEqual({
      slug: "legal/cases/akte-1",
      frontmatter: { version: 4 },
    });
  });

  it("refuses a client-set second check", async () => {
    stored = matter();
    const res = await post(MUTATE, {
      slug: "legal/cases/akte-1",
      field: "deadlines",
      match: ["d1"],
      set: { status: "done", second_check_by: "ich", second_check_at: "t" },
    });
    expect(res.status).toBe(403);
    expect(engineMutations).toHaveLength(0);
  });

  it("refuses to complete a Notfrist without the server-stamped second check", async () => {
    stored = matter();
    const res = await post(MUTATE, {
      slug: "legal/cases/akte-1",
      field: "deadlines",
      match: ["d1"],
      set: { status: "done" },
    });
    expect(res.status).toBe(403);
    expect(engineMutations).toHaveLength(0);
  });

  it("refuses to remove a Notfrist and to move it without a reason", async () => {
    stored = matter();
    expect(
      (
        await post(MUTATE, {
          slug: "legal/cases/akte-1",
          field: "deadlines",
          match: ["d1"],
          remove: true,
        })
      ).status
    ).toBe(403);
    expect(
      (
        await post(MUTATE, {
          slug: "legal/cases/akte-1",
          field: "deadlines",
          match: ["d1"],
          set: { due_date: "2026-04-30" },
        })
      ).status
    ).toBe(422);
    expect(engineMutations).toHaveLength(0);
  });

  it("other fields (time entries) pass through unchanged", async () => {
    stored = matter();
    const res = await post(MUTATE, {
      slug: "legal/cases/akte-1",
      field: "time_entries",
      match: ["t1"],
      set: { billed: true },
    });
    expect(res.status).toBe(200);
    expect(engineMutations[0]).toMatchObject({ field: "time_entries", set: { billed: true } });
    expect(mockPatch).not.toHaveBeenCalled();
  });
});

describe("POST /api/pages/array-append — deadlines[] (FRI-6/FRI-8)", () => {
  it("stamps the creator from the session, drops client second-check fields, bumps the version", async () => {
    stored = matter();
    const res = await post(APPEND, {
      slug: "legal/cases/akte-1",
      field: "deadlines",
      items: [
        {
          title: "Neu",
          due_date: "2026-05-01",
          created_by_id: "fake",
          second_check_by: "ich",
          second_check_at: "t",
        },
      ],
    });
    expect(res.status).toBe(200);
    const item = (engineAppends[0].items as Array<Record<string, unknown>>)[0];
    expect(item.created_by_id).toBe("u1");
    expect(item.second_check_by).toBeUndefined();
    expect(typeof item.id).toBe("string");
    expect(mockPatch.mock.calls[0][1]).toEqual({
      slug: "legal/cases/akte-1",
      frontmatter: { version: 4 },
    });
  });
});
