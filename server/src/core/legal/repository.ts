/**
 * Legal Brain Repository
 *
 * Stores legal entities and cases as brain pages with special types.
 * Uses the existing `pages` table — no schema migration needed.
 *
 * Legal Entity → page.type = 'legal-entity'
 * Legal Case   → page.type = 'legal-case'
 * Evidence     → embedded in case frontmatter
 * Strategy     → embedded in case frontmatter
 * Outcome      → embedded in case frontmatter
 *
 * Privacy: every row carries source_id so legal data is scoped to the
 * owner's brain source and never leaks across sources.
 */

import type postgres from "postgres";
import type {
  LegalCase,
  LegalCaseCreateInput,
  LegalEntity,
  LegalEntityCreateInput,
  EvidenceCreateInput,
  Strategy,
  Outcome,
} from "./types.ts";
import { generateCaseNumber, generateDisplayTitle } from "./anonymizer.ts";
import { slugifyPath } from "../sync.ts";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function now(): string {
  return new Date().toISOString();
}

function toPageFrontmatter(entity: LegalEntity): Record<string, any> {
  return {
    legal_type: entity.type,
    legal_areas: entity.legalAreas,
    specializations: entity.specializations,
    jurisdiction: entity.jurisdiction,
    jurisdiction_level: entity.jurisdictionLevel,
    contact_hash: entity.contactHash,
    anonymized_case_count: entity.anonymizedCaseCount,
    win_rate: entity.winRate,
    tags: entity.tags,
    updated_at: entity.updatedAt,
  };
}

function fromPageFrontmatter(
  slug: string,
  type: string,
  title: string,
  frontmatter: Record<string, unknown>,
  sourceId: string,
  createdAt: string
): LegalEntity {
  return {
    id: slug,
    type: (frontmatter.legal_type as LegalEntity["type"]) || "lawyer",
    displayName: title,
    legalAreas: (frontmatter.legal_areas as string[]) || [],
    specializations: (frontmatter.specializations as string[]) || [],
    jurisdiction: (frontmatter.jurisdiction as string) || "",
    jurisdictionLevel:
      (frontmatter.jurisdiction_level as LegalEntity["jurisdictionLevel"]) || "local",
    contactHash: (frontmatter.contact_hash as string) || undefined,
    anonymizedCaseCount: (frontmatter.anonymized_case_count as number) || 0,
    winRate: (frontmatter.win_rate as number) || undefined,
    notes: "", // stored in page body
    tags: (frontmatter.tags as string[]) || [],
    createdAt,
    updatedAt: (frontmatter.updated_at as string) || createdAt,
    ownerSource: sourceId,
  };
}

function toCaseFrontmatter(legalCase: LegalCase): Record<string, any> {
  return {
    case_number: legalCase.caseNumber,
    legal_area: legalCase.legalArea,
    sub_area: legalCase.subArea,
    status: legalCase.status,
    priority: legalCase.priority,
    opponent_id: legalCase.opponentId,
    own_lawyer_id: legalCase.ownLawyerId,
    court_id: legalCase.courtId,
    client_id: legalCase.clientId,
    claims: legalCase.claims,
    defenses: legalCase.defenses,
    evidence: legalCase.evidence,
    strategy: legalCase.strategy,
    outcome: legalCase.outcome,
    similar_case_ids: legalCase.similarCaseIds,
    precedent_case_ids: legalCase.precedentCaseIds,
    estimated_value: legalCase.estimatedValue,
    tags: legalCase.tags,
    updated_at: legalCase.updatedAt,
  };
}

function fromCaseFrontmatter(
  slug: string,
  title: string,
  frontmatter: Record<string, unknown>,
  sourceId: string,
  createdAt: string
): LegalCase {
  return {
    id: slug,
    caseNumber: (frontmatter.case_number as string) || slug,
    displayTitle: title,
    legalArea: (frontmatter.legal_area as string) || "",
    subArea: (frontmatter.sub_area as string) || undefined,
    status: (frontmatter.status as LegalCase["status"]) || "open",
    priority: (frontmatter.priority as LegalCase["priority"]) || "medium",
    opponentId: (frontmatter.opponent_id as string) || "",
    ownLawyerId: (frontmatter.own_lawyer_id as string) || undefined,
    courtId: (frontmatter.court_id as string) || undefined,
    clientId: (frontmatter.client_id as string) || undefined,
    facts: "", // stored in page body
    claims: (frontmatter.claims as string[]) || [],
    defenses: (frontmatter.defenses as string[]) || [],
    evidence: (frontmatter.evidence as LegalCase["evidence"]) || [],
    strategy: (frontmatter.strategy as Strategy) || undefined,
    outcome: (frontmatter.outcome as Outcome) || undefined,
    similarCaseIds: (frontmatter.similar_case_ids as string[]) || [],
    precedentCaseIds: (frontmatter.precedent_case_ids as string[]) || [],
    estimatedValue: (frontmatter.estimated_value as LegalCase["estimatedValue"]) || undefined,
    tags: (frontmatter.tags as string[]) || [],
    createdAt,
    updatedAt: (frontmatter.updated_at as string) || createdAt,
    ownerSource: sourceId,
  };
}

