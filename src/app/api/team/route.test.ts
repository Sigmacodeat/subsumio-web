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
}));
const list = vi.fn();
vi.mock("@/lib/auth/store", () => ({ getStore: () => ({ list }) }));

import { GET } from "./route";
import { requireEngineContext } from "@/lib/engine";

const users = [
  { id: "a1", orgId: "o1", role: "admin", name: "Admin", email: "a@k.example" },
  { id: "l1", orgId: "o1", role: "lawyer", name: "Anwalt", email: "l@k.example" },
  { id: "s1", orgId: "o1", role: "assistant", name: "Assistenz", email: "s@k.example" },
  { id: "c1", orgId: "o1", role: "client_viewer", name: "Mandant A", email: "c1@m.example" },
  { id: "c2", orgId: "o1", role: "client_viewer", name: "Mandant B", email: "c2@m.example" },
  { id: "x1", orgId: "o2", role: "lawyer", name: "Fremd", email: "x@f.example" },
];

async function membersFor(id: string): Promise<string[]> {
  const user = users.find((u) => u.id === id)!;
  vi.mocked(requireEngineContext).mockResolvedValue({
    headers: {},
    brainId: "o1",
    plan: "team",
    user,
  } as any);
  const res = await GET(new NextRequest("http://localhost:3000/api/team"));
  expect(res.status).toBe(200);
  const body = await res.json();
  return body.members.map((m: { id: string }) => m.id).sort();
}

describe("GET /api/team", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    list.mockResolvedValue(users);
  });

  it("a client account sees only itself — never other clients", async () => {
    expect(await membersFor("c1")).toEqual(["c1"]);
  });

  it("assistants and lawyers see staff but no client accounts", async () => {
    expect(await membersFor("s1")).toEqual(["a1", "l1", "s1"]);
    expect(await membersFor("l1")).toEqual(["a1", "l1", "s1"]);
  });

  it("admins see every account of their firm, no other firm", async () => {
    expect(await membersFor("a1")).toEqual(["a1", "c1", "c2", "l1", "s1"]);
  });
});
