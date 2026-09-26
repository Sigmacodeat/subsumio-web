/* eslint-disable @typescript-eslint/no-explicit-any */
// @vitest-environment node
// GET /api/admin/corpus-law-coverage/law — Betreiber-Gate + Antwort für ein Gesetz.
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { NextRequest } from "next/server";

// realpath: auf macOS ist TMPDIR ein Symlink — safeCorpusPath weist Pfade,
// deren echter Ort außerhalb der Wurzel liegt, zu Recht ab.
const ROOT = await vi.hoisted(async () => {
  const { realpathSync } = await import("node:fs");
  const { tmpdir } = await import("node:os");
  return `${realpathSync(tmpdir())}/law-detail-route-test-${process.pid}-${Date.now()}`;
});

vi.mock("@/lib/corpus-paths", () => ({
  lawCorpusDir: () => ROOT,
  lawCorpusNormalizedDir: () => `${ROOT}/_normalized`,
  lawCorpusSplitDir: () => `${ROOT}/split`,
}));
vi.mock("@/lib/audit", () => ({ logAudit: vi.fn() }));
vi.mock("@/lib/auth/rate-limit", () => ({
  hit: vi.fn().mockResolvedValue({ ok: true, retryAfterSeconds: 0 }),
}));
vi.mock("@/lib/engine", async () => ({
  ENGINE_URL: "http://engine.test",
  engineConfigurationResponse: () => null,
  requireEngineContext: vi.fn(),
}));
vi.mock("@/lib/auth/api-key-auth", () => ({ verifyApiKey: vi.fn().mockResolvedValue(null) }));
vi.mock("@/lib/de-statute-coverage", () => ({ fetchGiiTocCached: vi.fn().mockResolvedValue([]) }));

const pool = vi.hoisted(() => ({ query: vi.fn() }));
vi.mock("@/lib/auth/store", () => ({ getSharedPgPool: () => pool }));

import { GET } from "./route";
import { requireEngineContext } from "@/lib/engine";

const OPERATOR = "ops@subsumio.example";

function ctx(email: string) {
  return {
    headers: {},
    brainId: "brain",
    plan: "team",
    user: {
      id: "u1",
      email,
      role: "admin",
      twoFactorEnabled: true,
      emailVerifiedAt: "2026-01-01T00:00:00.000Z",
    },
  };
}

function get(qs: string) {
  return GET(
    new NextRequest(`http://localhost:3000/api/admin/corpus-law-coverage/law?${qs}`, {
      headers: { host: "ops.subsum.io" },
    })
  );
}

/** Pool-Antworten nach SQL-Inhalt: Seiten des Gesetzes, Warteschlange, Pipeline-Stand. */
function dbReturns(opts: { pages: any[]; queue?: unknown; running?: string | null }) {
  pool.query.mockImplementation(async (sql: string) => {
    if (sql.includes("law_fetch_queue")) return { rows: opts.queue ? [{ value: opts.queue }] : [] };
    if (sql.includes("pipeline_state"))
      return {
        rows: [
          {
            pid: opts.running ? 4242 : null,
            pid_cmd: opts.running
              ? `bun scripts/ris-xml-fetch-normen.ts --gnr ${opts.running}`
              : null,
            pid_started_at: "2026-09-23T08:00:00.000Z",
          },
        ],
      };
    return { rows: opts.pages };
  });
}

const page = (doc: string, rel: string, label: string, chunks = 2, embedded = 2) => ({
  slug: `legal/statutes/at/${rel}`,
  doc,
  label,
  title: `${label} Titel`,
  abbr: "TG",
  short_title: "Testgesetz",
  updated_at: "2026-09-20T10:00:00.000Z",
  chunks,
  embedded,
});

beforeAll(() => {
  mkdirSync(join(ROOT, "_state"), { recursive: true });
  mkdirSync(join(ROOT, "_normalized", "at-normen", "tg"), { recursive: true });
  writeFileSync(
    join(ROOT, "_state", "ris-inforce.jsonl"),
    [
      { nor: "NOR1", gnr: "10001", kurztitel: "Testgesetz", abk: "TG", apa: "§ 1" },
      { nor: "NOR2", gnr: "10001", kurztitel: "Testgesetz", abk: "TG", apa: "§ 2" },
      { nor: "NOR10", gnr: "10001", kurztitel: "Testgesetz", abk: "TG", apa: "§ 10" },
      { nor: "NOR3", gnr: "10001", kurztitel: "Testgesetz", abk: "TG", apa: "§ 3" },
      { nor: "E1", gnr: "10002", kurztitel: "Emblemgesetz", abk: "EG", apa: "Art. 1" },
      { nor: "E2", gnr: "10002", kurztitel: "Emblemgesetz", abk: "EG", apa: "Anl. 1" },
    ]
      .map((l) => JSON.stringify(l))
      .join("\n")
  );
  // Abruf-Ledger: E2 ist eine Bild-Anlage — RIS liefert keinen Text.
  writeFileSync(
    join(ROOT, "_state", "ris-fetch-outcomes.jsonl"),
    JSON.stringify({
      corpus: "at-normen",
      id: "E2",
      outcome: "no_text",
      at: "2026-09-26T00:00:00.000Z",
    }) + "\n"
  );
  // Nur § 1 hat eine Textdatei auf der Platte.
  writeFileSync(join(ROOT, "_normalized", "at-normen", "tg", "p-1.md"), "---\n---\n# § 1\n");
  writeFileSync(
    join(ROOT, "_normalized", "_steward-flags.json"),
    JSON.stringify({ "at-normen/tg/p-1.md": { flag: "verified", note: "", by: "x", at: "y" } })
  );
});

