import { describe, it, expect } from "vitest";
import { readFileSync, existsSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));

// ─── Fixture Tests ───────────────────────────────────────────────────────

const FIXTURE_PATH = "test/fixtures/abstention-fixtures.jsonl";

function loadFixtures() {
  if (!existsSync(FIXTURE_PATH)) {
    throw new Error(`Abstention fixtures not found: ${FIXTURE_PATH}`);
  }
  const raw = readFileSync(FIXTURE_PATH, "utf-8");
  return raw
    .split("\n")
    .filter((l) => l.trim())
    .map((l) => JSON.parse(l));
}

describe("Abstention Fixtures", () => {
  const fixtures = loadFixtures();

  it("has at least 50 fixtures", () => {
    expect(fixtures.length).toBeGreaterThanOrEqual(50);
  });

  it("has all four DACH jurisdictions", () => {
    const jurisdictions = new Set(fixtures.map((f: any) => f.jurisdiction));
    expect(jurisdictions.has("de")).toBe(true);
    expect(jurisdictions.has("ch")).toBe(true);
    expect(jurisdictions.has("at")).toBe(true);
    expect(jurisdictions.has("eu")).toBe(true);
  });

  it("has at least 15 DE fixtures", () => {
    const de = fixtures.filter((f: any) => f.jurisdiction === "de");
    expect(de.length).toBeGreaterThanOrEqual(15);
  });

  it("has at least 10 CH fixtures", () => {
    const ch = fixtures.filter((f: any) => f.jurisdiction === "ch");
    expect(ch.length).toBeGreaterThanOrEqual(10);
  });

  it("has at least 5 AT fixtures", () => {
    const at = fixtures.filter((f: any) => f.jurisdiction === "at");
    expect(at.length).toBeGreaterThanOrEqual(5);
  });

  it("has at least 5 EU fixtures", () => {
    const eu = fixtures.filter((f: any) => f.jurisdiction === "eu");
    expect(eu.length).toBeGreaterThanOrEqual(5);
  });

  it("every fixture has a missing_law field", () => {
    for (const f of fixtures) {
      expect((f as any).missing_law).toBeTruthy();
      expect(typeof (f as any).missing_law).toBe("string");
    }
  });

  it("every fixture has a reason field explaining the gap", () => {
    for (const f of fixtures) {
      expect((f as any).reason).toBeTruthy();
      expect(typeof (f as any).reason).toBe("string");
      expect((f as any).reason.length).toBeGreaterThan(10);
    }
  });

  it("every fixture has a unique question_id", () => {
    const ids = fixtures.map((f: any) => f.question_id);
    const unique = new Set(ids);
    expect(unique.size).toBe(ids.length);
  });

  it("every fixture has a question with at least 20 characters", () => {
    for (const f of fixtures) {
      expect((f as any).question.length).toBeGreaterThanOrEqual(20);
    }
  });

  it("every fixture has a legal_area", () => {
    for (const f of fixtures) {
      expect((f as any).legal_area).toBeTruthy();
    }
  });

  it("every fixture has a question_type", () => {
    for (const f of fixtures) {
      expect((f as any).question_type).toBeTruthy();
    }
  });

  it("question_ids follow abs-<jur>-NNN pattern", () => {
    for (const f of fixtures) {
      const id = (f as any).question_id;
      expect(id).toMatch(/^abs-(de|ch|at|eu)-\d{3}$/);
    }
  });

  it("every fixture has exists_in_reality: true", () => {
    for (const f of fixtures) {
      expect((f as any).exists_in_reality).toBe(true);
    }
  });
});

// ─── Logic Tests (pure functions, no engine needed) ──────────────────────

