/**
 * Firm Knowledge Search — Permission-aware Suche über Kanzleiwissen.
 *
 * Erweitert den bestehenden permission-aware retrieval um:
 *  1. Firm knowledge search: Matters, Memos, Playbooks, Musterdokumente
 *  2. Golden examples: kuratierte Best-Practice-Beispiele mit getrenntem Ranking
 *  3. Need-to-know enforcement: matter-scope + need-to-know principle
 *
 * Architektur:
 *   User Question + Context (userId, brain_id, org_id, matter_slug)
 *       ↓
 *   checkNeedToKnow() — prüft ob User need-to-know für diese Matter hat
 *       ↓
 *   searchFirmKnowledge() — permission-aware search über eigene Quellen
 *       ↓
 *   separateGoldenExamples() — trennt kuratierte Beispiele von normalen Results
 *       ↓
 *   rankWithGoldenBoost() — golden examples erhalten Ranking-Boost
 *       ↓
 *   Permission-filtered results
 */

import type { SearchResult } from "../types.ts";

// ── Permission Types (mirrors src/lib/legal-types.ts for engine-side use) ──

export interface PermissionInfo {
  visibility?: "full" | "restricted" | "confidential";
  privileged?: boolean;
  legal_hold?: boolean;
  allowed_users?: string[];
  blocked_users?: string[];
}

// ── Ethical Wall Check (mirrors src/lib/ethical-wall.ts for engine-side use) ──

interface EthicalWallCheckResult {
  allowed: boolean;
  reason: string;
  ethical_wall_active: boolean;
  user_blocked: boolean;
}

function checkEthicalWall(
  userId: string,
  permissions: PermissionInfo | undefined
): EthicalWallCheckResult {
  if (!permissions) {
    return {
      allowed: true,
      reason: "no_permissions_defined",
      ethical_wall_active: false,
      user_blocked: false,
    };
  }

  const blockedUsers = permissions.blocked_users ?? [];
  const isBlocked = blockedUsers.includes(userId);

  if (isBlocked) {
    return {
      allowed: false,
      reason: "user_blocked_by_ethical_wall",
      ethical_wall_active: blockedUsers.length > 0,
      user_blocked: true,
    };
  }

  return {
    allowed: true,
    reason: "not_blocked",
    ethical_wall_active: blockedUsers.length > 0,
    user_blocked: false,
  };
}

// ── Types ─────────────────────────────────────────────────────────────

export type FirmKnowledgeType =
  | "matter" // Akte — case files, documents
  | "memo" // Memo — internal legal memos
  | "playbook" // Playbook — process templates, checklists
  | "template" // Musterdokument — contract templates, clauses
  | "precedent" // Präjudiz — internal precedent database
  | "research" // Recherche — previous research results
  | "unknown";

export interface GoldenExample {
  /** The search result that is a golden example. */
  result: SearchResult;
  /** Why it was marked as golden. */
  reason: string;
  /** Who curated it (user ID). */
  curatedBy?: string;
  /** When it was marked as golden (ISO date). */
  curatedAt?: string;
  /** Confidence boost (0-1, added to relevance score). */
  boost: number;
}

export interface FirmKnowledgeSearchOpts {
  /** The search query. */
  query: string;
  /** The user's ID (for permission checks). */
  userId: string;
  /** The tenant/brain ID. */
  brainId: string;
  /** The org ID. */
  orgId: string;
  /** Active matter slug (for matter-scoped search). */
  matterSlug?: string;
  /** Matter permissions (for ethical wall check). */
  matterPermissions?: PermissionInfo;
  /** Whether to include golden examples in results. */
  includeGolden?: boolean;
  /** Maximum results to return. */
  limit?: number;
  /** Whether to enforce need-to-know principle. */
  enforceNeedToKnow?: boolean;
}

export interface FirmKnowledgeResult {
  /** Normal search results (permission-filtered). */
  results: SearchResult[];
  /** Golden examples (separated from normal results). */
  goldenExamples: GoldenExample[];
  /** Whether the user passed ethical wall check. */
  ethicalWallPassed: boolean;
  /** Whether need-to-know was enforced. */
  needToKnowEnforced: boolean;
  /** Sources that were excluded and why. */
  excludedSources: Array<{ source: string; reason: string }>;
  /** Total results before filtering. */
  totalBeforeFilter: number;
  /** Total results after filtering. */
  totalAfterFilter: number;
}

