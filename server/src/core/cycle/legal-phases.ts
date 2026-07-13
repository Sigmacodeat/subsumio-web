/**
 * v0.43 — Legal dream cycle phases.
 *
 * Four phases that run during the maintenance cycle to keep legal data
 * fresh and actionable:
 *
 * 1. legal_statute_currency — checks if statute versions in the brain
 *    are current vs the law-corpus reference files. Flags outdated
 *    statutes in the cycle report.
 * 2. legal_deadline_monitor — scans the real deadline pages (deadline_calendar
 *    tables + deadline/legal_deadline frontmatter) and classifies every date
 *    with the deterministic frist-engine (klassifiziereFrist: Werktage +
 *    Vorfrist), emitting warnings for überfällige/kritische Fristen.
 * 3. legal_case_progression — tracks case status changes since last
 *    cycle and generates progression summaries.
 * 4. legal_precedent_linkage — links legal_case pages to relevant
 *    statute sections (case_to_statute), opponent entities
 *    (case_to_opponent), lawyer/court/client entities (entity_to_case),
 *    and other cases (legal_precedent) via typed graph edges.
 *
 * All four are opt-in (default OFF) via config gates. They run after
 * the main graph-mutating cluster so they see fresh state.
 */

import type { BrainEngine } from "../engine.ts";
import type { PhaseResult, PhaseStatus } from "../cycle.ts";
import { parseDeadlineTable, parseDeadlineDate } from "../legal/fristenbuch.ts";
import { klassifiziereFrist, type FristStatus } from "../legal/frist-engine.ts";

export interface LegalPhaseOpts {
  dryRun?: boolean;
  sourceId?: string;
  signal?: AbortSignal;
  /**
   * Reference date (ISO `YYYY-MM-DD`) for deadline classification. Defaults to
   * the real today. The dream cycle passes the real date; tests pass a fixed
   * date so the deterministic Werktag/Vorfrist classification is reproducible.
   */
  today?: string;
}

// ─── Phase 1: Statute Currency Check ──────────────────────────────