describe("Abstention Logic", () => {
  // Test the shouldAbstain heuristic with mock data
  // We replicate the logic here since the runner is a script, not a module

  function shouldAbstain(scores: number[], threshold: number): boolean {
    if (scores.length === 0) return true;
    if (scores[0] < threshold) return true;
    if (scores.length >= 2 && scores[0] < threshold * 2 && scores[1] > scores[0] * 0.8) {
      return true;
    }
    return false;
  }

  function isConfidentHallucination(scores: number[], threshold: number): boolean {
    if (scores.length === 0) return false;
    return scores[0] > threshold * 2;
  }

  it("abstains when no results returned", () => {
    expect(shouldAbstain([], 0.15)).toBe(true);
  });

  it("abstains when top score is below threshold", () => {
    expect(shouldAbstain([0.05, 0.03, 0.01], 0.15)).toBe(true);
  });

  it("does not abstain when top score is clearly above threshold", () => {
    expect(shouldAbstain([0.5, 0.2, 0.1], 0.15)).toBe(false);
  });

  it("abstains when scores are low and close together (uncertain)", () => {
    expect(shouldAbstain([0.18, 0.17, 0.16], 0.15)).toBe(true);
  });

  it("does not abstain when top score is high and gap is large", () => {
    expect(shouldAbstain([0.4, 0.1, 0.05], 0.15)).toBe(false);
  });

  it("detects confident hallucination when score is very high for missing law", () => {
    expect(isConfidentHallucination([0.5, 0.3, 0.2], 0.15)).toBe(true);
  });

  it("does not flag confident hallucination when score is moderate", () => {
    expect(isConfidentHallucination([0.18, 0.1, 0.05], 0.15)).toBe(false);
  });

  it("does not flag confident hallucination when no results", () => {
    expect(isConfidentHallucination([], 0.15)).toBe(false);
  });

  it("extracts law name from slug correctly", () => {
    function extractLawFromSlug(slug: string): string {
      const parts = slug.split("/");
      if (parts.length >= 4 && parts[0] === "legal" && parts[1] === "statutes") {
        return parts[3] ?? slug;
      }
      if (parts.length >= 3 && parts[0] === "law") {
        return parts[2] ?? slug;
      }
      return slug;
    }
    expect(extractLawFromSlug("legal/statutes/de/bgb/p-1295")).toBe("bgb");
    expect(extractLawFromSlug("legal/statutes/at/abgb/p-148")).toBe("abgb");
    expect(extractLawFromSlug("legal/statutes/ch/or/art-41")).toBe("or");
    expect(extractLawFromSlug("law/de/hgb/p-1")).toBe("hgb");
    expect(extractLawFromSlug("some-random-slug")).toBe("some-random-slug");
  });
});

// ─── Corpus Validation Guard (DB-based) ──────────────────────────────────
// Prevents the "9 wrong fixtures" bug from recurring: every missing_law
// claim is verified against the actual DB (pages table), not disk.
// The DB is what the eval actually queries — disk is only a partial subset
// in CI (e.g. AT has 2.315 files on disk but only 88 in git).
//
// When DATABASE_URL is set (CI, local Postgres): guard runs against DB.
// When DATABASE_URL is NOT set: guard is SKIPPED — not fallen back to disk.
// Falling back to disk would give a false sense of coverage (6% for AT).

const DATABASE_URL = process.env.DATABASE_URL;
const GUARD_AVAILABLE = !!DATABASE_URL;

// Lazy-import postgres only when needed (avoids loading in jsdom env)
async function getDbSlugs(jurisdiction: string): Promise<Set<string>> {
  const { default: postgres } = await import("postgres");
  const sql = postgres(DATABASE_URL!, { max: 1 });

  // Map jurisdiction code to slug prefix used in the DB
  // e.g. "de" → "legal/statutes/de/", "eu" → "legal/statutes/eu/"
  const prefix = `legal/statutes/${jurisdiction}/`;

  try {
    const rows = await sql`
      SELECT slug FROM pages
      WHERE source_id LIKE ${"law-" + jurisdiction + "%"}
         OR slug LIKE ${prefix + "%"}
    `;
    return new Set(rows.map((r: any) => r.slug as string));
  } finally {
    await sql.end();
  }
}