// ---------------------------------------------------------------------------
// Entity Repository
// ---------------------------------------------------------------------------

export class LegalEntityRepository {
  constructor(
    private sql: ReturnType<typeof postgres>,
    private sourceId: string
  ) {}

  async create(input: LegalEntityCreateInput): Promise<LegalEntity> {
    const slug = slugifyPath(input.displayName);
    const createdAt = now();

    const entity: LegalEntity = {
      id: slug,
      type: input.type,
      displayName: input.displayName,
      legalAreas: input.legalAreas || [],
      specializations: input.specializations || [],
      jurisdiction: input.jurisdiction || "",
      jurisdictionLevel: input.jurisdictionLevel || "local",
      notes: input.notes || "",
      tags: input.tags || [],
      anonymizedCaseCount: 0,
      createdAt,
      updatedAt: createdAt,
      ownerSource: this.sourceId,
    };

    await this.sql`
      INSERT INTO pages (source_id, slug, type, title, frontmatter, compiled_truth)
      VALUES (
        ${this.sourceId},
        ${slug},
        'legal-entity',
        ${input.displayName},
        ${this.sql.json(toPageFrontmatter(entity))}::jsonb,
        ${input.notes || ""}
      )
      ON CONFLICT (source_id, slug) DO NOTHING
    `;

    return entity;
  }

  async getById(id: string): Promise<LegalEntity | null> {
    const rows = await this.sql`
      SELECT slug, type, title, frontmatter, created_at
      FROM pages
      WHERE source_id = ${this.sourceId}
        AND slug = ${id}
        AND type = 'legal-entity'
      LIMIT 1
    `;
    if (rows.length === 0) return null;
    const r = rows[0];
    return fromPageFrontmatter(
      r.slug as string,
      r.type as string,
      r.title as string,
      (r.frontmatter as Record<string, unknown>) || {},
      this.sourceId,
      (r.created_at as string) || now()
    );
  }

  async list(options?: {
    type?: LegalEntity["type"];
    legalArea?: string;
    jurisdiction?: string;
    limit?: number;
    offset?: number;
  }): Promise<LegalEntity[]> {
    const limit = options?.limit ?? 100;
    const offset = options?.offset ?? 0;

    let query = this.sql`
      SELECT slug, type, title, frontmatter, created_at
      FROM pages
      WHERE source_id = ${this.sourceId}
        AND type = 'legal-entity'
    `;

    if (options?.type) {
      query = this.sql`${query} AND frontmatter->>'legal_type' = ${options.type}`;
    }
    if (options?.legalArea) {
      query = this
        .sql`${query} AND frontmatter->'legal_areas' @> ${this.sql.json([options.legalArea])}::jsonb`;
    }
    if (options?.jurisdiction) {
      query = this.sql`${query} AND frontmatter->>'jurisdiction' = ${options.jurisdiction}`;
    }

    const rows = await this.sql`${query}
      ORDER BY created_at DESC
      LIMIT ${limit} OFFSET ${offset}
    `;

    return (
      rows as unknown as Array<{
        slug: string;
        type: string;
        title: string;
        frontmatter: Record<string, unknown>;
        created_at: string;
      }>
    ).map((r) =>
      fromPageFrontmatter(
        r.slug,
        r.type,
        r.title,
        r.frontmatter || {},
        this.sourceId,
        r.created_at || now()
      )
    );
  }

