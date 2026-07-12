import { describe, test, expect, beforeEach } from "bun:test";
import {
  hashText,
  hashPerParagraph,
  detectAmendments,
  storeSnapshot,
  loadSnapshot,
  clearSnapshots,
  findStaleCitations,
  buildFreshnessSummary,
  checkStatuteAmendments,
  fetchEuStatute,
  type StatuteSnapshot,
  type StatuteAmendment,
  type AmendmentReport,
} from "./statute-freshness";

// ── Fixtures ──────────────────────────────────────────────────────────

const STATUTE_TEXT = `---\ntitle: BGB\n---\n\n## § 433 BGB — Vertragstypische Pflichten\n\nDer Verkäufer ist verpflichtet, dem Käufer die Sache zu übergeben.\n\n## § 434 BGB — Sachmangel\n\nDie Sache ist frei von Sachmängeln, wenn sie bei Gefahrübergang die vereinbarte Beschaffenheit hat.\n\n## § 435 BGB — Rechtsmangel\n\nDie Sache ist frei von Rechtsmängeln.\n`;

const STATUTE_TEXT_MODIFIED = `---\ntitle: BGB\n---\n\n## § 433 BGB — Vertragstypische Pflichten\n\nDer Verkäufer ist verpflichtet, dem Käufer die Sache zu übergeben und das Eigentum zu verschaffen.\n\n## § 434 BGB — Sachmangel\n\nDie Sache ist frei von Sachmängeln, wenn sie bei Gefahrübergang die vereinbarte Beschaffenheit hat.\n\n## § 435 BGB — Rechtsmangel\n\nDie Sache ist frei von Rechtsmängeln.\n`;

const STATUTE_TEXT_REMOVED = `---\ntitle: BGB\n---\n\n## § 433 BGB — Vertragstypische Pflichten\n\nDer Verkäufer ist verpflichtet, dem Käufer die Sache zu übergeben.\n\n## § 435 BGB — Rechtsmangel\n\nDie Sache ist frei von Rechtsmängeln.\n`;

beforeEach(() => {
  clearSnapshots();
});

// ── hashText ──────────────────────────────────────────────────────────

describe("hashText", () => {
  test("produces a 16-char hex hash", () => {
    expect(hashText("test")).toMatch(/^[a-f0-9]{16}$/);
  });

  test("is deterministic", () => {
    expect(hashText("hello")).toBe(hashText("hello"));
  });

  test("differs for different input", () => {
    expect(hashText("hello")).not.toBe(hashText("world"));
  });
});

// ── hashPerParagraph ──────────────────────────────────────────────────

describe("hashPerParagraph", () => {
  test("hashes each § separately", () => {
    const hashes = hashPerParagraph(STATUTE_TEXT);
    expect(Object.keys(hashes).length).toBe(3);
    expect(hashes["433"]).toBeTruthy();
    expect(hashes["434"]).toBeTruthy();
    expect(hashes["435"]).toBeTruthy();
  });

  test("each § has a different hash", () => {
    const hashes = hashPerParagraph(STATUTE_TEXT);
    expect(hashes["433"]).not.toBe(hashes["434"]);
    expect(hashes["434"]).not.toBe(hashes["435"]);
  });

  test("returns empty for text without § headings", () => {
    const hashes = hashPerParagraph("No sections here.");
    expect(Object.keys(hashes).length).toBe(0);
  });
});

// ── detectAmendments ──────────────────────────────────────────────────

