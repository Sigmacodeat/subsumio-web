/**
 * conflict-check.ts — Kanzlei conflict-of-interest check on the entity graph (Gap H).
 *
 * Matches `legal_case` frontmatter (client_name / opponent_name /
 * additional_opponents), `legal_contact` pages and the pipeline's entity
 * pages (`people/*`, type=person) with ROLES, ALIASES and case_refs — the
 * Geschäftsführer of the opposing GmbH, the co-defendant under an alias, the
 * witness who is a client elsewhere.
 *
 * Existing sides:
 *   - legal_case.client_name                       → client side
 *   - legal_case.opponent_name / additional_opponents → opponent side
 *   - entity role opfer/privatbeteiligter/kläger/antragsteller → client side
 *   - entity role beschuldigter/beklagter/angeklagter/antragsgegner → opponent side
 *   - everything else (contacts, witnesses, …)     → contact (informational)
 *
 * The side of the name in the NEW mandate (`side`) decides the severity
 * (§ 10 Abs 1 RAO, § 12a RL-BA 2015):
 *   side=client   — the prospective client appears on the opponent side of an
 *                   existing Akte → critical.
 *   side=opponent — the prospective opponent appears on the client side of an
 *                   existing Akte → critical.
 *   Same-side hits (a returning client, a repeat opponent) are information
 *   only; contact/witness hits and contacts recorded with the opposite role
 *   need a look (low).
 * Without `side` the check cannot know which constellation is new: a name
 * found on both sides across Akten is critical, any other hit is low — never
 * "kein Konflikt" for a known name.
 *
 * Matching is deliberately forgiving (a missed collision is worse than a
 * second look): umlaut/ß folding, case, legal-form suffixes (GmbH, AG, KG,
 * OG, e.U., …), academic titles, name order ("Müller, Max" = "Max Müller")
 * and single-character typos per token (Meier/Maier). The SQL prefilter is
 * token-based on a normalized column expression (plain SQL, identical on
 * PGLite and Postgres); the final decision is made in TypeScript.
 *
 * Deterministic; the only I/O is `engine.executeRaw`.
 */

export interface ConflictEngine {
  executeRaw<T>(sql: string, params?: unknown[]): Promise<T[]>;
}

export type ConflictRole = "client" | "opponent" | "contact";

/** Side of the checked name in the NEW mandate. */
export type ConflictSide = "client" | "opponent";

/**
 * Per-hit assessment relative to the new mandate:
 *   critical — the name stands on the other side in an existing Akte
 *   review   — needs a look (contact / witness / unknown side)
 *   info     — same side (returning client, repeat opponent, own contact)
 */
export type ConflictAssessment = "critical" | "review" | "info";

export interface ConflictMatch {
  slug: string;
  title: string;
  role: ConflictRole;
  /** 'case' | 'contact' | 'entity' — which index the hit came from. */
  quelle: "case" | "contact" | "entity";
  /** Raw entity role (opfer, beschuldigter, zeuge, ...) for entity hits. */
  entity_role?: string;
  /** Role recorded on a legal_contact page (client, opponent, court, …). */
  contact_role?: string;
  /** Akte the entity belongs to (entity hits only). */
  case_ref?: string;
  status: string;
  matched_name: string;
  exact: boolean;
  similarity: number;
  match_type: "exact" | "fuzzy" | "substring";
  assessment: ConflictAssessment;
}

export interface ConflictResult {
  name: string;
  side?: ConflictSide;
  severity: "critical" | "low" | "none";
  explanation: string;
  matches: ConflictMatch[];
  checked_rows: number;
  disclaimer: string;
}

export interface ConflictCheckOptions {
  name: string;
  /** Side of `name` in the new mandate; omitted = side unknown. */
  side?: ConflictSide;
  sourceId?: string;
  /**
   * The Akte being written (update of an existing matter): its own record
   * and the entities that belong to it are not a collision with itself.
   */
  selfCaseSlug?: string;
  /**
   * Contact pages that ARE this party (the client contact picked in the
   * form). Only `legal_contact` hits are dropped — never case or entity hits.
   */
  ownContactSlugs?: string[];
}

// ── Normalization + fuzzy matching ──────────────────────────

function foldUmlauts(s: string): string {
  return s
    .toLowerCase()
    .replace(/ä/g, "ae")
    .replace(/ö/g, "oe")
    .replace(/ü/g, "ue")
    .replace(/ß/g, "ss")
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "");
}