afterAll(() => rmSync(ROOT, { recursive: true, force: true }));

beforeEach(() => {
  vi.clearAllMocks();
  vi.unstubAllEnvs();
  vi.stubEnv("PLATFORM_OPERATOR_EMAILS", OPERATOR);
});

describe("GET /api/admin/corpus-law-coverage/law", () => {
  it("is closed to Kanzlei admins (operator gate)", async () => {
    vi.mocked(requireEngineContext).mockResolvedValue(ctx("partner@kanzlei.example") as any);
    const res = await get("source=law-at-normen&key=10001");
    expect(res.status).toBe(403);
    expect(pool.query).not.toHaveBeenCalled();
  });

  it("rejects an invalid law key before touching the database", async () => {
    vi.mocked(requireEngineContext).mockResolvedValue(ctx(OPERATOR) as any);
    const res = await get("source=law-at-normen&key=..%2F..%2Fetc");
    expect(res.status).toBe(400);
    expect(pool.query).not.toHaveBeenCalled();
  });

  it("returns status, the full missing list, present §§ with file + flag, and the fetch state", async () => {
    vi.mocked(requireEngineContext).mockResolvedValue(ctx(OPERATOR) as any);
    dbReturns({
      pages: [page("NOR2", "tg/p-2", "§ 2"), page("NOR1", "tg/p-1", "§ 1", 4, 1)],
      queue: [{ source: "law-at-normen", gnr: "10001", queued_at: "x" }],
    });
    const res = await get("source=law-at-normen&key=10001");
    expect(res.status).toBe(200);
    const d = (await res.json()).data;
    expect(d.status).toBe("partial");
    expect(d.abbr).toBe("TG");
    expect(d.title).toBe("Testgesetz");
    expect(d.wanted).toBe(4);
    expect(d.have).toBe(2);
    // Natürliche Reihenfolge: § 3 vor § 10
    expect(d.missing.map((m: any) => m.apa)).toEqual(["§ 3", "§ 10"]);
    expect(d.present.map((n: any) => n.label)).toEqual(["§ 1", "§ 2"]);
    expect(d.present[0].file).toBe("at-normen/tg/p-1.md");
    expect(d.present[0].flag).toBe("verified");
    expect(d.present[1].file).toBeNull(); // keine Datei auf der Platte
    expect(d.quality).toEqual({ verified: 1, needs_review: 0, defective: 0, unchecked: 1 });
    expect(d.embed_pct).toBe(50); // 3 von 6
    expect(d.fetch).toEqual({ supported: true, queued: true, running: false, unavailable: false });
    expect(d.index.available).toBe(true);
  });

  it("lists no-text annexes as unreachable instead of missing", async () => {
    vi.mocked(requireEngineContext).mockResolvedValue(ctx(OPERATOR) as any);
    dbReturns({ pages: [page("E1", "eg/art-1", "Art. 1")] });
    const res = await get("source=law-at-normen&key=10002");
    expect(res.status).toBe(200);
    const d = (await res.json()).data;
    expect(d.status).toBe("complete");
    expect(d.wanted).toBe(2);
    expect(d.missing).toHaveLength(0);
    expect(d.unreachable).toEqual([{ nor: "E2", apa: "Anl. 1", outcome: "no_text" }]);
  });

  it("marks a law that is currently being fetched", async () => {
    vi.mocked(requireEngineContext).mockResolvedValue(ctx(OPERATOR) as any);
    dbReturns({ pages: [], running: "10001" });
    const d = (await (await get("source=law-at-normen&key=10001")).json()).data;
    expect(d.status).toBe("missing");
    expect(d.missing).toHaveLength(4);
    expect(d.fetch.running).toBe(true);
  });

  it("answers 404 for a law that is neither in the index nor in the database", async () => {
    vi.mocked(requireEngineContext).mockResolvedValue(ctx(OPERATOR) as any);
    dbReturns({ pages: [] });
    expect((await get("source=law-at-normen&key=99999")).status).toBe(404);
  });
});