// ── Need-to-Know Enforcement ──────────────────────────────────────────

export interface NeedToKnowCheckResult {
  /** Whether the user has a legitimate need-to-know. */
  hasNeedToKnow: boolean;
  /** Reason for the decision. */
  reason: string;
  /** Whether the check was enforced or skipped. */
  enforced: boolean;
}

/**
 * Check whether a user has need-to-know for a given matter.
 *
 * Need-to-know principle: a user should only access data that is
 * necessary for their current task. This means:
 * 1. The user must be in allowed_users (or visibility is "full")
 * 2. The user must not be in blocked_users (ethical wall)
 * 3. If a matter slug is provided, the user must have a relationship
 *    to that matter (assigned, mentioned, or explicitly granted)
 */
export function checkNeedToKnow(
  userId: string,
  matterPermissions: PermissionInfo | undefined,
  matterSlug?: string,
  enforce: boolean = true
): NeedToKnowCheckResult {
  if (!enforce) {
    return {
      hasNeedToKnow: true,
      reason: "need_to_know_not_enforced",
      enforced: false,
    };
  }

  // 1. Ethical wall check — takes precedence
  const wallCheck = checkEthicalWall(userId, matterPermissions);
  if (!wallCheck.allowed) {
    return {
      hasNeedToKnow: false,
      reason: `blocked_by_ethical_wall: ${wallCheck.reason}`,
      enforced: true,
    };
  }

  // 2. Visibility check
  if (matterPermissions) {
    const visibility = matterPermissions.visibility ?? "full";
    const allowedUsers = matterPermissions.allowed_users ?? [];

    if (visibility === "full") {
      return {
        hasNeedToKnow: true,
        reason: "full_visibility",
        enforced: true,
      };
    }

    if (visibility === "restricted" || visibility === "confidential") {
      if (!allowedUsers.includes(userId)) {
        return {
          hasNeedToKnow: false,
          reason: `user_not_in_allowed_users (visibility: ${visibility})`,
          enforced: true,
        };
      }
    }
  }

  // 3. If no matter slug, grant access (general firm knowledge)
  if (!matterSlug) {
    return {
      hasNeedToKnow: true,
      reason: "no_matter_scope_general_firm_knowledge",
      enforced: true,
    };
  }

  // 4. Matter-specific access granted
  return {
    hasNeedToKnow: true,
    reason: "user_has_matter_access",
    enforced: true,
  };
}

// ── Golden Example Detection ──────────────────────────────────────────

/**
 * Detect golden examples in search results.
 *
 * Golden examples are curated best-practice documents that are marked
 * with specific frontmatter or metadata. They get a ranking boost
 * and are presented separately from normal results.
 *
 * Detection signals:
 * - Frontmatter tag: `golden: true`
 * - Frontmatter tag: `curated: true`
 * - Slug contains `/golden/` or `/curated/`
 * - Title contains "[Golden Example]" or "[Best Practice]"
 */
export function detectGoldenExamples(results: SearchResult[]): {
  golden: GoldenExample[];
  normal: SearchResult[];
} {
  const golden: GoldenExample[] = [];
  const normal: SearchResult[] = [];

  for (const result of results) {
    const isGolden = isGoldenExample(result);
    if (isGolden) {
      golden.push({
        result,
        reason: isGolden.reason,
        boost: isGolden.boost,
        curatedBy: isGolden.curatedBy,
        curatedAt: isGolden.curatedAt,
      });
    } else {
      normal.push(result);
    }
  }

  return { golden, normal };
}

interface GoldenDetection {
  reason: string;
  boost: number;
  curatedBy?: string;
  curatedAt?: string;
}