  async update(id: string, updates: Partial<LegalEntityCreateInput>): Promise<LegalEntity | null> {
    const existing = await this.getById(id);
    if (!existing) return null;

    const updated: LegalEntity = {
      ...existing,
      displayName: updates.displayName ?? existing.displayName,
      legalAreas: updates.legalAreas ?? existing.legalAreas,
      specializations: updates.specializations ?? existing.specializations,
      jurisdiction: updates.jurisdiction ?? existing.jurisdiction,
      jurisdictionLevel: updates.jurisdictionLevel ?? existing.jurisdictionLevel,
      notes: updates.notes ?? existing.notes,
      tags: updates.tags ?? existing.tags,
      updatedAt: now(),
    };

    await this.sql`
      UPDATE pages
      SET title = ${updated.displayName},
          frontmatter = ${this.sql.json(toPageFrontmatter(updated))}::jsonb,
          compiled_truth = ${updated.notes},
          updated_at = now()
      WHERE source_id = ${this.sourceId}
        AND slug = ${id}
        AND type = 'legal-entity'
    `;

    return updated;
  }

  async delete(id: string): Promise<boolean> {
    const result = await this.sql`
      DELETE FROM pages
      WHERE source_id = ${this.sourceId}
        AND slug = ${id}
        AND type = 'legal-entity'
    `;
    return (result as unknown as { count: number }).count > 0;
  }

  async count(): Promise<number> {
    const rows = await this.sql`
      SELECT COUNT(*) as cnt
      FROM pages
      WHERE source_id = ${this.sourceId}
        AND type = 'legal-entity'
    `;
    return Number((rows[0] as { cnt: number }).cnt);
  }
}

// ---------------------------------------------------------------------------
// Case Repository
// ---------------------------------------------------------------------------

export class LegalCaseRepository {
  constructor(
    private sql: ReturnType<typeof postgres>,
    private sourceId: string
  ) {}

  async create(input: LegalCaseCreateInput): Promise<LegalCase> {
    const count = await this.count();
    const slug = slugifyPath(input.displayTitle || input.caseNumber);
    const createdAt = now();

    const legalCase: LegalCase = {
      id: slug,
      caseNumber: input.caseNumber || generateCaseNumber("LB", count + 1),
      displayTitle:
        input.displayTitle || generateDisplayTitle(input.legalArea, input.subArea, count),
      legalArea: input.legalArea,
      subArea: input.subArea,
      status: "open",
      priority: input.priority || "medium",
      opponentId: input.opponentId,
      ownLawyerId: input.ownLawyerId,
      courtId: input.courtId,
      clientId: input.clientId,
      facts: input.facts || "",
      claims: input.claims || [],
      defenses: input.defenses || [],
      evidence: [],
      similarCaseIds: [],
      precedentCaseIds: [],
      estimatedValue: input.estimatedValue,
      tags: input.tags || [],
      createdAt,
      updatedAt: createdAt,
      ownerSource: this.sourceId,
    };

    await this.sql`
      INSERT INTO pages (source_id, slug, type, title, frontmatter, compiled_truth)
      VALUES (
        ${this.sourceId},
        ${slug},
        'legal-case',
        ${legalCase.displayTitle},
        ${this.sql.json(toCaseFrontmatter(legalCase))}::jsonb,
        ${legalCase.facts}
      )
      ON CONFLICT (source_id, slug) DO NOTHING
    `;

    return legalCase;
  }

  async getById(id: string): Promise<LegalCase | null> {
    const rows = await this.sql`
      SELECT slug, type, title, frontmatter, compiled_truth, created_at
      FROM pages
      WHERE source_id = ${this.sourceId}
        AND slug = ${id}
        AND type = 'legal-case'
      LIMIT 1
    `;
    if (rows.length === 0) return null;
    const r = rows[0];
    const c = fromCaseFrontmatter(
      r.slug as string,
      r.title as string,
      (r.frontmatter as Record<string, unknown>) || {},
      this.sourceId,
      (r.created_at as string) || now()
    );
    c.facts = (r.compiled_truth as string) || "";
    return c;
  }

