/**
 * Entity Resolution / Canonicalization Model.
 *
 * Definiert das Datenmodell und die Logik zur Identifikation und
 * Zusammenführung von Entitäten (Personen, Firmen, Mandanten, Gegner,
 * Gerichte, Richter) über verschiedene Quellen hinweg.
 *
 * P0-BRAIN-006
 */

// ── Types ─────────────────────────────────────────────────────────────

export type EntityType =
  | "person"
  | "company"
  | "client"
  | "opponent"
  | "lawyer"
  | "judge"
  | "court"
  | "witness"
  | "third_party";

export type EntitySource =
  | "dms"
  | "email"
  | "whatsapp"
  | "portal"
  | "bea"
  | "upload"
  | "manual"
  | "statute_corpus"
  | "judgement_api";

export interface CanonicalEntity {
  id: string;
  type: EntityType;
  name: string;
  aliases: string[];
  source_refs: EntitySourceRef[];
  contact: EntityContact;
  metadata: EntityMetadata;
  resolution_confidence: number;
  verified: boolean;
  created_at: string;
  updated_at: string;
}

export interface EntitySourceRef {
  source: EntitySource;
  source_id: string;
  source_name?: string;
  source_type: EntityType;
  match_method: MatchMethod;
  match_confidence: number;
}

export interface EntityContact {
  email?: string;
  phone?: string;
  address?: string;
  company?: string;
  role?: string;
}

export interface EntityMetadata {
  first_name?: string;
  last_name?: string;
  title?: string;
  date_of_birth?: string;
  legal_form?: string;
  registry_number?: string;
  vat_id?: string;
  court_type?: string;
  jurisdiction?: string;
  bar_number?: string;
  case_slugs?: string[];
  notes?: string;
}

export type MatchMethod =
  | "exact_name"
  | "fuzzy_name"
  | "email_match"
  | "phone_match"
  | "manual_merge"
  | "source_ref";

export interface EntityMatchResult {
  canonical_id: string | null;
  confidence: number;
  method: MatchMethod;
  matched_entity?: CanonicalEntity;
}

export interface UnresolvedEntity {
  source: EntitySource;
  source_id: string;
  name: string;
  type: EntityType;
  contact?: Partial<EntityContact>;
  metadata?: Partial<EntityMetadata>;
}

export const ENTITY_TYPE_LABELS: Record<EntityType, { label: string; description: string }> = {
  person: { label: "Person", description: "Natürliche Person" },
  company: { label: "Firma", description: "Juristische Person / Unternehmen" },
  client: { label: "Mandant", description: "Eigener Mandant" },
  opponent: { label: "Gegner", description: "Gegnerische Partei" },
  lawyer: { label: "Rechtsanwalt", description: "Rechtsanwalt / Rechtsanwältin" },
  judge: { label: "Richter", description: "Richter / Richterin" },
  court: { label: "Gericht", description: "Gericht / Spruchkörper" },
  witness: { label: "Zeuge", description: "Zeuge / Zeugin" },
  third_party: { label: "Drittbeteiligter", description: "Sonstige beteiligte Person oder Institution" },
};

// ── Entity Registry ───────────────────────────────────────────────────

export class EntityRegistry {
  private entities = new Map<string, CanonicalEntity>();
  private nameIndex = new Map<string, Set<string>>();
  private emailIndex = new Map<string, Set<string>>();
  private phoneIndex = new Map<string, Set<string>>();

  register(entity: CanonicalEntity): void {
    this.entities.set(entity.id, entity);
    this.indexName(entity.name, entity.id);
    for (const alias of entity.aliases) {
      this.indexName(alias, entity.id);
    }
    if (entity.contact.email) {
      this.indexEmail(entity.contact.email, entity.id);
    }
    if (entity.contact.phone) {
      this.indexPhone(entity.contact.phone, entity.id);
    }
  }

  get(id: string): CanonicalEntity | undefined {
    return this.entities.get(id);
  }

  getAll(): CanonicalEntity[] {
    return Array.from(this.entities.values());
  }

  getByType(type: EntityType): CanonicalEntity[] {
    return this.getAll().filter((e) => e.type === type);
  }

