/**
 * P31-SB-001: Engine-side Matter Scope extensions.
 *
 * This module implements the engine-side pieces of the Kanzlei Superbrain /
 * Legal Context Graph that were left open after the web-app MVP:
 *
 * 1. Temporal Memory: superseded_by / contradicts relationships between pages.
 *    When a newer page supersedes an older one, the think pipeline can exclude
 *    stale evidence and flag contradictions in the synthesis.
 *
 * 2. Connector Coverage Matrix: tracks which data connectors (DMS, Email,
 *    WhatsApp, Portal, Upload) have contributed pages for each case, enabling
 *    the web-app's coverage checker to query the engine instead of guessing.
 *
 * 3. Entity Resolution: maps entity mentions in page content to canonical
 *    entity slugs, so the think pipeline can resolve "Dr. Müller" in a
 *    document to the person page "legal/persons/mueller".
 *
 * 4. MCP Exposure: the operations registered in operations.ts expose
 *    matter_scope, connector_coverage, and resolve_entity to MCP clients.
 */

import type { BrainEngine } from './engine.ts';

// ── Temporal Memory ───────────────────────────────────────────────────

export interface TemporalRelation {
  slug: string;
  superseded_by: string | null;
  contradicts: string[];
  superseded_at: string | null;
}

/**
 * Mark a page as superseded by a newer version. The old page gets a
 * `superseded_by` frontmatter field pointing to the new slug, and the
 * new page gets a `supersedes` field pointing back.
 */
export async function markSuperseded(
  engine: BrainEngine,
  oldSlug: string,
  newSlug: string,
  sourceId?: string,
): Promise<void> {
  // Update old page: add superseded_by
  try {
    const oldPage = await engine.getPage(oldSlug, { sourceId });
    if (oldPage) {
      const fm = (oldPage.frontmatter ?? {}) as Record<string, unknown>;
      fm.superseded_by = newSlug;
      fm.superseded_at = new Date().toISOString();
      await engine.putPage(oldSlug, {
        ...oldPage,
        frontmatter: fm,
      }, { sourceId });
    }
  } catch {
    // Non-fatal: best-effort temporal tracking
  }

  // Update new page: add supersedes
  try {
    const newPage = await engine.getPage(newSlug, { sourceId });
    if (newPage) {
      const fm = (newPage.frontmatter ?? {}) as Record<string, unknown>;
      const existing = Array.isArray(fm.supersedes) ? fm.supersedes as string[] : [];
      if (!existing.includes(oldSlug)) {
        fm.supersedes = [...existing, oldSlug];
      }
      await engine.putPage(newSlug, {
        ...newPage,
        frontmatter: fm,
      }, { sourceId });
    }
  } catch {
    // Non-fatal
  }
}

/**
 * Mark a contradiction between two pages. Both pages get a `contradicts`
 * frontmatter field pointing to each other.
 */
export async function markContradiction(
  engine: BrainEngine,
  slugA: string,
  slugB: string,
  sourceId?: string,
): Promise<void> {
  for (const [a, b] of [[slugA, slugB], [slugB, slugA]] as const) {
    try {
      const page = await engine.getPage(a, { sourceId });
      if (!page) continue;
      const fm = (page.frontmatter ?? {}) as Record<string, unknown>;
      const existing = Array.isArray(fm.contradicts) ? fm.contradicts as string[] : [];
      if (!existing.includes(b)) {
        fm.contradicts = [...existing, b];
      }
      await engine.putPage(a, { ...page, frontmatter: fm }, { sourceId });
    } catch {
      // Non-fatal
    }
  }
}

/**
 * Query temporal relations for a page. Returns superseded_by and contradicts
 * from the page's frontmatter.
 */
export async function getTemporalRelations(
  engine: BrainEngine,
  slug: string,
  sourceId?: string,
): Promise<TemporalRelation> {
  try {
    const page = await engine.getPage(slug, { sourceId });
    if (!page) {
      return { slug, superseded_by: null, contradicts: [], superseded_at: null };
    }
    const fm = (page.frontmatter ?? {}) as Record<string, unknown>;
    return {
      slug,
      superseded_by: typeof fm.superseded_by === 'string' ? fm.superseded_by : null,
      superseded_at: typeof fm.superseded_at === 'string' ? fm.superseded_at : null,
      contradicts: Array.isArray(fm.contradicts) ? fm.contradicts as string[] : [],
    };
  } catch {
    return { slug, superseded_by: null, contradicts: [], superseded_at: null };
  }
}

