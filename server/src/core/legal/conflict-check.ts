/**
 * conflict-check.ts — Kanzlei conflict-of-interest check on the entity graph (Gap H).
 *
 * The previous implementation (inline in web-api.ts) matched only
 * `legal_case` frontmatter (client_name/opponent_name) and `legal_contact`
 * pages. Real conflicts hide one level deeper: the pipeline's Layer 2 writes
 * entity pages (`people/*`, type=person) with ROLES, ALIASES and case_refs —
 * the Geschäftsführer of the opposing GmbH, the co-defendant under an alias,
 * the witness who is a client elsewhere. This module includes them.
 *
 * Sides:
 *   - legal_case.client_name  → client side
 *   - legal_case.opponent_name → opponent side
 *   - entity role opfer/privatbeteiligter/kläger/antragsteller → client side
 *   - entity role beschuldigter/beklagter/angeklagter/antragsgegner → opponent side
 *   - everything else → contact (informational)
 *
 * Severity:
 *   critical — the name appears on the client side of one Akt and the
 *              opponent side of another (direct Interessenkollision,
 *              Doppelvertretungsverbot § 10 RAO / § 12a RL-BA 2015)
 *   low      — multiple appearances on the same side (watch for adverse
 *              interests / Verschwiegenheit across Akten)
 *   none     — one or zero appearances
 *
 * Deterministic; the only I/O is `engine.executeRaw`. Umlaut-normalized
 * token-Jaccard fuzzy matching catches "Müller" vs "Mueller".
 */

export interface ConflictEngine {
  executeRaw<T>(sql: string, params?: unknown[]): Promise<T[]>;
}

export type ConflictRole = "client" | "opponent" | "contact";

export interface ConflictMatch {
  slug: string;
  title: string;
  role: ConflictRole;
  /** 'case' | 'contact' | 'entity' — which index the hit came from. */
  quelle: "case" | "contact" | "entity";
  /** Raw entity role (opfer, beschuldigter, zeuge, ...) for entity hits. */
  entity_role?: string;
  /** Akte the entity belongs to (entity hits only). */
  case_ref?: string;
  status: string;
  matched_name: string;
  exact: boolean;
  similarity: number;
  match_type: "exact" | "fuzzy" | "substring";
}

export interface ConflictResult {
  name: string;
  severity: "critical" | "low" | "none";
  explanation: string;
  matches: ConflictMatch[];
  checked_rows: number;
  disclaimer: string;
}

// ── Normalization + fuzzy matching ──────────────────────────