describe("detectAmendments", () => {
  test("returns all as 'added' when no previous snapshot", () => {
    const current: StatuteSnapshot = {
      statute_code: "BGB",
      jurisdiction: "DE",
      paragraph_hashes: { "433": "hash1", "434": "hash2" },
      full_hash: "fullhash",
      snapshot_at: new Date().toISOString(),
    };
    const amendments = detectAmendments(current, null);
    expect(amendments.length).toBe(2);
    expect(amendments.every((a: StatuteAmendment) => a.change_type === "added")).toBe(true);
  });

  test("detects modified paragraphs", () => {
    const previous: StatuteSnapshot = {
      statute_code: "BGB",
      jurisdiction: "DE",
      paragraph_hashes: { "433": "oldHash", "434": "sameHash" },
      full_hash: "oldFull",
      snapshot_at: "2026-01-01T00:00:00Z",
    };
    const current: StatuteSnapshot = {
      statute_code: "BGB",
      jurisdiction: "DE",
      paragraph_hashes: { "433": "newHash", "434": "sameHash" },
      full_hash: "newFull",
      snapshot_at: new Date().toISOString(),
    };
    const amendments = detectAmendments(current, previous);
    expect(amendments.length).toBe(1);
    expect(amendments[0].paragraph).toBe("433");
    expect(amendments[0].change_type).toBe("modified");
    expect(amendments[0].old_hash).toBe("oldHash");
    expect(amendments[0].new_hash).toBe("newHash");
  });

  test("detects removed paragraphs", () => {
    const previous: StatuteSnapshot = {
      statute_code: "BGB",
      jurisdiction: "DE",
      paragraph_hashes: { "433": "hash1", "434": "hash2" },
      full_hash: "full",
      snapshot_at: "2026-01-01T00:00:00Z",
    };
    const current: StatuteSnapshot = {
      statute_code: "BGB",
      jurisdiction: "DE",
      paragraph_hashes: { "433": "hash1" },
      full_hash: "full2",
      snapshot_at: new Date().toISOString(),
    };
    const amendments = detectAmendments(current, previous);
    expect(amendments.length).toBe(1);
    expect(amendments[0].paragraph).toBe("434");
    expect(amendments[0].change_type).toBe("removed");
  });

  test("detects added paragraphs", () => {
    const previous: StatuteSnapshot = {
      statute_code: "BGB",
      jurisdiction: "DE",
      paragraph_hashes: { "433": "hash1" },
      full_hash: "full",
      snapshot_at: "2026-01-01T00:00:00Z",
    };
    const current: StatuteSnapshot = {
      statute_code: "BGB",
      jurisdiction: "DE",
      paragraph_hashes: { "433": "hash1", "434": "hash2" },
      full_hash: "full2",
      snapshot_at: new Date().toISOString(),
    };
    const amendments = detectAmendments(current, previous);
    expect(amendments.length).toBe(1);
    expect(amendments[0].paragraph).toBe("434");
    expect(amendments[0].change_type).toBe("added");
  });

  test("returns empty when no changes", () => {
    const snapshot: StatuteSnapshot = {
      statute_code: "BGB",
      jurisdiction: "DE",
      paragraph_hashes: { "433": "hash1" },
      full_hash: "full",
      snapshot_at: new Date().toISOString(),
    };
    const amendments = detectAmendments(snapshot, snapshot);
    expect(amendments.length).toBe(0);
  });

  test("detects mixed changes", () => {
    const previous: StatuteSnapshot = {
      statute_code: "BGB",
      jurisdiction: "DE",
      paragraph_hashes: { "433": "old", "434": "same", "435": "removed" },
      full_hash: "full",
      snapshot_at: "2026-01-01T00:00:00Z",
    };
    const current: StatuteSnapshot = {
      statute_code: "BGB",
      jurisdiction: "DE",
      paragraph_hashes: { "433": "new", "434": "same", "436": "added" },
      full_hash: "full2",
      snapshot_at: new Date().toISOString(),
    };
    const amendments = detectAmendments(current, previous);
    expect(amendments.length).toBe(3);
    const types = amendments.map((a) => a.change_type).sort();
    expect(types).toEqual(["added", "modified", "removed"]);
  });
});

// ── Snapshot Storage ──────────────────────────────────────────────────

describe("snapshot storage", () => {
  test("store and load snapshot", () => {
    const snapshot: StatuteSnapshot = {
      statute_code: "BGB",
      jurisdiction: "DE",
      paragraph_hashes: { "433": "hash1" },
      full_hash: "full",
      snapshot_at: new Date().toISOString(),
    };
    storeSnapshot(snapshot);
    const loaded = loadSnapshot("DE", "BGB");
    expect(loaded).not.toBeNull();
    expect(loaded!.statute_code).toBe("BGB");
    expect(loaded!.paragraph_hashes["433"]).toBe("hash1");
  });

  test("load returns null for non-existent snapshot", () => {
    expect(loadSnapshot("DE", "NONEXIST")).toBeNull();
  });

  test("clearSnapshots removes all stored snapshots", () => {
    const snapshot: StatuteSnapshot = {
      statute_code: "BGB",
      jurisdiction: "DE",
      paragraph_hashes: {},
      full_hash: "full",
      snapshot_at: new Date().toISOString(),
    };
    storeSnapshot(snapshot);
    clearSnapshots();
    expect(loadSnapshot("DE", "BGB")).toBeNull();
  });
});