  async list(options?: {
    status?: LegalCase["status"];
    legalArea?: string;
    opponentId?: string;
    priority?: LegalCase["priority"];
    limit?: number;
    offset?: number;
  }): Promise<LegalCase[]> {
    const limit = options?.limit ?? 100;
    const offset = options?.offset ?? 0;

    let query = this.sql`
      SELECT slug, type, title, frontmatter, compiled_truth, created_at
      FROM pages
      WHERE source_id = ${this.sourceId}
        AND type = 'legal-case'
    `;

    if (options?.status) {
      query = this.sql`${query} AND frontmatter->>'status' = ${options.status}`;
    }
    if (options?.legalArea) {
      query = this.sql`${query} AND frontmatter->>'legal_area' = ${options.legalArea}`;
    }
    if (options?.opponentId) {
      query = this.sql`${query} AND frontmatter->>'opponent_id' = ${options.opponentId}`;
    }
    if (options?.priority) {
      query = this.sql`${query} AND frontmatter->>'priority' = ${options.priority}`;
    }

    const rows = await this.sql`${query}
      ORDER BY created_at DESC
      LIMIT ${limit} OFFSET ${offset}
    `;

    return (
      rows as unknown as Array<{
        slug: string;
        title: string;
        frontmatter: Record<string, unknown>;
        compiled_truth: string;
        created_at: string;
      }>
    ).map((r) => {
      const c = fromCaseFrontmatter(
        r.slug,
        r.title,
        r.frontmatter || {},
        this.sourceId,
        r.created_at || now()
      );
      c.facts = r.compiled_truth || "";
      return c;
    });
  }

  async update(id: string, updates: Partial<LegalCase>): Promise<LegalCase | null> {
    const existing = await this.getById(id);
    if (!existing) return null;

    const updated: LegalCase = {
      ...existing,
      ...updates,
      updatedAt: now(),
    };

    await this.sql`
      UPDATE pages
      SET title = ${updated.displayTitle},
          frontmatter = ${this.sql.json(toCaseFrontmatter(updated))}::jsonb,
          compiled_truth = ${updated.facts},
          updated_at = now()
      WHERE source_id = ${this.sourceId}
        AND slug = ${id}
        AND type = 'legal-case'
    `;

    return updated;
  }

  async delete(id: string): Promise<boolean> {
    const result = await this.sql`
      DELETE FROM pages
      WHERE source_id = ${this.sourceId}
        AND slug = ${id}
        AND type = 'legal-case'
    `;
    return (result as unknown as { count: number }).count > 0;
  }

  async count(): Promise<number> {
    const rows = await this.sql`
      SELECT COUNT(*) as cnt
      FROM pages
      WHERE source_id = ${this.sourceId}
        AND type = 'legal-case'
    `;
    return Number((rows[0] as { cnt: number }).cnt);
  }

  async addEvidence(caseId: string, evidence: EvidenceCreateInput): Promise<LegalCase | null> {
    const existing = await this.getById(caseId);
    if (!existing) return null;

    const newEvidence = {
      id: `ev-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      type: evidence.type,
      description: evidence.description,
      source: evidence.source,
      date: evidence.date,
      weight: evidence.weight ?? 0.5,
      admitted: false,
      challenges: [],
      notes: evidence.notes || "",
    };

    existing.evidence = [...existing.evidence, newEvidence];
    existing.updatedAt = now();

    await this.sql`
      UPDATE pages
      SET frontmatter = ${this.sql.json(toCaseFrontmatter(existing))}::jsonb,
          updated_at = now()
      WHERE source_id = ${this.sourceId}
        AND slug = ${caseId}
        AND type = 'legal-case'
    `;

    return existing;
  }

  async setStrategy(caseId: string, strategy: Strategy): Promise<LegalCase | null> {
    const existing = await this.getById(caseId);
    if (!existing) return null;

    existing.strategy = strategy;
    existing.updatedAt = now();

    await this.sql`
      UPDATE pages
      SET frontmatter = ${this.sql.json(toCaseFrontmatter(existing))}::jsonb,
          updated_at = now()
      WHERE source_id = ${this.sourceId}
        AND slug = ${caseId}
        AND type = 'legal-case'
    `;

    return existing;
  }

  async setOutcome(caseId: string, outcome: Outcome): Promise<LegalCase | null> {
    const existing = await this.getById(caseId);
    if (!existing) return null;

    existing.outcome = outcome;
    existing.status =
      outcome.result === "pending"
        ? "pending"
        : outcome.result === "settled"
          ? "settled"
          : outcome.result === "won"
            ? "won"
            : outcome.result === "lost"
              ? "lost"
              : "open";
    existing.updatedAt = now();

    await this.sql`
      UPDATE pages
      SET frontmatter = ${this.sql.json(toCaseFrontmatter(existing))}::jsonb,
          updated_at = now()
      WHERE source_id = ${this.sourceId}
        AND slug = ${caseId}
        AND type = 'legal-case'
    `;

    return existing;
  }
}
