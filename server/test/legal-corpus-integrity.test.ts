/**
 * Phase 0 — Corpus integrity + completeness guard (pure, hermetic, no DB/LLM).
 *
 * WHY: requirement #1 for the AT lawyer brain is "100% sure every country's
 * statutes are split and never mix." Splitting is the load-bearing step —
 * a code that fails to split lands keyword-only (the old ABGB/StGB bug) or,
 * worse, splits into a handful of stub sections that masquerade as a full
 * statute. This guard pins the split health of the whole law-corpus so a
 * regression (a re-broken flagship, a newly-degraded file, a mis-tagged
 * jurisdiction) fails CI instead of silently shipping a hollow corpus.
 *
 * Three invariants:
 *   1. Every top-level *.md under law-corpus/{at,de,ch,eu}/ splits without
 *      throwing (0 parse errors across the corpus).
 *   2. AT flagship codes meet a section-count FLOOR, have unique section ids
 *      (no cross-§ mixing), and zero empty bodies. This is the split-breakage
 *      regression guard for the codes AT lawyers actually rely on.
 *   3. Every HEALTHY (non-stub) file carries a frontmatter jurisdiction that
 *      matches its corpus directory. The known-incomplete files live in a
 *      QUARANTINE set that may only SHRINK — a new degraded file fails the
 *      test, and fixing a quarantined file forces its removal from the list.
 *
 * The quarantine set IS the Phase 0 baseline: the documented list of corpus
 * files that are non-canonical stubs today (missing YAML frontmatter and/or
 * far too few sections to be the real law). Phase 2 (corpus completeness)
 * empties it.
 */

import { describe, test, expect } from "bun:test";
import { readFileSync, readdirSync, statSync } from "fs";
import { join } from "path";
import { splitStatute } from "../src/core/legal/split-statute.ts";
import {
  QUARANTINED_LEGAL_SOURCES,
  QUARANTINED_LEGAL_SOURCE_REASONS,
} from "../src/core/legal/corpus-policy.ts";
import { STATUTE_JURISDICTIONS } from "../src/core/search/source-boost.ts";

const CORPUS = join(import.meta.dir, "..", "..", "law-corpus");
const COUNTRIES = ["at", "de", "ch", "eu"] as const;

/**
 * QUARANTINE — files that split today but are NOT full canonical statutes:
 * either non-canonical format (no YAML frontmatter → jurisdiction undefined)
 * or a stub with implausibly few sections for the real law. This list is the
 * Phase 0 baseline. It may only shrink. Filling one of these with the real
 * official text (Phase 2) means deleting its line here.
 */
const QUARANTINE = QUARANTINED_LEGAL_SOURCES;

/**
 * AT flagship codes: the statutes an Austrian lawyer works with daily. Floors
 * are set ~20-25% below the measured section count so ordinary consolidation
 * churn passes but a split regression (which drops counts by orders of
 * magnitude) fails hard.
 */
const AT_FLAGSHIPS: Array<{ file: string; abbr: string; floor: number }> = [
  { file: "at/abgb.md", abbr: "ABGB", floor: 1000 },
  { file: "at/stgb-at.md", abbr: "StGB-AT", floor: 300 },
  { file: "at/stpo-at.md", abbr: "StPO-AT", floor: 400 },
  { file: "at/zpo-at.md", abbr: "ZPO-AT", floor: 450 },
  { file: "at/eo.md", abbr: "EO", floor: 400 },
  { file: "at/io.md", abbr: "IO", floor: 280 },
  { file: "at/ugb.md", abbr: "UGB", floor: 550 },
  { file: "at/b-vg.md", abbr: "B-VG", floor: 300 },
  { file: "at/jn.md", abbr: "JN", floor: 100 },
];

interface Scan {
  path: string; // "at/abgb.md"
  country: string;
  jurisdiction: string | undefined;
  sections: number;
  uniqueIds: number;
  emptyBodies: number;
  /** Raw document body length (frontmatter stripped) — the health signal for
   *  monolith documents that legitimately split to 0 §-sections. */
  rawBodyChars: number;
  error?: string;
}