export async function runPhaseLegalStatuteCurrency(
  engine: BrainEngine,
  opts: LegalPhaseOpts
): Promise<PhaseResult> {
  try {
    // Query all statute sections grouped by jurisdiction + abbreviation
    const rows = await engine.executeRaw<{
      slug: string;
      frontmatter: Record<string, unknown> | null;
      updated_at: string;
    }>(
      `SELECT slug, frontmatter, updated_at::text
       FROM pages
       WHERE slug LIKE 'legal/statutes/%'
         AND deleted_at IS NULL
         ${opts.sourceId ? `AND source_id = $1` : ""}
       ORDER BY slug
       LIMIT 5000`,
      opts.sourceId ? [opts.sourceId] : []
    );

    const byStatute = new Map<
      string,
      {
        jurisdiction: string;
        abbreviation: string;
        version_date: string | null;
        section_count: number;
        newest_update: string;
      }
    >();

    for (const row of rows) {
      const parts = row.slug.split("/");
      const jur = parts[2] ?? "unknown";
      const abbr = parts[3] ?? "unknown";
      const key = `${jur}/${abbr}`;
      const fm = row.frontmatter ?? {};
      const versionDate = typeof fm.version_date === "string" ? fm.version_date : null;

      const existing = byStatute.get(key);
      if (existing) {
        existing.section_count++;
        if (versionDate && (!existing.version_date || versionDate > existing.version_date)) {
          existing.version_date = versionDate;
        }
        if (row.updated_at > existing.newest_update) existing.newest_update = row.updated_at;
      } else {
        byStatute.set(key, {
          jurisdiction: jur,
          abbreviation: abbr.toUpperCase(),
          version_date: versionDate,
          section_count: 1,
          newest_update: row.updated_at,
        });
      }
    }

    const statutes = Array.from(byStatute.values());
    const withoutVersion = statutes.filter((s) => !s.version_date);

    // Live comparison: check first 10 statutes per jurisdiction against external sources
    const outdatedFromLive: Array<{
      statute_id: string;
      brain_version: string | null;
      live_version: string | null;
      source: string;
    }> = [];
    try {
      const { fetchLiveStatuteVersion } = await import("../../lib/statute-live-source.ts");
      const byJur = new Map<string, string[]>();
      for (const [key, s] of byStatute) {
        const jur = s.jurisdiction;
        if (!["at", "de", "ch"].includes(jur)) continue;
        if (!byJur.has(jur)) byJur.set(jur, []);
        byJur.get(jur)!.push(s.abbreviation.toLowerCase());
      }
      for (const [jur, abbrs] of byJur) {
        for (const abbr of abbrs.slice(0, 10)) {
          const live = await fetchLiveStatuteVersion(jur as "at" | "de" | "ch", abbr);
          if (live?.version_date) {
            const brainStatute = statutes.find(
              (s) => s.jurisdiction === jur && s.abbreviation.toLowerCase() === abbr
            );
            if (
              brainStatute &&
              brainStatute.version_date &&
              brainStatute.version_date < live.version_date
            ) {
              outdatedFromLive.push({
                statute_id: `${jur}/${brainStatute.abbreviation}`,
                brain_version: brainStatute.version_date,
                live_version: live.version_date,
                source: live.source,
              });
            }
          }
        }
      }
    } catch {
      // Live comparison failed — skip silently
    }

    const status: PhaseStatus =
      withoutVersion.length > 0 || outdatedFromLive.length > 0 ? "warn" : "ok";

    return {
      phase: "legal_statute_currency",
      status,
      duration_ms: 0,
      summary:
        `${statutes.length} statute(s) across ${new Set(statutes.map((s) => s.jurisdiction)).size} jurisdiction(s)` +
        (withoutVersion.length > 0 ? `; ${withoutVersion.length} without version_date` : "") +
        (outdatedFromLive.length > 0 ? `; ${outdatedFromLive.length} outdated vs live source` : ""),
      details: {
        total_statutes: statutes.length,
        total_sections: rows.length,
        jurisdictions: Array.from(new Set(statutes.map((s) => s.jurisdiction))),
        statutes_without_version_date: withoutVersion.map(
          (s) => `${s.jurisdiction}/${s.abbreviation}`
        ),
        outdated_from_live: outdatedFromLive,
        statutes: statutes.map((s) => ({
          statute_id: `${s.jurisdiction}/${s.abbreviation}`,
          version_date: s.version_date,
          section_count: s.section_count,
          newest_update: s.newest_update,
          status: s.version_date ? "current" : "unknown",
        })),
      },
    };
  } catch (e) {
    return {
      phase: "legal_statute_currency",
      status: "fail",
      duration_ms: 0,
      summary: "legal_statute_currency phase failed",
      details: {},
      error: {
        class: "InternalError",
        code: "UNKNOWN",
        message: e instanceof Error ? e.message : String(e),
      },
    };
  }
}

// ─── Phase 2: Deadline Monitor ────────────────────────────────────

