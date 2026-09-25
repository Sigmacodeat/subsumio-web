/* eslint-disable @typescript-eslint/no-explicit-any */
// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/lib/audit", () => ({ logAudit: vi.fn() }));
vi.mock("@/lib/auth/rate-limit", () => ({
  hit: vi.fn().mockResolvedValue({ ok: true, retryAfterSeconds: 0 }),
  clientIp: () => "127.0.0.1",
}));
const patchPage = vi.fn(async () => new Response("{}", { status: 200 }));
vi.mock("@/lib/engine", async () => ({
  ENGINE_URL: "http://engine.test",
  engineConfigurationResponse: () => null,
  requireEngineContext: vi.fn(),
  engineHeaders: async () => ({ "x-subsumio-source": "org_firm" }),
  enginePatchPage: (...a: unknown[]) => patchPage(...(a as [])),
}));

import { POST } from "./route";
import { requireEngineContext } from "@/lib/engine";
import { zonedDateString } from "@/lib/datetime";

const writes: Array<Record<string, any>> = [];
let writeStatus = 200;

beforeEach(() => {
  vi.clearAllMocks();
  writes.length = 0;
  writeStatus = 200;
  vi.mocked(requireEngineContext).mockResolvedValue({
    headers: {},
    brainId: "org_firm",
    user: { id: "u1", role: "lawyer", email: "a@k.at" },
  } as any);
  vi.stubGlobal(
    "fetch",
    vi.fn(async (_url: string, init?: RequestInit) => {
      writes.push(JSON.parse(String(init?.body)));
      return new Response("{}", { status: writeStatus });
    })
  );
});

function post(body: unknown) {
  return POST(
    new NextRequest("http://localhost:3000/api/legal/wiedervorlage", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-csrf-token": "t", cookie: "sb_csrf=t" },
      body: JSON.stringify(body),
    })
  );
}

describe("POST /api/legal/wiedervorlage", () => {
  it("never invents a remaining time: unknown → due today, marked for immediate review", async () => {
    const res = await post({
      case_slug: "legal/cases/a",
      verjaehrung_score: 90,
      urgent_ansprueche: [{ anspruch: "Verjährung droht", restzeit_tage: null }],
    });
    expect(res.status).toBe(200);
    const fm = writes[0].frontmatter;
    expect(fm.due_date).toBe(zonedDateString(new Date()));
    expect(fm.status).toBe("critical");
    expect(fm.restzeit_unbekannt).toBe(true);
    expect(fm.description).toContain("Restzeit unbekannt");
  });

  it("keeps a known remaining time", async () => {
    await post({
      case_slug: "legal/cases/a",
      verjaehrung_score: 90,
      urgent_ansprueche: [{ anspruch: "Schadenersatz", restzeit_tage: 12 }],
    });
    expect(writes[0].frontmatter.description).toContain("in 12 Tagen");
  });

  it("reports a failure instead of success when nothing was stored", async () => {
    writeStatus = 500;
    const res = await post({
      case_slug: "legal/cases/a",
      verjaehrung_score: 90,
      urgent_ansprueche: [{ anspruch: "Schadenersatz", restzeit_tage: 12 }],
    });
    expect(res.status).toBe(502);
    expect(patchPage).not.toHaveBeenCalled();
  });
});