/** Umlaut/ß folding, lowercase, punctuation → space. */
export function normalizeName(s: string): string {
  return foldUmlauts(s)
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Legal-form and connector tokens that do not identify a party. */
const LEGAL_FORM_TOKENS = new Set([
  "gmbh",
  "gesmbh",
  "mbh",
  "ag",
  "kg",
  "og",
  "oeg",
  "keg",
  "eu",
  "ohg",
  "gesbr",
  "gbr",
  "ug",
  "se",
  "eg",
  "ev",
  "kgaa",
  "co",
  "ltd",
  "llc",
  "inc",
  "sa",
  "sarl",
  "bv",
  "nv",
  "plc",
  "und",
  "and",
]);

/** Academic / professional titles and salutations that do not identify a person. */
const TITLE_TOKENS = new Set([
  "dr",
  "ddr",
  "mag",
  "mmag",
  "prof",
  "dipl",
  "ing",
  "di",
  "univ",
  "dkfm",
  "mba",
  "llm",
  "msc",
  "bsc",
  "phd",
  "med",
  "jur",
  "rer",
  "nat",
  "herr",
  "frau",
]);

/**
 * Identifying name tokens: normalized, dotted abbreviations collapsed
 * ("G.m.b.H." → gmbh, "e.U." → eu), legal forms and titles removed, sorted
 * (so "Müller, Max" and "Max Müller" compare equal). Falls back to the raw
 * tokens when nothing identifying remains.
 */
export function nameTokens(s: string): string[] {
  const folded = foldUmlauts(s)
    // "g.m.b.h." / "e.u." / "ges.m.b.h." → one token
    .replace(/\b([a-z]{1,3})\.(?=[a-z]{1,3}\.)/g, "$1")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!folded) return [];
  const raw = folded.split(" ").filter(Boolean);
  const identifying = raw.filter((t) => !LEGAL_FORM_TOKENS.has(t) && !TITLE_TOKENS.has(t));
  return (identifying.length > 0 ? identifying : raw).sort();
}

/** Levenshtein distance with an early exit above `max`. */
export function levenshtein(a: string, b: string, max = Number.POSITIVE_INFINITY): number {
  if (a === b) return 0;
  if (Math.abs(a.length - b.length) > max) return max + 1;
  let prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    let rowMin = i;
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      const v = Math.min(prev[j]! + 1, cur[j - 1]! + 1, prev[j - 1]! + cost);
      cur.push(v);
      if (v < rowMin) rowMin = v;
    }
    if (rowMin > max) return max + 1;
    prev = cur;
  }
  return prev[b.length]!;
}

/**
 * Two name tokens denote the same word: equal, or one typo apart (two for
 * long tokens). Short tokens (< 4 chars) must be equal — "Max"/"May" is not
 * a typo worth flagging.
 */
export function tokensMatch(a: string, b: string): boolean {
  if (a === b) return true;
  const min = Math.min(a.length, b.length);
  if (min < 4) return false;
  const allowed = min >= 8 ? 2 : 1;
  return levenshtein(a, b, allowed) <= allowed;
}

/** Tokens in `from` that find a distinct (fuzzy) partner in `to`. */
function matchedTokenCount(from: string[], to: string[]): { count: number; exactCount: number } {
  const used = new Set<number>();
  let count = 0;
  let exactCount = 0;
  for (const t of from) {
    let idx = to.findIndex((u, i) => !used.has(i) && u === t);
    if (idx >= 0) exactCount++;
    else idx = to.findIndex((u, i) => !used.has(i) && tokensMatch(t, u));
    if (idx >= 0) {
      used.add(idx);
      count++;
    }
  }
  return { count, exactCount };
}

export interface NameMatch {
  match: boolean;
  similarity: number;
  exact: boolean;
}

/**
 * Does `candidate` (a stored name) denote the searched `query` name?
 *   - every query token is found in the candidate (the old "substring"
 *     behaviour, now order-, umlaut-, legal-form- and typo-tolerant), or
 *   - every candidate token is found in the query, as long as the candidate
 *     is more than one short word ("Müller" matches "Anna Müller"; a contact
 *     named "Max" does not match every Max).
 */
export function matchName(query: string, candidate: string): NameMatch {
  const q = nameTokens(query);
  const c = nameTokens(candidate);
  if (q.length === 0 || c.length === 0) return { match: false, similarity: 0, exact: false };
  const qIn = matchedTokenCount(q, c);
  const cIn = matchedTokenCount(c, q);
  const queryContained = qIn.count === q.length;
  const candidateContained = cIn.count === c.length && (c.length >= 2 || c[0]!.length >= 4);
  const matched = Math.max(qIn.count, cIn.count);
  const union = q.length + c.length - matched;
  const typos = matched - Math.max(qIn.exactCount, cIn.exactCount);
  const similarity = union > 0 ? Math.max(0, (matched - 0.1 * typos) / union) : 0;
  const exact = normalizeName(query) === normalizeName(candidate);
  return {
    match: exact || queryContained || candidateContained,
    similarity: exact ? 1 : Math.round(similarity * 100) / 100,
    exact,
  };
}