export async function runPhaseLegalDeadlineMonitor(
  engine: BrainEngine,
  opts: LegalPhaseOpts
): Promise<PhaseResult> {
  try {
    const today = opts.today ?? new Date().toISOString().split("T")[0];

    // Scan the REAL deadline pages the pipeline + API actually produce:
    //   deadline_calendar — one page per case, holding a markdown deadline
    //     TABLE (written by legal-pipeline Layer 5, read by the Fristenbuch).
    //   deadline / legal_deadline — frontmatter-shaped single-deadline pages
    //     (ai-deadlines API route; legal_deadline kept for forward-compat).
    // Every date is classified with the DETERMINISTIC frist-engine
    // (klassifiziereFrist: Werktage + Vorfrist), the same authority the
    // Fristenbuch uses — so the dream monitor and the Fristenbuch can never
    // disagree on whether a deadline is critical.
    const rows = await engine.executeRaw<{
      slug: string;
      title: string;
      type: string;
      compiled_truth: string | null;
      frontmatter: Record<string, unknown> | null;
    }>(
      `SELECT slug, type, compiled_truth, frontmatter,
              COALESCE(frontmatter->>'title', slug) as title
       FROM pages
       WHERE type IN ('deadline_calendar', 'deadline', 'legal_deadline')
         AND deleted_at IS NULL
         ${opts.sourceId ? `AND source_id = $1` : ""}
       ORDER BY slug
       LIMIT 2000`,
      opts.sourceId ? [opts.sourceId] : []
    );

    // Deterministic Ampel classes from klassifiziereFrist.
    let ueberfaellig = 0; // overdue
    let kritisch = 0; // ≤2 Werktage
    let vorfrist = 0; // within the Vorfrist window (default 7 days)
    let ok = 0; // beyond the Vorfrist window
    let done = 0; // explicitly marked done
    let undated = 0; // no parseable date → can't classify

    const flagged: Array<{ slug: string; title: string; due_date: string; status: FristStatus }> = [];

    const tally = (
      slug: string,
      label: string,
      iso: string | null,
      markedDone: boolean
    ): void => {
      if (markedDone) {
        done++;
        return;
      }
      if (!iso) {
        undated++;
        return;
      }
      const status = klassifiziereFrist(iso, today);
      if (status === "ueberfaellig") ueberfaellig++;
      else if (status === "kritisch") kritisch++;
      else if (status === "vorfrist") vorfrist++;
      else ok++;
      if (status !== "ok") {
        flagged.push({ slug, title: label, due_date: iso, status });
      }
    };

    for (const row of rows) {
      if (row.type === "deadline_calendar") {
        // One page → many deadline rows in a markdown table.
        for (const dr of parseDeadlineTable(row.compiled_truth ?? "")) {
          const iso = parseDeadlineDate(dr.datum);
          const label = dr.frist || row.title;
          tally(row.slug, label, iso, false);
        }
      } else {
        // Single deadline described in frontmatter.
        const fm = row.frontmatter ?? {};
        const status = typeof fm.status === "string" ? fm.status : "pending";
        const dueRaw = typeof fm.due_date === "string" ? fm.due_date : null;
        const iso = dueRaw ? parseDeadlineDate(dueRaw) : null;
        tally(row.slug, row.title, iso, status === "done");
      }
    }

    const totalDeadlines = ueberfaellig + kritisch + vorfrist + ok + done + undated;
    const phaseStatus: PhaseStatus = ueberfaellig > 0 || kritisch > 0 ? "warn" : "ok";

    return {
      phase: "legal_deadline_monitor",
      status: phaseStatus,
      duration_ms: 0,
      summary: `${totalDeadlines} deadline(s) across ${rows.length} page(s): ${ueberfaellig} überfällig, ${kritisch} kritisch, ${vorfrist} Vorfrist, ${ok} ok, ${done} done, ${undated} ohne Datum`,
      details: {
        pages: rows.length,
        total: totalDeadlines,
        ueberfaellig,
        kritisch,
        vorfrist,
        ok,
        done,
        undated,
        // Legacy aliases so any older consumer keeps reading (overdue==überfällig,
        // critical==kritisch, warning==Vorfrist). New code should use the
        // deterministic names above.
        overdue: ueberfaellig,
        critical: kritisch,
        warning: vorfrist,
        flagged: flagged.sort((a, b) => a.due_date.localeCompare(b.due_date)),
        checked_at: today,
      },
    };
  } catch (e) {
    return {
      phase: "legal_deadline_monitor",
      status: "fail",
      duration_ms: 0,
      summary: "legal_deadline_monitor phase failed",
      details: {},
      error: {
        class: "InternalError",
        code: "UNKNOWN",
        message: e instanceof Error ? e.message : String(e),
      },
    };
  }
}

// ─── Phase 3: Case Progression ────────────────────────────────────

export async function runPhaseLegalCaseProgression(
  engine: BrainEngine,
  opts: LegalPhaseOpts
): Promise<PhaseResult> {
  try {
    // Query legal_case pages and their current status
    const rows = await engine.executeRaw<{
      slug: string;
      frontmatter: Record<string, unknown> | null;
      updated_at: string;
    }>(
      `SELECT slug, frontmatter, updated_at::text
       FROM pages
       WHERE type = 'legal_case'
         AND deleted_at IS NULL
         ${opts.sourceId ? `AND source_id = $1` : ""}
       ORDER BY updated_at DESC
       LIMIT 2000`,
      opts.sourceId ? [opts.sourceId] : []
    );

    const byStatus = new Map<string, number>();
    const recentChanges: Array<{ slug: string; status: string; updated_at: string }> = [];

    // Consider changes in the last 24h as "recent"
    const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

    for (const row of rows) {
      const fm = row.frontmatter ?? {};
      const status = typeof fm.status === "string" ? fm.status : "unknown";
      byStatus.set(status, (byStatus.get(status) ?? 0) + 1);

      if (row.updated_at > cutoff) {
        recentChanges.push({ slug: row.slug, status, updated_at: row.updated_at });
      }
    }

    const statusBreakdown = Array.from(byStatus.entries()).map(([status, count]) => ({
      status,
      count,
    }));

    return {
      phase: "legal_case_progression",
      status: "ok",
      duration_ms: 0,
      summary: `${rows.length} case(s); ${recentChanges.length} updated in last 24h`,
      details: {
        total_cases: rows.length,
        status_breakdown: statusBreakdown,
        recent_changes: recentChanges,
      },
    };
  } catch (e) {
    return {
      phase: "legal_case_progression",
      status: "fail",
      duration_ms: 0,
      summary: "legal_case_progression phase failed",
      details: {},
      error: {
        class: "InternalError",
        code: "UNKNOWN",
        message: e instanceof Error ? e.message : String(e),
      },
    };
  }
}

