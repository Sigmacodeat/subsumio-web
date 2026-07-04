/**
 * pipeline-sync.test.ts — E2E test for the Fristen-Kette pipeline:
 *   1. Parse deadline_calendar markdown tables
 *   2. Deduplicate against existing legal_deadline pages
 *   3. Materialize as legal_deadline pages with correct frontmatter
 *   4. Classify deadlines for the digest (overdue/critical/warning/vorfrist)
 *
 * This test uses mocked fetch calls to simulate the Engine API.
 * The goal is to verify that pipeline-extracted deadlines reach the
 * reminder infrastructure with correct metadata.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock the engine module
vi.mock("@/lib/engine", () => ({
  ENGINE_URL: "http://mock-engine",
  engineHeadersForBrain: (brainId: string) => ({ "x-subsumio-source": brainId }),
}));

// Import after mock
import { syncPipelineDeadlines } from "@/lib/legal/pipeline-sync";
import { computeDeadlineStatus } from "@/lib/legal-deadlines";

// ── Mock fetch ──────────────────────────────────────────────

const mockPages = new Map<string, unknown[]>();

function setMockPages(type: string, pages: unknown[]) {
  mockPages.set(type, pages);
}

globalThis.fetch = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
  const urlStr = typeof url === "string" ? url : url.toString();

  // GET /api/pages?type=... → return mock pages
  if (urlStr.includes("/api/pages?type=") && (!init || init.method === "GET" || !init.method)) {
    const typeMatch = urlStr.match(/type=([^&]+)/);
    const type = typeMatch?.[1] ?? "";
    const pages = mockPages.get(type) ?? [];
    return new Response(JSON.stringify(pages), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }

  // POST /api/pages → create page (always succeed)
  if (urlStr.includes("/api/pages") && init?.method === "POST") {
    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }

  return new Response("Not found", { status: 404 });
}) as typeof fetch;

beforeEach(() => {
  mockPages.clear();
  vi.clearAllMocks();
});

// ── Test data ───────────────────────────────────────────────

const DEADLINE_CALENDAR_PAGE = {
  slug: "deadline-calendars/test-case-001",
  compiled_truth: `# Fristen-Kalender

| Datum | Ampel | Frist | Rechtsgrundlage | Folge | Beleg |
|------|-------|-------|-----------------|-------|-------|
| 15.04.2025 | 🟡 | Berufung gegen Ersturteil | § 5 Abs 1 JN | Rechtskraft | Klageschrift.pdf |
| 30.03.2025 | 🔴 | Klagebeantwortung | § 276 ZPO | Versäumnisurteil | Urteil.pdf |
`,
  frontmatter: null,
};

describe("E2: Pipeline-Sync — deadline_calendar → legal_deadline", () => {
  it("parses markdown table and creates legal_deadline pages", async () => {
    setMockPages("deadline_calendar", [DEADLINE_CALENDAR_PAGE]);
    setMockPages("legal_deadline", []); // No existing deadlines

    const result = await syncPipelineDeadlines("test-brain");

    expect(result.scanned).toBe(2);
    expect(result.created).toBe(2);
    expect(result.skipped).toBe(0);
    expect(result.errors).toBe(0);
  });

  it("deduplicates against existing legal_deadline pages", async () => {
    setMockPages("deadline_calendar", [DEADLINE_CALENDAR_PAGE]);
    // Simulate one existing deadline that matches the first row
    setMockPages("legal_deadline", [
      {
        slug: "legal/deadlines/2025-04-15-berufung-gegen-ersturteil-abc",
        title: "Berufung gegen Ersturteil",
        frontmatter: {
          case_slug: "test-case-001",
          due_date: "2025-04-15",
          description: "Berufung gegen Ersturteil",
        },
      },
    ]);

    const result = await syncPipelineDeadlines("test-brain");

    expect(result.scanned).toBe(2);
    expect(result.created).toBe(1); // Only the second one is new
    expect(result.skipped).toBe(1); // First one deduped
  });

  it("handles empty deadline_calendar pages gracefully", async () => {
    setMockPages("deadline_calendar", []);
    setMockPages("legal_deadline", []);

    const result = await syncPipelineDeadlines("test-brain");

    expect(result.scanned).toBe(0);
    expect(result.created).toBe(0);
  });

  it("handles unparseable dates gracefully", async () => {
    setMockPages("deadline_calendar", [
      {
        slug: "deadline-calendars/bad-case",
        compiled_truth: `| Datum | Ampel | Frist | Rechtsgrundlage | Folge | Beleg |
|------|-------|-------|-----------------|-------|-------|
| invalid | 🟡 | Bad date | § 1 | Nothing | x |
| 15.04.2025 | 🟡 | Good date | § 2 | Nothing | x |
`,
        frontmatter: null,
      },
    ]);
    setMockPages("legal_deadline", []);

    const result = await syncPipelineDeadlines("test-brain");

    expect(result.scanned).toBe(2);
    expect(result.created).toBe(1); // Only the valid one
    expect(result.skipped).toBe(1); // Invalid date skipped
  });
});

describe("E2: Digest classification — pipeline deadlines reach reminder", () => {
  it("overdue deadline is classified as overdue", () => {
    const pastDate = "2020-01-01";
    const status = computeDeadlineStatus(pastDate);
    expect(status).toBe("overdue");
  });

  it("deadline within 3 days is critical", () => {
    const soon = new Date();
    soon.setUTCDate(soon.getUTCDate() + 2);
    const status = computeDeadlineStatus(soon.toISOString().split("T")[0]!);
    expect(status).toBe("critical");
  });

  it("deadline within 7 days is warning", () => {
    const soon = new Date();
    soon.setUTCDate(soon.getUTCDate() + 5);
    const status = computeDeadlineStatus(soon.toISOString().split("T")[0]!);
    expect(status).toBe("warning");
  });

  it("done deadline stays done regardless of date", () => {
    const pastDate = "2020-01-01";
    const status = computeDeadlineStatus(pastDate, "done");
    expect(status).toBe("done");
  });

  it("vorfrist reached returns vorfrist status", () => {
    const future = new Date();
    future.setUTCDate(future.getUTCDate() + 20);
    const vorfrist = new Date();
    vorfrist.setUTCDate(vorfrist.getUTCDate() - 1);
    const status = computeDeadlineStatus(
      future.toISOString().split("T")[0]!,
      undefined,
      vorfrist.toISOString().split("T")[0]
    );
    expect(status).toBe("vorfrist");
  });
});