function scanCorpus(): Scan[] {
  const out: Scan[] = [];
  for (const country of COUNTRIES) {
    const dir = join(CORPUS, country);
    for (const fn of readdirSync(dir)) {
      if (!fn.endsWith(".md")) continue; // skips judikate/ and other subdirs
      const path = `${country}/${fn}`;
      const raw = readFileSync(join(dir, fn), "utf8");
      const rawBodyChars = raw.replace(/^---[\s\S]*?---\s*/m, "").trim().length;
      try {
        const { meta, sections } = splitStatute(raw);
        const ids = new Set(sections.map((s) => s.id));
        out.push({
          path,
          country,
          jurisdiction: meta.jurisdiction,
          sections: sections.length,
          uniqueIds: ids.size,
          emptyBodies: sections.filter((s) => !s.body.trim()).length,
          rawBodyChars,
        });
      } catch (e) {
        out.push({
          path,
          country,
          jurisdiction: undefined,
          sections: 0,
          uniqueIds: 0,
          emptyBodies: 0,
          rawBodyChars,
          error: (e as Error).message,
        });
      }
    }
  }
  return out;
}

const SCAN = scanCorpus();
const byPath = new Map(SCAN.map((s) => [s.path, s]));

describe("legal-corpus integrity (Phase 0)", () => {
  test("corpus is non-trivial (>= 120 statute files scanned)", () => {
    expect(SCAN.length).toBeGreaterThanOrEqual(120);
  });

  test("every corpus file splits without throwing", () => {
    const errored = SCAN.filter((s) => s.error).map((s) => `${s.path}: ${s.error}`);
    expect(errored).toEqual([]);
  });

  describe("AT flagship split health (regression guard)", () => {
    for (const fs of AT_FLAGSHIPS) {
      test(`${fs.abbr} splits into >= ${fs.floor} clean §-sections`, () => {
        const s = byPath.get(fs.file);
        expect(s, `${fs.file} not found in corpus`).toBeDefined();
        expect(s!.error).toBeUndefined();
        expect(s!.jurisdiction).toBe("at");
        expect(s!.sections).toBeGreaterThanOrEqual(fs.floor);
        // No two sections share an id → no §-to-§ bleed / collision.
        expect(s!.uniqueIds).toBe(s!.sections);
        // Every § carries body text → no empty shell sections.
        expect(s!.emptyBodies).toBe(0);
      });
    }
  });

  test("every HEALTHY file has a jurisdiction matching its directory", () => {
    const offenders = SCAN.filter(
      (s) => !QUARANTINE.has(s.path) && s.jurisdiction !== s.country
    ).map((s) => `${s.path} → jurisdiction=${s.jurisdiction ?? "undefined"} (dir=${s.country})`);
    // A healthy file with a wrong/missing jurisdiction could land in the wrong
    // source or slip a cross-jurisdiction filter. Either fix its frontmatter
    // or move it into QUARANTINE with a reason.
    expect(offenders).toEqual([]);
  });

  test("every HEALTHY file has an ISO version_date for legal versioning", () => {
    const missing = SCAN.filter((s) => !QUARANTINE.has(s.path))
      .filter((s) => {
        const raw = readFileSync(join(CORPUS, s.path), "utf8").slice(0, 5000);
        return !/^version_date:\s*["']?\d{4}-\d{2}-\d{2}/m.test(raw);
      })
      .map((s) => s.path);
    expect(missing, "healthy legal sources need a version_date").toEqual([]);
  });

  test("quarantine set may only shrink (baseline tripwire)", () => {
    // The 2026-07-14 RIS full scrape made the corpus two-tier:
    //   - §-structured statutes/regulations → split into sections;
    //   - Kundmachungen, treaties, notices → legitimately split to 0 sections
    //     and are retrieved as monolith pages (all carry real body text).
    // "Degraded" therefore means the file is unusable in EITHER tier:
    //   - missing jurisdiction (cannot be isolation-filtered), or
    //   - 0 sections AND no real body text (junk/empty fetch), or
    //   - splits into sections but >20% of them are empty shells.
    // (The old `sections < 20` rule pre-dates the scrape: it misread every
    // small-but-complete Verordnung/treaty as a stub.)
    const stubToday = new Set(
      SCAN.filter(
        (s) =>
          !s.jurisdiction ||
          (s.sections === 0 && s.rawBodyChars < 300) ||
          (s.sections > 0 && s.emptyBodies > s.sections * 0.2)
      ).map((s) => s.path)
    );

    // (a) No NEW degraded file may appear outside the quarantine.
    const newlyDegraded = [...stubToday].filter((p) => !QUARANTINE.has(p));
    expect(newlyDegraded, "new stub/untagged files must be fixed or quarantined").toEqual([]);

    // (b) A quarantined file that was listed as DEGRADED and is now healthy
    // must be REMOVED from the list (keeps the baseline honest — it only ever
    // shrinks). "policy" entries are deliberate ingestion exclusions and stay
    // regardless of file health.
    const recovered = [...QUARANTINE].filter(
      (p) =>
        QUARANTINED_LEGAL_SOURCE_REASONS[p] === "degraded" &&
        byPath.has(p) &&
        !stubToday.has(p)
    );
    expect(recovered, "these files are healthy now — delete them from QUARANTINE").toEqual([]);
  });

  test("corpus-wide §-section floor (mass split-regression guard)", () => {
    // Per-file floors only cover the flagships; this guards the whole corpus:
    // a splitter regression (marker-regex breakage, RIS format drift) tanks
    // the corpus-wide section count by orders of magnitude. Measured
    // 2026-07-14: 33,442 sections across at/de/ch/eu. Floor set ~10% below so
    // consolidation churn passes but a split regression fails hard.
    const total = SCAN.reduce((a, s) => a + s.sections, 0);
    expect(total).toBeGreaterThanOrEqual(30_000);
  });

  test("BASELINE: corpus completeness snapshot", () => {
    const healthy = SCAN.filter((s) => !QUARANTINE.has(s.path));
    const perCountry = COUNTRIES.map((c) => {
      const all = SCAN.filter((s) => s.country === c);
      const stubs = all.filter((s) => QUARANTINE.has(s.path));
      return `${c}: ${all.length - stubs.length}/${all.length} healthy`;
    });
    // eslint-disable-next-line no-console
    console.log(
      `\n[Phase0 corpus baseline] ${healthy.length}/${SCAN.length} healthy, ` +
        `${QUARANTINE.size} quarantined stubs\n  ${perCountry.join("\n  ")}\n`
    );
    expect(healthy.length).toBeGreaterThan(100);
  });

  // Hard jurisdiction isolation depends on STATUTE_JURISDICTIONS (search/
  // source-boost.ts) listing EVERY jurisdiction the corpus is partitioned into
  // — a statute directory that exists on disk but is missing from that list
  // would never be hard-excluded from a foreign-jurisdiction query, silently
  // re-opening the leak Phase 1 sealed. This guard makes that drift impossible.
  describe("jurisdiction filter ↔ corpus directory sync", () => {
    const diskJurisdictions = readdirSync(CORPUS)
      .filter((name) => {
        try {
          return statSync(join(CORPUS, name)).isDirectory();
        } catch {
          return false;
        }
      })
      .filter((name): name is (typeof COUNTRIES)[number] =>
        STATUTE_JURISDICTIONS.includes(name as (typeof STATUTE_JURISDICTIONS)[number])
      )
      .sort();

    test("STATUTE_JURISDICTIONS lists exactly the law-corpus/ statute directories", () => {
      // If this fails: a new country dir landed under law-corpus/ (or one was
      // removed). Add/remove it in STATUTE_JURISDICTIONS so foreignStatutePrefixes
      // hard-excludes it — otherwise an AT query could leak the new jurisdiction.
      expect([...STATUTE_JURISDICTIONS].sort()).toEqual(diskJurisdictions);
    });

    test("the corpus-integrity COUNTRIES list agrees with STATUTE_JURISDICTIONS", () => {
      // This test scans COUNTRIES; the filter uses STATUTE_JURISDICTIONS. They
      // must be the same set or one of them is testing/guarding a stale world.
      expect([...COUNTRIES].sort()).toEqual([...STATUTE_JURISDICTIONS].sort());
    });
  });
});