// Extract a normalized law identifier from a slug.
// Slug formats:
//   Standard: "legal/statutes/de/bgb/p-1"       → law ID is 4th segment (index 3) = "bgb"
//   Standard: "legal/statutes/at/urhg/p-20b"    → "urhg"
//   Standard: "legal/statutes/ch/or/art-54"     → "or"
//   Standard: "legal/statutes/eu/dsgvo/art-1"   → "dsgvo"
//   Legacy:   "legal/at/medieng"                 → law ID is 3rd segment (index 2) = "medieng"
//   Edge:     "legal/statutes/de/bgb" (no article) → still "bgb" (4th segment)
function slugToLawId(slug: string): string {
  const parts = slug.split("/");
  let lawId: string;
  if (parts[0] === "legal" && parts[1] === "statutes" && parts.length >= 4) {
    // Standard format: legal/statutes/<jur>/<law>[/...]
    lawId = parts[3];
  } else if (parts[0] === "legal" && parts.length >= 3) {
    // Legacy format: legal/<jur>/<law>
    lawId = parts[2];
  } else {
    // Fallback: last segment
    lawId = parts[parts.length - 1];
  }
  // Strip version suffix after underscore (e.g. "amg_1976" → "amg")
  return lawId.split("_")[0].replace(/\.md$/, "");
}

// Extract a normalized law identifier from the missing_law field.
// Handles formats like "BDSG-neu", "KSchG-AT", "ASVG-Pension", "BGB-X-Buch"
// Also normalizes umlauts: ö→oe, ü→ue, ä→ae, ß→ss
function normalizeLawId(missingLaw: string): string {
  // Strip suffixes after hyphen that indicate versions/variants
  // e.g. "BDSG-neu" → "bdsg", "KSchG-AT" → "kschg", "ASVG-Pension" → "asvg"
  const base = missingLaw.split("-")[0];
  return base
    .toLowerCase()
    .replace(/ä/g, "ae")
    .replace(/ö/g, "oe")
    .replace(/ü/g, "ue")
    .replace(/ß/g, "ss")
    .replace(/[^a-z0-9]/g, "");
}

// Check if the missing_law corresponds to a slug in the DB.
function isInCorpusDb(missingLaw: string, dbSlugs: Set<string>): boolean {
  const normalized = normalizeLawId(missingLaw);
  for (const slug of dbSlugs) {
    const lawId = slugToLawId(slug);
    if (lawId === normalized) return true;
    // Also check underscore variants (e.g. "amg" matches "amg_1976")
    if (lawId.startsWith(normalized + "_")) return true;
  }
  return false;
}

describe("Abstention Corpus Validation Guard", () => {
  const fixtures = loadFixtures();

  // Group by jurisdiction for clearer error messages
  const byJur = new Map<string, any[]>();
  for (const f of fixtures) {
    const list = byJur.get((f as any).jurisdiction) ?? [];
    list.push(f);
    byJur.set((f as any).jurisdiction, list);
  }

  // Pre-fetch DB slugs for each jurisdiction (only if DATABASE_URL is set)
  let dbSlugsByJur: Map<string, Set<string>> | null = null;

  async function ensureDbSlugs(): Promise<Map<string, Set<string>>> {
    if (dbSlugsByJur) return dbSlugsByJur;
    dbSlugsByJur = new Map();
    for (const jur of byJur.keys()) {
      const slugs = await getDbSlugs(jur);
      dbSlugsByJur.set(jur, slugs);
    }
    return dbSlugsByJur;
  }

  for (const [jur, list] of byJur) {
    it(`${jur.toUpperCase()}: all ${list.length} missing_law claims are genuinely absent from DB`, async () => {
      if (!GUARD_AVAILABLE) {
        console.warn(
          `[abstention-guard] DATABASE_URL not set — skipping ${jur.toUpperCase()} guard (would be 6% blind on disk)`
        );
        return;
      }

      const slugsMap = await ensureDbSlugs();
      const dbSlugs = slugsMap.get(jur) ?? new Set<string>();

      const violations: string[] = [];
      for (const f of list) {
        const missing = (f as any).missing_law;
        if (isInCorpusDb(missing, dbSlugs)) {
          violations.push(
            `${(f as any).question_id}: claims "${missing}" is missing but found in DB (slug prefix legal/statutes/${jur}/)`
          );
        }
      }
      if (violations.length > 0) {
        throw new Error(
          `${violations.length} fixture(s) claim a law is missing but it IS in the DB:\n` +
            violations.map((v) => `  - ${v}`).join("\n")
        );
      }
    }, 30000); // 30s timeout: DE has many sources matching 'law-de%'
  }
});