/** Similarity 0..1 on identifying tokens (order-, form- and typo-tolerant). */
export function nameSimilarity(a: string, b: string): number {
  return matchName(a, b).similarity;
}

/**
 * LIKE patterns that find every stored value containing a query token or a
 * one-edit variant of it (substitution `_`, insertion `_`, deletion). Only
 * a prefilter — `matchName` decides. Patterns hold only [a-z0-9_%].
 */
export function prefilterPatterns(query: string): string[] {
  const tokens = nameTokens(query);
  const usable = tokens.filter((t) => t.length >= 3);
  const base = (usable.length > 0 ? usable : tokens).slice(0, 12);
  const out = new Set<string>();
  for (const t of base) {
    out.add(`%${t}%`);
    if (t.length < 4) continue;
    for (let i = 0; i < t.length; i++) {
      out.add(`%${t.slice(0, i)}_${t.slice(i + 1)}%`); // substitution
      out.add(`%${t.slice(0, i)}${t.slice(i + 1)}%`); // deletion
      if (i > 0) out.add(`%${t.slice(0, i)}_${t.slice(i)}%`); // insertion
    }
  }
  return [...out];
}

/**
 * SQL expression folding umlauts/ß and case — the column-side counterpart of
 * `nameTokens` for the LIKE prefilter. Plain `replace`/`lower`, so it runs
 * identically on PGLite and Postgres (no pg_trgm / unaccent dependency).
 * Uppercase umlauts are folded explicitly because `lower()` under the C
 * collation leaves non-ASCII characters untouched.
 */
