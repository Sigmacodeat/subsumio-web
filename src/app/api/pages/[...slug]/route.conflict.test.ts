// @vitest-environment node
/**
 * PATCH /api/pages/<matter> — Kollisionsprüfung beim Parteiwechsel runs BEFORE
 * the write, with the gate of the matter creation (R6-16). The engine answer
 * comes from the real engine checker over fixture rows.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { conflictCheck } from "../../../../../server/src/core/legal/conflict-check";

const mockPatch = vi.fn();

vi.mock("@/lib/engine", () => ({
  ENGINE_URL: "http://engine.test",
  enginePatchPage: (...args: unknown[]) => mockPatch(...args),
}));
vi.mock("@/lib/audit", () => ({ logAudit: vi.fn() }));
vi.mock("@/lib/realtime-bus", () => ({ broadcastSseEvent: vi.fn() }));
vi.mock("@/lib/logger", () => ({
  logger: () => ({ warn: vi.fn(), error: vi.fn(), info: vi.fn() }),
}));

const user = { id: "u1", email: "anwalt@example.com", name: "Anwalt", role: "lawyer" };
vi.mock("@/lib/api-handler", () => ({
  createHandler:
    (
      _opts: unknown,
      handler: (ctx: unknown, body: unknown, query: unknown, req: Request) => Promise<Response>
    ) =>
    async (req: Request) => {
      const ctx = {
        headers: { "x-subsumio-source": "brain-at" },
        brainId: "brain-at",
        user,
      };
      return handler(ctx, await req.json().catch(() => ({})), {}, req);
    },
  apiError: (code: string, message: string, status: number) =>
    Response.json({ error: code, message }, { status }),
  apiNotFound: (code: string) => Response.json({ error: code }, { status: 404 }),
}));

import { PATCH } from "./route";

const caseRows = [
  {
    slug: "legal/cases/andere",
    title: "Andere Akte",
    client_name: "Irgendwer",
    opponent_name: "Neue Mandantin GmbH",
  },
  {
    slug: "legal/cases/akte-1",
    title: "Akte 1",
    client_name: "Alte Mandantin AG",
    opponent_name: "Gegner KG",
  },
].map((r) => ({
  ...r,
  additional_opponents: null,
  contact_name: null,
  contact_company: null,
  contact_role: null,
  status: "open",
  page_type: "legal_case",
}));
const fixtureEngine = {
  async executeRaw<T>(sql: string): Promise<T[]> {
    return (sql.includes("type = 'person'") ? [] : caseRows) as T[];
  },
};

const stored = {
  slug: "legal/cases/akte-1",
  type: "legal_case",
  frontmatter: {
    type: "legal_case",
    status: "active",
    client_name: "Alte Mandantin AG",
    opponent_name: "Gegner KG",
    conflict_status: "conflict_cleared",
    version: 3,
  },
};

let checkMode: "real" | "down" | "malformed";
let checks: Array<Record<string, unknown>>;

beforeEach(() => {
  vi.clearAllMocks();
  user.role = "lawyer";
  checkMode = "real";
  checks = [];
  mockPatch.mockResolvedValue(Response.json({ success: true }));
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: RequestInit) => {
      if (String(url).endsWith("/api/legal/conflict-check")) {
        const req = JSON.parse(String(init?.body ?? "{}")) as Record<string, unknown>;
        checks.push(req);
        if (checkMode === "down") return new Response("unavailable", { status: 502 });
        if (checkMode === "malformed") return Response.json({ matches: [] });
        const result = await conflictCheck(fixtureEngine, {
          name: String(req.name),
          side: req.side as "client" | "opponent",
          selfCaseSlug: req.self_case_slug as string | undefined,
          ownContactSlugs: req.own_contact_slugs as string[] | undefined,
        });
        return Response.json(result);
      }
      return Response.json(stored);
    })
  );
});

function patch(frontmatter: Record<string, unknown>) {
  const req = new Request("http://localhost/api/pages/legal/cases/akte-1", {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ frontmatter }),
  });
  (req as unknown as { params: Promise<{ slug: string[] }> }).params = Promise.resolve({
    slug: ["legal", "cases", "akte-1"],
  });
  return (PATCH as unknown as (r: Request) => Promise<Response>)(req);
}

const written = () =>
  (mockPatch.mock.calls[0]?.[1] ?? null) as { frontmatter?: Record<string, unknown> } | null;

describe("PATCH matter — Parteiwechsel runs the conflict gate before the write", () => {
  it("a new client who is the opponent in another matter → 409, nothing written", async () => {
    const res = await patch({ client_name: "Neue Mandantin GmbH", opponent_name: "Gegner KG" });
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.error).toBe("conflict_detected");
    expect(body.conflictWarning.blocking[0]).toMatchObject({
      slug: "legal/cases/andere",
      assessment: "critical",
    });
    expect(mockPatch).not.toHaveBeenCalled();
    // Only the changed party was checked, with its side in this matter.
    expect(checks).toEqual([
      expect.objectContaining({
        name: "Neue Mandantin GmbH",
        side: "client",
        self_case_slug: "legal/cases/akte-1",
      }),
    ]);
  });

  it("check unreachable → 503, nothing written", async () => {
    checkMode = "down";
    const res = await patch({ client_name: "Neue Mandantin GmbH" });
    expect(res.status).toBe(503);
    expect((await res.json()).error).toBe("conflict_check_unavailable");
    expect(mockPatch).not.toHaveBeenCalled();
  });

  it("an engine answer without severity counts as a failed check → 503", async () => {
    checkMode = "malformed";
    const res = await patch({ client_name: "Ganz Neu GmbH" });
    expect(res.status).toBe(503);
    expect(mockPatch).not.toHaveBeenCalled();
  });

  it("an assistant cannot waive the conflict even with a reason → 403", async () => {
    user.role = "assistant";
    const res = await patch({
      client_name: "Neue Mandantin GmbH",
      conflict_waiver_reason: "Zustimmung beider Mandanten liegt vor",
    });
    expect(res.status).toBe(403);
    expect((await res.json()).error).toBe("conflict_waiver_unauthorized");
    expect(mockPatch).not.toHaveBeenCalled();
  });

  it("a lawyer with a reason may waive it → 200, stamped conflict_waived", async () => {
    const res = await patch({
      client_name: "Neue Mandantin GmbH",
      conflict_waiver_reason: "Zustimmung beider Mandanten liegt vor",
    });
    expect(res.status).toBe(200);
    expect(written()?.frontmatter).toMatchObject({
      client_name: "Neue Mandantin GmbH",
      conflict_status: "conflict_waived",
      conflict_waived_by: "anwalt@example.com",
      conflict_waived_by_id: "u1",
      conflict_waived_by_role: "lawyer",
    });
  });

  it("a harmless new party passes and is stamped conflict_cleared", async () => {
    const res = await patch({ opponent_name: "Ganz Neue Gegnerin OG" });
    expect(res.status).toBe(200);
    expect(written()?.frontmatter?.conflict_status).toBe("conflict_cleared");
    expect(checks).toHaveLength(1);
  });

  it("saving with unchanged parties does not re-run the check", async () => {
    const res = await patch({
      client_name: "Alte Mandantin AG",
      opponent_name: "Gegner KG",
      priority: "high",
    });
    expect(res.status).toBe(200);
    expect(checks).toHaveLength(0);
    expect(mockPatch).toHaveBeenCalledTimes(1);
  });

  it("a new additional opponent is checked too", async () => {
    checkMode = "down";
    const res = await patch({ additional_opponents: [{ name: "Dritte GmbH" }] });
    expect(res.status).toBe(503);
    expect(checks[0]).toMatchObject({ name: "Dritte GmbH", side: "opponent" });
    expect(mockPatch).not.toHaveBeenCalled();
  });

  it("a client-sent conflict status is still refused by the protected-field guard", async () => {
    const res = await patch({
      client_name: "Neue Mandantin GmbH",
      conflict_status: "conflict_waived",
    });
    expect(res.status).toBe(403);
    expect(mockPatch).not.toHaveBeenCalled();
  });
});