  resolve(unresolved: UnresolvedEntity): EntityMatchResult {
    if (unresolved.contact?.email) {
      const email = unresolved.contact.email.toLowerCase().trim();
      const ids = this.emailIndex.get(email);
      if (ids && ids.size > 0) {
        const id = ids.values().next().value!;
        return {
          canonical_id: id,
          confidence: 0.98,
          method: "email_match",
          matched_entity: this.entities.get(id),
        };
      }
    }

    if (unresolved.contact?.phone) {
      const phone = normalizePhone(unresolved.contact.phone);
      const ids = this.phoneIndex.get(phone);
      if (ids && ids.size > 0) {
        const id = ids.values().next().value!;
        return {
          canonical_id: id,
          confidence: 0.95,
          method: "phone_match",
          matched_entity: this.entities.get(id),
        };
      }
    }

    const normalizedName = normalizeName(unresolved.name);
    const nameIds = this.nameIndex.get(normalizedName);
    if (nameIds && nameIds.size > 0) {
      const matching = Array.from(nameIds).filter((id) => {
        const entity = this.entities.get(id);
        return entity && (entity.type === unresolved.type || isCompatibleType(entity.type, unresolved.type));
      });
      if (matching.length > 0) {
        const id = matching[0];
        return {
          canonical_id: id,
          confidence: 0.9,
          method: "exact_name",
          matched_entity: this.entities.get(id),
        };
      }
    }

    const fuzzyMatch = this.fuzzyNameMatch(unresolved.name, unresolved.type);
    if (fuzzyMatch) {
      return fuzzyMatch;
    }

    return { canonical_id: null, confidence: 0, method: "exact_name" };
  }

  merge(targetId: string, sourceId: string): CanonicalEntity | null {
    const target = this.entities.get(targetId);
    const source = this.entities.get(sourceId);
    if (!target || !source) return null;

    const merged: CanonicalEntity = {
      ...target,
      aliases: dedupe([...target.aliases, source.name, ...source.aliases.filter((a) => a !== target.name)]),
      source_refs: [...target.source_refs, ...source.source_refs],
      contact: mergeContact(target.contact, source.contact),
      metadata: { ...target.metadata, ...source.metadata },
      resolution_confidence: Math.max(target.resolution_confidence, source.resolution_confidence),
      verified: target.verified || source.verified,
      updated_at: new Date().toISOString(),
    };

    this.entities.set(targetId, merged);
    this.entities.delete(sourceId);
    this.rebuildIndexes();
    return merged;
  }

  update(id: string, updates: Partial<CanonicalEntity>): CanonicalEntity | null {
    const entity = this.entities.get(id);
    if (!entity) return null;
    const updated = { ...entity, ...updates, updated_at: new Date().toISOString() };
    this.entities.set(id, updated);
    this.rebuildIndexes();
    return updated;
  }

  getStats(): EntityRegistryStats {
    const byType: Record<string, number> = {};
    for (const entity of this.entities.values()) {
      byType[entity.type] = (byType[entity.type] ?? 0) + 1;
    }
    return {
      total: this.entities.size,
      by_type: byType,
      verified: this.getAll().filter((e) => e.verified).length,
      avg_confidence: this.entities.size > 0
        ? this.getAll().reduce((sum, e) => sum + e.resolution_confidence, 0) / this.entities.size
        : 0,
    };
  }

  private indexName(name: string, id: string): void {
    const normalized = normalizeName(name);
    if (!normalized) return;
    if (!this.nameIndex.has(normalized)) {
      this.nameIndex.set(normalized, new Set());
    }
    this.nameIndex.get(normalized)!.add(id);
  }

  private indexEmail(email: string, id: string): void {
    const normalized = email.toLowerCase().trim();
    if (!this.emailIndex.has(normalized)) {
      this.emailIndex.set(normalized, new Set());
    }
    this.emailIndex.get(normalized)!.add(id);
  }

  private indexPhone(phone: string, id: string): void {
    const normalized = normalizePhone(phone);
    if (!normalized) return;
    if (!this.phoneIndex.has(normalized)) {
      this.phoneIndex.set(normalized, new Set());
    }
    this.phoneIndex.get(normalized)!.add(id);
  }

  private rebuildIndexes(): void {
    this.nameIndex.clear();
    this.emailIndex.clear();
    this.phoneIndex.clear();
    for (const entity of this.entities.values()) {
      this.indexName(entity.name, entity.id);
      for (const alias of entity.aliases) {
        this.indexName(alias, entity.id);
      }
      if (entity.contact.email) this.indexEmail(entity.contact.email, entity.id);
      if (entity.contact.phone) this.indexPhone(entity.contact.phone, entity.id);
    }
  }