function foldSql(expr: string): string {
  let e = `COALESCE(${expr}, '')`;
  for (const [from, to] of [
    ["Ä", "ae"],
    ["Ö", "oe"],
    ["Ü", "ue"],
    ["ä", "ae"],
    ["ö", "oe"],
    ["ü", "ue"],
    ["ß", "ss"],
    ["ẞ", "ss"],
  ] as const) {
    e = `replace(${e}, '${from}', '${to}')`;
  }
  return `lower(${e})`;
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
  additional_opponents?: string | null;
  contact_name: string | null;
  contact_company?: string | null;
  contact_role?: string | null;
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

function parseJsonArray(raw: string | null | undefined): unknown[] {
  if (!raw) return [];
  try {
    const v = JSON.parse(raw) as unknown;
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
}

/** additional_opponents holds strings or `{ name, … }` objects. */
function additionalOpponentNames(raw: string | null | undefined): string[] {
  return parseJsonArray(raw)
    .map((o) =>
      typeof o === "string"
        ? o
        : o && typeof o === "object" && typeof (o as { name?: unknown }).name === "string"
          ? (o as { name: string }).name
          : ""
    )
    .filter((n) => n.trim().length > 0);
}

// ── Assessment ──────────────────────────────────────────────

function assess(
  role: ConflictRole,
  quelle: ConflictMatch["quelle"],
  contactRole: string | undefined,
  side: ConflictSide | undefined
): ConflictAssessment {
  if (!side) return "review";
  const opposite: ConflictSide = side === "client" ? "opponent" : "client";
  if (role === opposite) return "critical";
  if (role === side) return "info";
  // contact / witness / other participant
  if (quelle === "contact" && contactRole === side) return "info";
  return "review";
}

function bestMatch(query: string, values: string[]): { value: string; nm: NameMatch } | null {
  let best: { value: string; nm: NameMatch } | null = null;
  for (const value of values) {
    if (!value.trim()) continue;
    const nm = matchName(query, value);
    if (nm.match && (!best || nm.similarity > best.nm.similarity)) best = { value, nm };
  }
  return best;
}

// ── Main check ──────────────────────────────────────────────

export async function conflictCheck(
  engine: ConflictEngine,
  opts: ConflictCheckOptions
): Promise<ConflictResult> {
  const name = opts.name.trim();
  if (!name) throw new Error("conflict-check: name is required");
  const side = opts.side;
  const patterns = prefilterPatterns(name);
  if (patterns.length === 0) throw new Error("conflict-check: name has no searchable characters");

  const sourceId = opts.sourceId && opts.sourceId !== "default" ? opts.sourceId : null;
  const params: string[] = [...patterns];
  const patternList = patterns.map((_, i) => `$${i + 1}`).join(", ");
  const likeAny = (expr: string) => `${foldSql(expr)} LIKE ANY (ARRAY[${patternList}]::text[])`;
  let sourceClause = "";
  if (sourceId) {
    params.push(sourceId);
    sourceClause = `AND source_id = $${params.length}`;
  }

  // 1) legal_case + legal_contact
  const caseRows = await engine.executeRaw<CaseContactRow>(
    `SELECT slug, title,
            frontmatter->>'client_name' as client_name,
            frontmatter->>'opponent_name' as opponent_name,
            frontmatter->>'additional_opponents' as additional_opponents,
            frontmatter->>'name' as contact_name,
            frontmatter->>'company' as contact_company,
            frontmatter->>'role' as contact_role,
            frontmatter->>'status' as status,
            type as page_type
       FROM pages
       WHERE deleted_at IS NULL ${sourceClause}
         AND COALESCE(frontmatter->>'demo', '') <> 'true'
         AND (
           (type = 'legal_case' AND (
             ${likeAny("frontmatter->>'client_name'")}
             OR ${likeAny("frontmatter->>'opponent_name'")}
             OR ${likeAny("frontmatter->>'additional_opponents'")}
           ))
           OR
           (type = 'legal_contact' AND (
             ${likeAny("frontmatter->>'name'")}
             OR ${likeAny("frontmatter->>'company'")}
             OR ${likeAny("title")}
           ))
         )
       ORDER BY updated_at DESC`,
    params
  );

  // 2) Gap H: pipeline entity pages (people/*) — title AND aliases.
  //    aliases is a JSONB array; the ->>'aliases' text projection makes it
  //    searchable on both engines without unnest gymnastics.
  const entityRows = await engine.executeRaw<EntityRow>(
    `SELECT slug, title,
            frontmatter->>'role' as role,
            frontmatter->>'case_ref' as case_ref,
            frontmatter->>'aliases' as aliases
       FROM pages
       WHERE deleted_at IS NULL ${sourceClause}
         AND COALESCE(frontmatter->>'demo', '') <> 'true'
         AND type = 'person'
         AND frontmatter->>'case_ref' IS NOT NULL
         AND (${likeAny("title")} OR ${likeAny("frontmatter->>'aliases'")})
       ORDER BY updated_at DESC`,
    params
  );

  const ownContacts = new Set((opts.ownContactSlugs ?? []).filter(Boolean));
  const selfCase = opts.selfCaseSlug?.trim() || null;
  const matches: ConflictMatch[] = [];

  const push = (
    base: Omit<ConflictMatch, "exact" | "similarity" | "match_type" | "assessment">,
    nm: NameMatch
  ) => {
    matches.push({
      ...base,
      exact: nm.exact,
      similarity: nm.similarity,
      match_type: nm.exact ? "exact" : nm.similarity >= 0.8 ? "fuzzy" : "substring",
      assessment: assess(base.role, base.quelle, base.contact_role, side),
    });
  };

  for (const r of caseRows) {
    if (r.page_type === "legal_contact") {
      if (ownContacts.has(r.slug)) continue;
      const best = bestMatch(
        name,
        [r.contact_name, r.contact_company, r.title].filter(
          (v): v is string => typeof v === "string"
        )
      );
      if (!best) continue;
      push(
        {
          slug: r.slug,
          title: r.title,
          role: "contact",
          quelle: "contact",
          ...(r.contact_role ? { contact_role: r.contact_role } : {}),
          status: r.status ?? "open",
          matched_name: best.value,
        },
        best.nm
      );
      continue;
    }

    if (selfCase && r.slug === selfCase) continue;
    // One hit per side: "Müller gegen Müller" yields a client AND an opponent hit.
    const perSide: Array<{ role: "client" | "opponent"; names: string[] }> = [
      { role: "client", names: r.client_name ? [r.client_name] : [] },
      {
        role: "opponent",
        names: [
          ...(r.opponent_name ? [r.opponent_name] : []),
          ...additionalOpponentNames(r.additional_opponents),
        ],
      },
    ];
    for (const s of perSide) {
      const best = bestMatch(name, s.names);
      if (!best) continue;
      push(
        {
          slug: r.slug,
          title: r.title,
          role: s.role,
          quelle: "case",
          status: r.status ?? "open",
          matched_name: best.value,
        },
        best.nm
      );
    }
  }

  for (const r of entityRows) {
    if (selfCase && r.case_ref === selfCase) continue;
    const entityRole = r.role ?? "dritt_partei";
    let nm = matchName(name, r.title);
    let matchedName = r.title;
    if (!nm.match) {
      const aliases = parseJsonArray(r.aliases).filter((a): a is string => typeof a === "string");
      for (const alias of aliases) {
        const am = matchName(name, alias);
        if (am.match) {
          nm = am;
          matchedName = `${r.title} (Alias: ${alias})`;
          break;
        }
      }
    }
    if (!nm.match) continue;
    push(
      {
        slug: r.slug,
        title: r.title,
        role: entityRoleToSide(entityRole),
        quelle: "entity",
        entity_role: entityRole,
        case_ref: r.case_ref ?? undefined,
        status: "open",
        matched_name: matchedName,
      },
      nm
    );
  }

  // Deduplicate by slug + role (a case may carry the name on both sides).
  const seen = new Set<string>();
  const deduped = matches.filter((m) => {
    const key = `${m.slug}\u0000${m.role}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  const aktOf = (m: ConflictMatch): string => m.case_ref ?? m.slug;
  const clientAkten = new Set(deduped.filter((m) => m.role === "client").map(aktOf));
  const opponentAkten = new Set(deduped.filter((m) => m.role === "opponent").map(aktOf));
  const rao =
    "Direkter Interessenkonflikt (Doppelvertretungsverbot, § 10 Abs 1 RAO / § 12a RL-BA 2015) — anwaltlich prüfen.";
  const akteCount = (n: number) => (n === 1 ? "einer Akte" : `${n} Akten`);

  let severity: "critical" | "low" | "none";
  let explanation: string;
  if (side) {
    const critical = deduped.filter((m) => m.assessment === "critical");
    const review = deduped.filter((m) => m.assessment === "review");
    const sameSide = side === "client" ? clientAkten : opponentAkten;
    if (critical.length > 0) {
      severity = "critical";
      const akten = new Set(critical.map(aktOf)).size;
      explanation =
        side === "client"
          ? `Der künftige Mandant "${name}" steht in ${akteCount(akten)} auf der Gegnerseite. ${rao}`
          : `Der künftige Gegner "${name}" ist in ${akteCount(akten)} Mandant der Kanzlei. ${rao}`;
    } else if (review.length > 0) {
      severity = "low";
      explanation = `"${name}" ist als Beteiligter oder Kontakt bekannt (${review.length} ${review.length === 1 ? "Eintrag" : "Einträge"}). Kein Seitenwechsel erkannt, aber vor Mandatsannahme prüfen.`;
    } else if (sameSide.size > 0) {
      severity = "none";
      explanation =
        side === "client"
          ? `"${name}" ist bereits auf Mandantenseite in ${akteCount(sameSide.size)} bekannt (Folgemandat). Kein Konflikt erkennbar.`
          : `"${name}" ist bereits auf Gegnerseite in ${akteCount(sameSide.size)} bekannt. Kein Konflikt erkennbar; Verschwiegenheit zwischen den Akten beachten (§ 9 RAO).`;
    } else if (deduped.length > 0) {
      severity = "none";
      explanation = `"${name}" ist nur als Kontakt derselben Seite bekannt. Kein Konflikt erkennbar.`;
    } else {
      severity = "none";
      explanation = `"${name}" ist in keiner Akte bekannt. Kein Konflikt im Kanzleiwissen erkennbar.`;
    }
  } else {
    const crossSide =
      clientAkten.size > 0 &&
      opponentAkten.size > 0 &&
      // at least one pair of DIFFERENT Akten (same-Akt beide Seiten wäre ein Datenfehler)
      [...clientAkten].some((a) => ![...opponentAkten].every((b) => b === a));
    if (crossSide) {
      severity = "critical";
      explanation = `"${name}" erscheint auf Mandantenseite und auf Gegnerseite in verschiedenen Akten. ${rao}`;
    } else if (deduped.length > 0) {
      severity = "low";
      explanation = `"${name}" ist in ${deduped.length === 1 ? "einem Eintrag" : `${deduped.length} Einträgen`} bekannt. Ohne Angabe, ob die Person im neuen Mandat Mandant oder Gegner ist, lässt sich ein Konflikt nicht ausschließen — Treffer prüfen.`;
    } else {
      severity = "none";
      explanation = `"${name}" ist in keiner Akte bekannt. Kein Konflikt im Kanzleiwissen erkennbar.`;
    }
  }

  return {
    name,
    ...(side ? { side } : {}),
    severity,
    explanation,
    matches: deduped,
    checked_rows: caseRows.length + entityRows.length,
    disclaimer:
      "Diese Prüfung ersetzt nicht die anwaltliche Pflicht zur Kollisionsprüfung (§ 10 RAO, § 12a RL-BA 2015; für DE: § 43a Abs 4 BRAO).",
  };
}