/**
 * Filter out superseded pages from a list of search results.
 * Pages with `superseded_by` in frontmatter are excluded.
 */
export function filterSuperseded<T extends { frontmatter?: Record<string, unknown> }>(
  results: T[],
): T[] {
  return results.filter(r => {
    const fm = r.frontmatter;
    if (!fm || typeof fm.superseded_by !== 'string') return true;
    return !fm.superseded_by;
  });
}

// ── Connector Coverage Matrix ─────────────────────────────────────────

export type ConnectorType = 'dms' | 'email' | 'whatsapp' | 'portal' | 'upload' | 'bea' | 'manual';

export interface ConnectorCoverageEntry {
  case_slug: string;
  connector: ConnectorType;
  page_count: number;
  last_sync: string | null;
}

/**
 * Query connector coverage for a case. Returns how many pages each connector
 * has contributed, based on the `source_connector` frontmatter field.
 */
export async function getConnectorCoverage(
  engine: BrainEngine,
  caseSlug: string,
  sourceId?: string,
): Promise<ConnectorCoverageEntry[]> {
  try {
    const rows = await engine.executeRaw<{
      source_connector: string | null;
      count: number;
      max_created: string;
    }>(
      `SELECT
         frontmatter->>'source_connector' AS source_connector,
         count(*)::int AS count,
         max(created_at)::text AS max_created
       FROM pages
       WHERE slug LIKE $1 || '%'
         AND ($2::text IS NULL OR source_id = $2::text)
       GROUP BY frontmatter->>'source_connector'
       ORDER BY count DESC`,
      [caseSlug, sourceId ?? null],
    );

    const connectorMap: Record<string, ConnectorType> = {
      dms: 'dms',
      email: 'email',
      whatsapp: 'whatsapp',
      portal: 'portal',
      upload: 'upload',
      bea: 'bea',
      manual: 'manual',
    };

    return rows.map(r => {
      const connector = r.source_connector
        ? (connectorMap[r.source_connector] ?? 'manual')
        : 'manual';
      return {
        case_slug: caseSlug,
        connector,
        page_count: r.count,
        last_sync: r.max_created,
      } satisfies ConnectorCoverageEntry;
    });
  } catch {
    return [];
  }
}

/**
 * Get coverage matrix for multiple cases at once.
 */
export async function getConnectorCoverageMatrix(
  engine: BrainEngine,
  caseSlugs: string[],
  sourceId?: string,
): Promise<Record<string, ConnectorCoverageEntry[]>> {
  const result: Record<string, ConnectorCoverageEntry[]> = {};
  for (const slug of caseSlugs) {
    result[slug] = await getConnectorCoverage(engine, slug, sourceId);
  }
  return result;
}

// ── Entity Resolution ─────────────────────────────────────────────────

export interface EntityResolutionResult {
  mention: string;
  resolved_slug: string | null;
  confidence: number;
  entity_type: string | null;
}

/**
 * Resolve an entity mention (e.g. "Dr. Müller" or "LG Wien") to a canonical
 * entity page slug. Searches person and organization pages by name.
 */
export async function resolveEntity(
  engine: BrainEngine,
  mention: string,
  sourceId?: string,
): Promise<EntityResolutionResult> {
  if (!mention.trim()) {
    return { mention, resolved_slug: null, confidence: 0, entity_type: null };
  }

  try {
    // Search for person/organization pages matching the mention
    const results = await engine.searchKeyword(mention, {
      limit: 5,
      types: ['person', 'organization'],
      sourceId,
    });

    if (results.length === 0) {
      return { mention, resolved_slug: null, confidence: 0, entity_type: null };
    }

    const top = results[0]!;
    // Confidence based on whether the title closely matches the mention
    const title = top.title ?? '';
    const confidence = title.toLowerCase().includes(mention.toLowerCase()) ? 0.9 : 0.5;

    return {
      mention,
      resolved_slug: top.slug,
      confidence,
      entity_type: top.type ?? null,
    };
  } catch {
    return { mention, resolved_slug: null, confidence: 0, entity_type: null };
  }
}

/**
 * Batch resolve multiple entity mentions.
 */
export async function resolveEntities(
  engine: BrainEngine,
  mentions: string[],
  sourceId?: string,
): Promise<EntityResolutionResult[]> {
  const results: EntityResolutionResult[] = [];
  for (const mention of mentions) {
    results.push(await resolveEntity(engine, mention, sourceId));
  }
  return results;
}