// ── checkStatuteAmendments ────────────────────────────────────────────

describe("checkStatuteAmendments", () => {
  test("returns amendments and stores snapshot", async () => {
    const mockFetch = async (url: string): Promise<Response> => {
      if (url.includes("gesetze-im-internet.de")) {
        return new Response(STATUTE_TEXT, { status: 200 });
      }
      return new Response(null, { status: 404 });
    };

    const result = await checkStatuteAmendments("DE", "BGB", mockFetch as unknown as typeof fetch);
    expect(result.error).toBeUndefined();
    expect(result.snapshot).not.toBeNull();
    expect(result.amendments.length).toBe(3); // All "added" on first run
    expect(result.amendments.every((a) => a.change_type === "added")).toBe(true);

    // Verify snapshot was stored
    const stored = loadSnapshot("DE", "BGB");
    expect(stored).not.toBeNull();
  });

  test("detects modifications on second run", async () => {
    // First run — initial snapshot
    const mockFetch1 = async (): Promise<Response> => new Response(STATUTE_TEXT, { status: 200 });
    await checkStatuteAmendments("DE", "BGB", mockFetch1 as unknown as typeof fetch);

    // Second run — modified text
    const mockFetch2 = async (): Promise<Response> => new Response(STATUTE_TEXT_MODIFIED, { status: 200 });
    const result = await checkStatuteAmendments("DE", "BGB", mockFetch2 as unknown as typeof fetch);

    expect(result.amendments.length).toBe(1);
    expect(result.amendments[0].paragraph).toBe("433");
    expect(result.amendments[0].change_type).toBe("modified");
  });

  test("returns error on fetch failure", async () => {
    const mockFetch = async (): Promise<Response> => new Response(null, { status: 404 });
    const result = await checkStatuteAmendments("DE", "NONEXIST", mockFetch as unknown as typeof fetch);
    expect(result.error).toBeTruthy();
    expect(result.snapshot).toBeNull();
  });

  test("returns error for unsupported jurisdiction", async () => {
    const result = await checkStatuteAmendments("XX" as never, "TEST");
    expect(result.error).toContain("Unsupported");
  });
});

// ── findStaleCitations ────────────────────────────────────────────────

describe("findStaleCitations", () => {
  test("finds outputs citing amended §§", () => {
    const amendments: StatuteAmendment[] = [
      {
        statute_code: "BGB",
        jurisdiction: "DE",
        paragraph: "433",
        change_type: "modified",
        detected_at: new Date().toISOString(),
        source_url: "",
      },
    ];
    const outputs = [
      { slug: "synthesis/kaufvertrag-2026", citations: ["§ 433 BGB", "§ 434 BGB"] },
      { slug: "synthesis/erbrecht-2026", citations: ["§ 1924 BGB"] },
    ];
    const alerts = findStaleCitations(amendments, outputs);
    expect(alerts.length).toBe(1);
    expect(alerts[0].output_slug).toBe("synthesis/kaufvertrag-2026");
    expect(alerts[0].paragraph).toBe("433");
    expect(alerts[0].severity).toBe("high");
  });

  test("assigns critical severity for removed §§", () => {
    const amendments: StatuteAmendment[] = [
      {
        statute_code: "BGB",
        jurisdiction: "DE",
        paragraph: "434",
        change_type: "removed",
        detected_at: new Date().toISOString(),
        source_url: "",
      },
    ];
    const outputs = [
      { slug: "synthesis/test", citations: ["§ 434 BGB"] },
    ];
    const alerts = findStaleCitations(amendments, outputs);
    expect(alerts[0].severity).toBe("critical");
  });

  test("assigns low severity for added §§", () => {
    const amendments: StatuteAmendment[] = [
      {
        statute_code: "BGB",
        jurisdiction: "DE",
        paragraph: "441",
        change_type: "added",
        detected_at: new Date().toISOString(),
        source_url: "",
      },
    ];
    const outputs = [
      { slug: "synthesis/test", citations: ["§ 441 BGB"] },
    ];
    const alerts = findStaleCitations(amendments, outputs);
    expect(alerts[0].severity).toBe("low");
  });

  test("returns empty when no outputs cite amended §§", () => {
    const amendments: StatuteAmendment[] = [
      {
        statute_code: "BGB",
        jurisdiction: "DE",
        paragraph: "433",
        change_type: "modified",
        detected_at: new Date().toISOString(),
        source_url: "",
      },
    ];
    const outputs = [
      { slug: "synthesis/other", citations: ["§ 1924 BGB"] },
    ];
    const alerts = findStaleCitations(amendments, outputs);
    expect(alerts.length).toBe(0);
  });
});