  private fuzzyNameMatch(name: string, type: EntityType): EntityMatchResult | null {
    const normalized = normalizeName(name);
    if (normalized.split(/\s+/).filter(Boolean).length < 2) return null;

    let bestMatch: { id: string; score: number } | null = null;

    for (const [indexedName, ids] of this.nameIndex) {
      const indexedTokens = indexedName.split(/\s+/).filter(Boolean);
      if (indexedTokens.length < 2) continue;

      const compatibleIds = Array.from(ids).filter((id) => {
        const entity = this.entities.get(id);
        return entity && (entity.type === type || isCompatibleType(entity.type, type));
      });
      if (compatibleIds.length === 0) continue;

      const score = computeNameSimilarity(normalized, indexedName);
      if (score >= 0.8 && (!bestMatch || score > bestMatch.score)) {
        bestMatch = { id: compatibleIds[0], score };
      }
    }

    if (bestMatch) {
      return {
        canonical_id: bestMatch.id,
        confidence: bestMatch.score,
        method: "fuzzy_name",
        matched_entity: this.entities.get(bestMatch.id),
      };
    }

    return null;
  }
}

export interface EntityRegistryStats {
  total: number;
  by_type: Record<string, number>;
  verified: number;
  avg_confidence: number;
}

// ── Helpers ───────────────────────────────────────────────────────────

export function normalizeName(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/\s+/g, " ")
    .replace(/[,.*]/g, "")
    .replace(/dr\./g, "dr")
    .replace(/prof\./g, "prof");
}

export function normalizePhone(phone: string): string {
  return phone
    .replace(/[\s\-()\/]/g, "")
    .replace(/^\+490?/, "0")
    .replace(/^\+430?/, "0")
    .replace(/^\+410?/, "0")
    .replace(/^00+/, "0")
    .trim();
}

export function isCompatibleType(a: EntityType, b: EntityType): boolean {
  if (a === b) return true;
  const personTypes: EntityType[] = ["person", "client", "opponent", "lawyer", "judge", "witness"];
  if (personTypes.includes(a) && personTypes.includes(b)) return true;
  if ((a === "company" && b === "third_party") || (a === "third_party" && b === "company")) return true;
  return false;
}

export function computeNameSimilarity(a: string, b: string): number {
  const aTokens = new Set(a.split(/\s+/).filter(Boolean));
  const bTokens = new Set(b.split(/\s+/).filter(Boolean));
  if (aTokens.size === 0 || bTokens.size === 0) return 0;

  let common = 0;
  for (const token of aTokens) {
    if (bTokens.has(token)) common++;
  }

  const jaccard = common / (aTokens.size + bTokens.size - common);
  return jaccard;
}

export function dedupe<T>(arr: T[]): T[] {
  return Array.from(new Set(arr));
}

export function mergeContact(a: EntityContact, b: EntityContact): EntityContact {
  return {
    email: a.email ?? b.email,
    phone: a.phone ?? b.phone,
    address: a.address ?? b.address,
    company: a.company ?? b.company,
    role: a.role ?? b.role,
  };
}

export function createCanonicalEntity(
  type: EntityType,
  name: string,
  source: EntitySource,
  sourceId: string,
  contact: Partial<EntityContact> = {},
  metadata: Partial<EntityMetadata> = {},
): CanonicalEntity {
  const now = new Date().toISOString();
  const id = `${type}:${slugifyName(name)}-${randomSuffix()}`;

  return {
    id,
    type,
    name,
    aliases: [],
    source_refs: [
      {
        source,
        source_id: sourceId,
        source_type: type,
        match_method: "source_ref",
        match_confidence: 1.0,
      },
    ],
    contact: {
      email: contact.email,
      phone: contact.phone,
      address: contact.address,
      company: contact.company,
      role: contact.role,
    },
    metadata,
    resolution_confidence: 1.0,
    verified: false,
    created_at: now,
    updated_at: now,
  };
}

function slugifyName(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9äöüß]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 40);
}

function randomSuffix(): string {
  return Math.random().toString(36).slice(2, 8);
}
