import { describe, test, expect, vi, beforeEach } from "vitest";

const mockStore = vi.hoisted(() => ({
  getById: vi.fn(),
  update: vi.fn(async () => {}),
}));
const mockEngine = vi.hoisted(() => ({
  engineHeadersForUserId: vi.fn(),
}));
const mockRateLimit = vi.hoisted(() => ({
  hit: vi.fn(async () => ({ ok: true })),
}));

vi.mock("@/lib/auth/store", () => ({ getStore: () => mockStore }));
vi.mock("@/lib/engine", () => mockEngine);
vi.mock("@/lib/auth/rate-limit", () => mockRateLimit);

import { resolveFeedToken } from "./feed-auth";
import { hashFeedSecret, createFeedSecret } from "./calendar-feed";

const USER_ID = "user-abc";
const SECRET = "a".repeat(64); // gueltiges hex-Secret-Format
const DAV_SECRET = "b".repeat(64);

describe("resolveFeedToken", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    mockRateLimit.hit.mockResolvedValue({ ok: true });
    mockStore.getById.mockResolvedValue({
      id: USER_ID,
      calendarFeedTokenHash: await hashFeedSecret(SECRET),
      davTokenHash: await hashFeedSecret(DAV_SECRET),
    });
    mockEngine.engineHeadersForUserId.mockResolvedValue({ headers: { "x-brain": "firm-1" } });
  });

  test("malformierter Token → 404 ohne Store/Engine-Aufruf", async () => {
    const r = await resolveFeedToken("kein-punkt-hier", "calendar");
    expect(r).toEqual({ ok: false, status: 404 });
    expect(mockStore.getById).not.toHaveBeenCalled();
    expect(mockEngine.engineHeadersForUserId).not.toHaveBeenCalled();
  });

  test("Rate-Limit erreicht → 429, vor dem User-Lookup", async () => {
    mockRateLimit.hit.mockResolvedValueOnce({ ok: false });
    const r = await resolveFeedToken(`${USER_ID}.${SECRET}`, "calendar");
    expect(r).toEqual({ ok: false, status: 429 });
    // Kein Info-Leak ob die userId ueberhaupt existiert.
    expect(mockStore.getById).not.toHaveBeenCalled();
  });

  test("unbekannter User → 404", async () => {
    mockStore.getById.mockResolvedValueOnce(null);
    const r = await resolveFeedToken(`${USER_ID}.${SECRET}`, "calendar");
    expect(r).toEqual({ ok: false, status: 404 });
  });

  test("falsches Secret → 404", async () => {
    const r = await resolveFeedToken(`${USER_ID}.${"f".repeat(64)}`, "calendar");
    expect(r).toEqual({ ok: false, status: 404 });
    expect(mockEngine.engineHeadersForUserId).not.toHaveBeenCalled();
  });

  test("kein Engine-Binding → 404", async () => {
    mockEngine.engineHeadersForUserId.mockResolvedValueOnce(null);
    const r = await resolveFeedToken(`${USER_ID}.${SECRET}`, "calendar");
    expect(r).toEqual({ ok: false, status: 404 });
  });

  test("Calendar-Token darf Scope calendar → ok + kind", async () => {
    const r = await resolveFeedToken(`${USER_ID}.${SECRET}`, "calendar");
    expect(r).toEqual({
      ok: true,
      userId: USER_ID,
      headers: { "x-brain": "firm-1" },
      kind: "calendar",
    });
    expect(mockStore.update).toHaveBeenCalledWith(
      USER_ID,
      expect.objectContaining({ calendarFeedLastUsedAt: expect.any(String) })
    );
  });

  test("DAV-Token darf Scope calendar UND documents", async () => {
    const cal = await resolveFeedToken(`${USER_ID}.${DAV_SECRET}`, "calendar");
    expect(cal.ok && cal.kind).toBe("dav");
    const docs = await resolveFeedToken(`${USER_ID}.${DAV_SECRET}`, "documents");
    expect(docs.ok && docs.kind).toBe("dav");
  });

  test("Calendar-Token darf NICHT Scope documents — Kalender-Link ist kein Dokumenten-Zugang", async () => {
    // Der Kalender-Link wird an Google/Outlook weitergegeben — duerfen
    // Dritte damit das Dokumentenarchiv oeffnen, waere das ein Leck.
    const r = await resolveFeedToken(`${USER_ID}.${SECRET}`, "documents");
    expect(r).toEqual({ ok: false, status: 404 });
    expect(mockEngine.engineHeadersForUserId).not.toHaveBeenCalled();
  });

  test("dav lastUsed schreibt davTokenLastUsedAt", async () => {
    await resolveFeedToken(`${USER_ID}.${DAV_SECRET}`, "documents");
    expect(mockStore.update).toHaveBeenCalledWith(
      USER_ID,
      expect.objectContaining({ davTokenLastUsedAt: expect.any(String) })
    );
  });

  test("lastUsed-Update-Fehler bricht den Request nicht (best-effort)", async () => {
    mockStore.update.mockRejectedValueOnce(new Error("db down"));
    const r = await resolveFeedToken(`${USER_ID}.${SECRET}`, "calendar");
    expect(r.ok).toBe(true);
  });

  test("createFeedSecret liefert parsebares Token-Format", async () => {
    const secret = createFeedSecret();
    await resolveFeedToken(`${USER_ID}.${secret}`, "calendar");
    // Format gueltig → kommt bis zum User-Lookup (nicht schon parse-404).
    expect(mockStore.getById).toHaveBeenCalled();
  });
});