// ── buildFreshnessSummary ─────────────────────────────────────────────

describe("buildFreshnessSummary", () => {
  test("builds summary from reports and alerts", () => {
    const reports: AmendmentReport[] = [
      {
        jurisdiction: "DE",
        total_statutes_checked: 5,
        total_amendments: 2,
        amendments: [],
        checked_at: new Date().toISOString(),
        errors: [],
      },
      {
        jurisdiction: "AT",
        total_statutes_checked: 3,
        total_amendments: 0,
        amendments: [],
        checked_at: new Date().toISOString(),
        errors: ["Failed to fetch ABGB"],
      },
    ];
    const staleAlerts = [
      {
        output_slug: "synthesis/test",
        citation: "§ 433 BGB",
        statute_code: "BGB",
        paragraph: "433",
        change_type: "modified" as const,
        detected_at: new Date().toISOString(),
        severity: "high" as const,
      },
    ];

    const summary = buildFreshnessSummary(reports, staleAlerts);
    expect(summary.total_statutes).toBe(8);
    expect(summary.amendments_detected).toBe(2);
    expect(summary.stale_citations).toBe(1);
    expect(summary.by_jurisdiction.DE.total).toBe(5);
    expect(summary.by_jurisdiction.DE.amendments).toBe(2);
    expect(summary.by_jurisdiction.AT.error).toBe(1);
    expect(summary.last_check).toBeTruthy();
  });
});

// ── fetchEuStatute ────────────────────────────────────────────────────

describe("fetchEuStatute", () => {
  test("fetches and extracts text from EUR-Lex HTML", async () => {
    const mockHtml = `<html><body><script>evil()</script><h1>Regulation (EU) 2016/679</h1><p>This Regulation establishes rules relating to the protection of natural persons with regard to the processing of personal data.</p></body></html>`;
    const mockFetch = async (): Promise<Response> => {
      return new Response(mockHtml, { status: 200, headers: { "Content-Type": "text/html" } });
    };

    const result = await fetchEuStatute("32016R0679", mockFetch as unknown as typeof fetch);
    expect(result).not.toBeNull();
    expect(result!.text).toContain("Regulation (EU) 2016/679");
    expect(result!.text).not.toContain("evil()");
    expect(result!.text).not.toContain("<script>");
    expect(result!.sourceUrl).toContain("CELEX:32016R0679");
  });

  test("returns null on non-ok response", async () => {
    const mockFetch = async (): Promise<Response> => new Response("Not found", { status: 404 });
    const result = await fetchEuStatute("32016R0679", mockFetch as unknown as typeof fetch);
    expect(result).toBeNull();
  });

  test("returns null on network error", async () => {
    const mockFetch = async (): Promise<Response> => {
      throw new Error("Network error");
    };
    const result = await fetchEuStatute("32016R0679", mockFetch as unknown as typeof fetch);
    expect(result).toBeNull();
  });

  test("returns null when extracted text is too short", async () => {
    const mockFetch = async (): Promise<Response> => new Response("<p>Hi</p>", { status: 200 });
    const result = await fetchEuStatute("32016R0679", mockFetch as unknown as typeof fetch);
    expect(result).toBeNull();
  });
});