// ─── Phase 4: Precedent Linkage + Typed Legal Edges ──────────────

export async function runPhaseLegalPrecedentLinkage(
  engine: BrainEngine,
  opts: LegalPhaseOpts
): Promise<PhaseResult> {
  try {
    if (opts.dryRun) {
      return {
        phase: "legal_precedent_linkage",
        status: "skipped",
        duration_ms: 0,
        summary: "dry-run: legal_precedent_linkage skipped (no dry-run mode)",
        details: { dryRun: true, reason: "no_dry_run_support" },
      };
    }

    const sourceFilter = opts.sourceId ? `AND source_id = $1` : "";
    const sourceParams = opts.sourceId ? [opts.sourceId] : [];

    // Find legal_case + court_decision pages (case law) for statute linking.
    // court_decision covers AT/DE/CH Judikatur imports (type set by frontmatter).
    const cases = await engine.executeRaw<{
      slug: string;
      body: string;
      frontmatter: Record<string, unknown> | null;
    }>(
      `SELECT slug, compiled_truth as body, frontmatter FROM pages
       WHERE type IN ('legal_case', 'court_decision', 'eu_court_decision')
         AND deleted_at IS NULL
         ${sourceFilter}
       ORDER BY slug
       LIMIT 2000`,
      sourceParams
    );

    // Find statute sections for linking
    const statutes = await engine.executeRaw<{ slug: string }>(
      `SELECT slug FROM pages
       WHERE slug LIKE 'legal/statutes/%'
         AND deleted_at IS NULL
         ${sourceFilter}
       LIMIT 5000`,
      sourceParams
    );

    // Find legal_entity pages for entity→case linking
    const entities = await engine.executeRaw<{ slug: string }>(
      `SELECT slug FROM pages
       WHERE type = 'legal_entity'
         AND deleted_at IS NULL
         ${sourceFilter}
       LIMIT 5000`,
      sourceParams
    );

    const statuteSlugs = new Set(statutes.map((s) => s.slug));
    const entitySlugs = new Set(entities.map((e) => e.slug));
    let linksCreated = 0;
    let casesProcessed = 0;
    let statuteLinks = 0;
    let opponentLinks = 0;
    let entityLinks = 0;

    for (const caseRow of cases) {
      casesProcessed++;
      const fm = caseRow.frontmatter ?? {};
      const linkOpts = opts.sourceId
        ? { fromSourceId: opts.sourceId, toSourceId: opts.sourceId }
        : undefined;

      // ── 1. Case → Statute typed edges (case_to_statute) ──
      // Extract statute references from case body (e.g., "§ 823 BGB", "§ 1295 ABGB", "Art. 41 OR")
      const refs = caseRow.body.match(/§\s*\d+[a-z]?\s*[A-Z]+|Art\.\s*\d+[a-z]?\s*[A-Z]+/g) ?? [];

      for (const ref of refs) {
        const match = ref.match(/(?:§\s*(\d+[a-z]?)\s*|Art\.\s*(\d+[a-z]?)\s*)([A-Z]+)/);
        if (!match) continue;
        const sectionNum = match[1] ?? match[2];
        const abbr = match[3].toLowerCase();

        for (const jur of ["de", "at", "ch"]) {
          const candidateSlug = `legal/statutes/${jur}/${abbr}/§-${sectionNum}`;
          if (statuteSlugs.has(candidateSlug)) {
            try {
              await engine.addLink(
                caseRow.slug,
                candidateSlug,
                ref,
                "case_to_statute",
                "legal-dream",
                undefined,
                undefined,
                linkOpts
              );
              linksCreated++;
              statuteLinks++;
            } catch {
              // best-effort
            }
            break;
          }
        }
      }

      // ── 2. Case → Opponent typed edges (case_to_opponent) ──
      // Link from case to opponent entity if frontmatter has opponent_id
      const opponentId = typeof fm.opponent_id === "string" ? fm.opponent_id : undefined;
      const opponentSlug = typeof fm.opponent_slug === "string" ? fm.opponent_slug : undefined;
      const opponentTarget =
        opponentSlug ?? (opponentId ? `legal/entities/${opponentId}` : undefined);

      if (opponentTarget && entitySlugs.has(opponentTarget)) {
        try {
          await engine.addLink(
            caseRow.slug,
            opponentTarget,
            "opponent",
            "case_to_opponent",
            "legal-dream",
            undefined,
            undefined,
            linkOpts
          );
          linksCreated++;
          opponentLinks++;
        } catch {
          // best-effort
        }
      }

      // ── 3. Entity → Case typed edges (entity_to_case) ──
      // Link lawyer, court, client entities to this case
      const entityFields = [
        { field: "lawyer_id", slugField: "lawyer_slug", role: "lawyer" },
        { field: "court_id", slugField: "court_slug", role: "court" },
        { field: "client_id", slugField: "client_slug", role: "client" },
      ];

      for (const ef of entityFields) {
        const entityId = typeof fm[ef.field] === "string" ? (fm[ef.field] as string) : undefined;
        const entitySlug =
          typeof fm[ef.slugField] === "string" ? (fm[ef.slugField] as string) : undefined;
        const target = entitySlug ?? (entityId ? `legal/entities/${entityId}` : undefined);

        if (target && entitySlugs.has(target)) {
          try {
            await engine.addLink(
              target,
              caseRow.slug,
              ef.role,
              "entity_to_case",
              "legal-dream",
              undefined,
              undefined,
              linkOpts
            );
            linksCreated++;
            entityLinks++;
          } catch {
            // best-effort
          }
        }
      }

      // ── 4. Case → Case precedent edges (legal_precedent) ──
      // Extract references to other cases (e.g., "Az. XII ZR 123/21", "Rechtssache 123 C")
      const caseRefPattern =
        /(?:Az\.?\s*|Rechtssache\s+|Rs\.\s*)([A-Z0-9]+\s*[A-Z]+\s*\d+\/\d+|[\w-]+)/g;
      const caseRefs = caseRow.body.match(caseRefPattern) ?? [];

      for (const caseRef of caseRefs) {
        // Try to find a matching case slug by searching titles
        const cleanRef = caseRef.replace(/^(?:Az\.?\s*|Rechtssache\s+|Rs\.\s+)/, "").trim();
        if (cleanRef.length < 5) continue;

        // Look for cases whose slug or title contains this reference
        const matchingCases = await engine.executeRaw<{ slug: string }>(
          `SELECT slug FROM pages
           WHERE type = 'legal_case'
             AND deleted_at IS NULL
             AND (slug ILIKE $1 OR title ILIKE $1)
             AND slug != $2
             ${sourceFilter}
             LIMIT 5`,
          opts.sourceId
            ? [`%${cleanRef}%`, caseRow.slug, opts.sourceId]
            : [`%${cleanRef}%`, caseRow.slug]
        );

        for (const matchCase of matchingCases) {
          try {
            await engine.addLink(
              caseRow.slug,
              matchCase.slug,
              caseRef,
              "legal_precedent",
              "legal-dream",
              undefined,
              undefined,
              linkOpts
            );
            linksCreated++;
          } catch {
            // best-effort
          }
        }
      }
    }

    return {
      phase: "legal_precedent_linkage",
      status: "ok",
      duration_ms: 0,
      summary: `${linksCreated} legal link(s) created across ${casesProcessed} case(s) — statute: ${statuteLinks}, opponent: ${opponentLinks}, entity: ${entityLinks}`,
      details: {
        cases_processed: casesProcessed,
        links_created: linksCreated,
        statute_links: statuteLinks,
        opponent_links: opponentLinks,
        entity_links: entityLinks,
        statutes_available: statuteSlugs.size,
        entities_available: entitySlugs.size,
      },
    };
  } catch (e) {
    return {
      phase: "legal_precedent_linkage",
      status: "fail",
      duration_ms: 0,
      summary: "legal_precedent_linkage phase failed",
      details: {},
      error: {
        class: "InternalError",
        code: "UNKNOWN",
        message: e instanceof Error ? e.message : String(e),
      },
    };
  }
}