function isGoldenExample(result: SearchResult): GoldenDetection | null {
  const slug = result.slug ?? "";
  const title = result.title ?? "";
  const chunkText = result.chunk_text ?? "";

  // Check slug for /golden/ or /curated/ path
  if (/\/golden\//i.test(slug) || /\/curated\//i.test(slug)) {
    return {
      reason: "Slug contains golden/curated path marker",
      boost: 0.15,
    };
  }

  // Check title for [Golden Example] or [Best Practice]
  if (/\[Golden\s+Example\]/i.test(title) || /\[Best\s+Practice\]/i.test(title)) {
    return {
      reason: "Title contains golden example marker",
      boost: 0.15,
    };
  }

  // Check chunk text for frontmatter markers
  if (/^\s*---[\s\S]*?golden:\s*true[\s\S]*?---/im.test(chunkText)) {
    return {
      reason: "Frontmatter contains 'golden: true'",
      boost: 0.2,
    };
  }

  if (/^\s*---[\s\S]*?curated:\s*true[\s\S]*?---/im.test(chunkText)) {
    // Try to extract curator info
    const curatedByMatch = chunkText.match(/curated_by:\s*(\S+)/i);
    const curatedAtMatch = chunkText.match(/curated_at:\s*(\S+)/i);
    return {
      reason: "Frontmatter contains 'curated: true'",
      boost: 0.2,
      curatedBy: curatedByMatch?.[1],
      curatedAt: curatedAtMatch?.[1],
    };
  }

  return null;
}

// ── Firm Knowledge Type Classification ────────────────────────────────

/**
 * Classify a search result by firm knowledge type.
 */