export function normalizeName(s: string): string {
  return s
    .toLowerCase()
    .replace(/ä/g, "ae")
    .replace(/ö/g, "oe")
    .replace(/ü/g, "ue")
    .replace(/ß/g, "ss")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function nameSimilarity(a: string, b: string): number {
  const na = normalizeName(a);
  const nb = normalizeName(b);
  if (!na || !nb) return 0;
  if (na === nb) return 1.0;
  const ta = new Set(na.split(" ").filter((t) => t.length > 1));
  const tb = new Set(nb.split(" ").filter((t) => t.length > 1));
  if (ta.size === 0 || tb.size === 0) return 0;
  let common = 0;
  for (const t of ta) if (tb.has(t)) common++;
  return common / (ta.size + tb.size - common);
}

// ── Entity role → side mapping ──────────────────────────────

const CLIENT_SIDE_ROLES =
  /opfer|privatbeteiligt|geschädigt|geschaedigt|kläger|klaeger|antragsteller|betreib/i;
const OPPONENT_SIDE_ROLES =
  /beschuldigt|angeklagt|beklagte|antragsgegner|verpflichtete|tatverdächtig|tatverdaechtig/i;

export function entityRoleToSide(role: string): ConflictRole {
  if (CLIENT_SIDE_ROLES.test(role)) return "client";
  if (OPPONENT_SIDE_ROLES.test(role)) return "opponent";
  return "contact";
}

// ── Row shapes ──────────────────────────────────────────────

interface CaseContactRow {
  slug: string;
  title: string;
  client_name: string | null;
  opponent_name: string | null;
  contact_name: string | null;
  status: string | null;
  page_type: string | null;
}

interface EntityRow {
  slug: string;
  title: string;
  role: string | null;
  case_ref: string | null;
  aliases: string | null;
}

// ── Main check ──────────────────────────────────────────────

export async function conflictCheck(
  engine: ConflictEngine,
  opts: { name: string; sourceId?: string }
): Promise<ConflictResult> {
  const name = opts.name.trim();
  if (!name) throw new Error("conflict-check: name is required");
  const normName = normalizeName(name);
  const lowerName = name.toLowerCase();

  const sourceId = opts.sourceId && opts.sourceId !== "default" ? opts.sourceId : null;
  const sourceClauseCases = sourceId ? "AND source_id = $3" : "";
  const caseParams: string[] = sourceId
    ? [`%${name}%`, `%${normName}%`, sourceId]
    : [`%${name}%`, `%${normName}%`];

  // 1) legal_case + legal_contact (existing behavior)
  const caseRows = await engine.executeRaw<CaseContactRow>(
    `SELECT slug, title,
            frontmatter->>'client_name' as client_name,
            frontmatter->>'opponent_name' as opponent_name,
            frontmatter->>'name' as contact_name,
            frontmatter->>'status' as status,
            type as page_type
       FROM pages
       WHERE deleted_at IS NULL ${sourceClauseCases}
         AND (
           (type = 'legal_case' AND (
             frontmatter->>'client_name' ILIKE $1 OR frontmatter->>'opponent_name' ILIKE $1
             OR frontmatter->>'client_name' ILIKE $2 OR frontmatter->>'opponent_name' ILIKE $2
           ))
           OR
           (type = 'legal_contact' AND (
             frontmatter->>'name' ILIKE $1 OR frontmatter->>'name' ILIKE $2
             OR frontmatter->>'company' ILIKE $1 OR frontmatter->>'company' ILIKE $2
           ))
         )
       ORDER BY updated_at DESC`,
    caseParams
  );

  // 2) Gap H: pipeline entity pages (people/*) — name, title AND aliases.
  //    aliases is a JSONB array; the ->>'aliases' text projection makes it
  //    substring-searchable on both engines without unnest gymnastics.
  const entityRows = await engine.executeRaw<EntityRow>(
    `SELECT slug, title,
            frontmatter->>'role' as role,
            frontmatter->>'case_ref' as case_ref,
            frontmatter->>'aliases' as aliases
       FROM pages
       WHERE deleted_at IS NULL ${sourceClauseCases}
         AND type = 'person'
         AND frontmatter->>'case_ref' IS NOT NULL
         AND (
           title ILIKE $1 OR title ILIKE $2
           OR frontmatter->>'aliases' ILIKE $1 OR frontmatter->>'aliases' ILIKE $2
         )
       ORDER BY updated_at DESC`,
    caseParams
  );

  const matches: ConflictMatch[] = [];

  for (const r of caseRows) {
    let role: ConflictRole;
    let matchedName: string;
    if (r.page_type === "legal_contact") {
      role = "contact";
      matchedName = r.contact_name ?? r.title ?? "";
    } else {
      const clientMatch =
        (r.client_name ?? "").toLowerCase().includes(lowerName) ||
        normalizeName(r.client_name ?? "").includes(normName);
      const opponentMatch =
        (r.opponent_name ?? "").toLowerCase().includes(lowerName) ||
        normalizeName(r.opponent_name ?? "").includes(normName);
      if (clientMatch) {
        role = "client";
        matchedName = r.client_name ?? "";
      } else if (opponentMatch) {
        role = "opponent";
        matchedName = r.opponent_name ?? "";
      } else {
        role = "client";
        matchedName = r.client_name ?? r.opponent_name ?? "";
      }
    }
    const sim = nameSimilarity(name, matchedName);
    const exact = matchedName.toLowerCase() === lowerName;
    matches.push({
      slug: r.slug,
      title: r.title,
      role,
      quelle: r.page_type === "legal_contact" ? "contact" : "case",
      status: r.status ?? "open",
      matched_name: matchedName,
      exact,
      similarity: Math.round(sim * 100) / 100,
      match_type: exact ? "exact" : sim >= 0.8 ? "fuzzy" : "substring",
    });
  }

  for (const r of entityRows) {
    const entityRole = r.role ?? "dritt_partei";
    // matched via title or via alias — prefer whichever actually matched
    let matchedName = r.title;
    if (
      !(r.title.toLowerCase().includes(lowerName) || normalizeName(r.title).includes(normName)) &&
      r.aliases
    ) {
      // find the alias that matched
      try {
        const aliasList: string[] = Array.isArray(JSON.parse(r.aliases))
          ? JSON.parse(r.aliases)
          : [];
        const hit = aliasList.find(
          (a) => a.toLowerCase().includes(lowerName) || normalizeName(a).includes(normName)
        );
        if (hit) matchedName = `${r.title} (Alias: ${hit})`;
      } catch {
        // aliases not valid JSON — keep title
      }
    }
    const sim = nameSimilarity(name, r.title);
    const exact = r.title.toLowerCase() === lowerName;
    matches.push({
      slug: r.slug,
      title: r.title,
      role: entityRoleToSide(entityRole),
      quelle: "entity",
      entity_role: entityRole,
      case_ref: r.case_ref ?? undefined,
      status: "open",
      matched_name: matchedName,
      exact,
      similarity: Math.round(sim * 100) / 100,
      match_type: exact ? "exact" : sim >= 0.8 ? "fuzzy" : "substring",
    });
  }

  // Deduplicate by slug
  const seen = new Set<string>();
  const deduped = matches.filter((m) => {
    if (seen.has(m.slug)) return false;
    seen.add(m.slug);
    return true;
  });

  // Severity: cross-side appearance across DIFFERENT Akten is critical.
  // For entity hits the Akt is case_ref; for case hits it's the case slug.
  const aktOf = (m: ConflictMatch): string => m.case_ref ?? m.slug;
  const clientAkten = new Set(deduped.filter((m) => m.role === "client").map(aktOf));
  const opponentAkten = new Set(deduped.filter((m) => m.role === "opponent").map(aktOf));
  const crossSide =
    clientAkten.size > 0 &&
    opponentAkten.size > 0 &&
    // at least one pair of DIFFERENT Akten (same-Akt beide Seiten wäre ein Datenfehler)
    [...clientAkten].some((a) => ![...opponentAkten].every((b) => b === a));

  let severity: "critical" | "low" | "none";
  let explanation: string;
  if (crossSide) {
    severity = "critical";
    explanation =
      `"${name}" erscheint auf Mandantenseite und auf Gegnerseite in verschiedenen Akten. ` +
      `Direkter Interessenkonflikt (Doppelvertretungsverbot, § 10 Abs 1 RAO / § 12a RL-BA 2015) — anwaltlich prüfen.`;
  } else if (clientAkten.size > 1 || opponentAkten.size > 1) {
    severity = "low";
    explanation =
      clientAkten.size > 1
        ? `"${name}" ist auf Mandantenseite in ${clientAkten.size} Akten bekannt. Kein direkter Konflikt, aber auf gegensätzliche Interessen prüfen.`
        : `"${name}" ist auf Gegnerseite in ${opponentAkten.size} Akten bekannt. Kein direkter Konflikt, aber Wissensverwertung zwischen den Akten beachten (Verschwiegenheit § 9 RAO).`;
  } else if (deduped.length >= 1) {
    severity = "none";
    explanation = `"${name}" ist in ${deduped.length === 1 ? "einer Akte" : `${deduped.length} Einträgen`} bekannt. Kein Konflikt erkennbar.`;
  } else {
    severity = "none";
    explanation = `"${name}" ist in keiner Akte bekannt. Kein Konflikt im Brain erkennbar.`;
  }

  return {
    name,
    severity,
    explanation,
    matches: deduped,
    checked_rows: caseRows.length + entityRows.length,
    disclaimer:
      "Diese Prüfung ersetzt nicht die anwaltliche Pflicht zur Kollisionsprüfung (§ 10 RAO, § 12a RL-BA 2015; für DE: § 43a Abs 4 BRAO).",
  };
}