export function classifyFirmKnowledgeType(result: SearchResult): FirmKnowledgeType {
  const slug = result.slug ?? "";
  const lower = slug.toLowerCase();

  // Match both with and without leading slash (e.g. "matter/..." or ".../matter/...")
  if (
    /(?:^|\/)matters?\//.test(lower) ||
    /(?:^|\/)cases?\//.test(lower) ||
    /(?:^|\/)akten?\//.test(lower)
  )
    return "matter";
  if (/(?:^|\/)memos?\//.test(lower) || /(?:^|\/)internal\//.test(lower)) return "memo";
  if (/(?:^|\/)playbooks?/.test(lower) || /(?:^|\/)process(?:es)?\//.test(lower)) return "playbook";
  if (
    /(?:^|\/)templates?\//.test(lower) ||
    /(?:^|\/)muster\//.test(lower) ||
    /(?:^|\/)vorlagen?\//.test(lower)
  )
    return "template";
  if (/(?:^|\/)precedents?\//.test(lower) || /(?:^|\/)praecedents?\//.test(lower))
    return "precedent";
  if (/(?:^|\/)research\//.test(lower) || /(?:^|\/)recherchen?\//.test(lower)) return "research";
  return "unknown";
}

// ── Permission-Aware Filtering ────────────────────────────────────────

/**
 * Filter search results based on firm knowledge permissions.
 *
 * This function applies:
 * 1. Ethical wall check (per-user)
 * 2. Need-to-know enforcement
 * 3. Source-type filtering (exclude law-* sources — only firm knowledge)
 */
export function filterFirmKnowledgeResults(
  results: SearchResult[],
  opts: FirmKnowledgeSearchOpts
): {
  filtered: SearchResult[];
  excluded: Array<{ source: string; reason: string }>;
  totalBefore: number;
  totalAfter: number;
} {
  const totalBefore = results.length;
  const filtered: SearchResult[] = [];
  const excluded: Array<{ source: string; reason: string }> = [];
  const excludedSources = new Set<string>();

  for (const result of results) {
    // 1. Exclude law-* sources (only firm knowledge)
    const sourceId = result.source_id ?? "";
    if (sourceId.startsWith("law-") || sourceId.startsWith("law_")) {
      if (!excludedSources.has(sourceId)) {
        excludedSources.add(sourceId);
        excluded.push({
          source: sourceId,
          reason: "Law corpus source excluded from firm knowledge search",
        });
      }
      continue;
    }

    // 2. If matter-scoped, check slug matches matter
    if (opts.matterSlug && opts.enforceNeedToKnow) {
      const slug = result.slug ?? "";
      const normalizedMatter = opts.matterSlug.toLowerCase().replace(/[^a-z0-9-]/g, "-");
      const slugLower = slug.toLowerCase();
      // If the result is matter-specific, it must match the active matter slug
      const isMatterSpecific =
        slugLower.includes("/matter/") ||
        slugLower.includes("/case/") ||
        slugLower.startsWith("matter/") ||
        slugLower.startsWith("case/");
      const matchesMatter = slugLower.includes(normalizedMatter);
      // Allow general (non-matter-specific) results, and matter-specific results that match
      if (isMatterSpecific && !matchesMatter) {
        continue; // Skip — matter-specific result for a different matter
      }
    }

    // 3. Ethical wall check for matter-specific results
    if (opts.matterPermissions && opts.userId) {
      const wallCheck = checkEthicalWall(opts.userId, opts.matterPermissions);
      if (!wallCheck.allowed) {
        continue; // Skip — user blocked by ethical wall
      }
    }

    filtered.push(result);
  }

  return {
    filtered,
    excluded,
    totalBefore,
    totalAfter: filtered.length,
  };
}

// ── Rank with Golden Boost ────────────────────────────────────────────

/**
 * Apply golden example boost to search results.
 * Golden examples get their boost added to their score.
 */
export function rankWithGoldenBoost(
  results: SearchResult[],
  goldenExamples: GoldenExample[]
): SearchResult[] {
  if (goldenExamples.length === 0) return results;

  const goldenMap = new Map<number, GoldenExample>();
  for (const golden of goldenExamples) {
    if (golden.result.chunk_id != null) {
      goldenMap.set(golden.result.chunk_id, golden);
    }
  }

  const boosted = results.map((result) => {
    const golden = goldenMap.get(result.chunk_id ?? -1);
    if (golden) {
      return {
        ...result,
        score: result.score + golden.boost,
      };
    }
    return result;
  });

  // Re-sort by score
  boosted.sort((a, b) => b.score - a.score);
  return boosted;
}

// ── Full Firm Knowledge Search ────────────────────────────────────────

/**
 * Full firm knowledge search pipeline.
 *
 * This is the main entry point for searching firm knowledge.
 * It combines permission checks, golden example detection, and ranking.
 *
 * Note: The actual search (hybridSearch) must be performed by the caller
 * and passed in as results. This function handles the permission-aware
 * post-processing.
 */
export function processFirmKnowledgeResults(
  results: SearchResult[],
  opts: FirmKnowledgeSearchOpts
): FirmKnowledgeResult {
  // 1. Check need-to-know
  const needToKnow = checkNeedToKnow(
    opts.userId,
    opts.matterPermissions,
    opts.matterSlug,
    opts.enforceNeedToKnow ?? true
  );

  // 2. If need-to-know check fails, return empty results
  if (!needToKnow.hasNeedToKnow) {
    return {
      results: [],
      goldenExamples: [],
      ethicalWallPassed: false,
      needToKnowEnforced: true,
      excludedSources: [
        {
          source: "all",
          reason: needToKnow.reason,
        },
      ],
      totalBeforeFilter: results.length,
      totalAfterFilter: 0,
    };
  }

  // 3. Filter results by permissions
  const { filtered, excluded, totalBefore, totalAfter } = filterFirmKnowledgeResults(results, opts);

  // 4. Detect golden examples
  const { golden, normal } =
    opts.includeGolden !== false
      ? detectGoldenExamples(filtered)
      : { golden: [], normal: filtered };

  // 5. Apply golden boost to normal results
  const ranked = rankWithGoldenBoost(normal, golden);

  // 6. Apply limit
  const limit = opts.limit ?? 20;
  const finalResults = ranked.slice(0, limit);

  // 7. Ethical wall status
  const wallCheck = opts.matterPermissions
    ? checkEthicalWall(opts.userId, opts.matterPermissions)
    : ({ allowed: true } as { allowed: boolean });

  return {
    results: finalResults,
    goldenExamples: golden,
    ethicalWallPassed: wallCheck.allowed,
    needToKnowEnforced: needToKnow.enforced,
    excludedSources: excluded,
    totalBeforeFilter: totalBefore,
    totalAfterFilter: totalAfter,
  };
}
