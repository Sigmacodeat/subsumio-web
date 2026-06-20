/**
 * Legal Schema Pack — P1-BRAIN-014
 * ==================================
 * Versionierter Datenvertrag für das Legal Brain Schema.
 * Definiert Page-Types, Link-Verbs, Frontmatter-Schema, Entity-Types,
 * Deadline-Rules, RVG-Konstanten und Migration-Pfade.
 *
 * Das Schema Pack ist:
 *   - Versioniert (semver)
 *   - Migration-fähig (applyMigration)
 *   - Mit Entity-Resolution gekoppelt (EntityType → CanonicalEntity)
 *   - CI-gated (validateSchemaPack in Tests)
 *
 * Architecture:
 *   - SchemaPackDefinition: Vollständige Schema-Definition
 *   - PageTypeSpec: Erlaubte Page-Types mit Frontmatter-Schema
 *   - LinkVerbSpec: Erlaubte Link-Verben zwischen Page-Types
 *   - MigrationStep: Schema-Migrationen zwischen Versionen
 *   - validateSchemaPack: Konsistenz-Validierung
 */

// ── Types ─────────────────────────────────────────────────────────────

export interface PageTypeSpec {
  type: string;
  label: string;
  description: string;
  /** Required frontmatter fields */
  required_frontmatter: string[];
  /** Optional frontmatter fields */
  optional_frontmatter: string[];
  /** Allowed link verbs FROM this page type */
  outgoing_links: string[];
  /** Allowed link verbs TO this page type */
  incoming_links: string[];
  /** Whether this page type is matter-scoped */
  matter_scoped: boolean;
  /** Whether this page type contains privileged content */
  can_be_privileged: boolean;
  /** GoBD-relevant */
  gobd_relevant: boolean;
}

export interface LinkVerbSpec {
  verb: string;
  label: string;
  /** Source page types */
  from_types: string[];
  /** Target page types */
  to_types: string[];
  /** Whether this link is directional */
  directional: boolean;
  /** Inverse verb (if bidirectional) */
  inverse?: string;
}

export interface FrontmatterFieldSpec {
  key: string;
  type: "string" | "number" | "boolean" | "date" | "datetime" | "enum" | "array" | "object";
  required: boolean;
  enum_values?: string[];
  description: string;
  /** DSGVO-relevant field */
  gdpr_relevant?: boolean;
  /** GoBD-relevant field */
  gobd_relevant?: boolean;
  /** Default value if not set */
  default?: unknown;
}

export interface MigrationStep {
  from_version: string;
  to_version: string;
  description: string;
  /** SQL DDL statements to execute */
  ddl: string[];
  /** Frontmatter transformations (key renames, type changes) */
  frontmatter_transforms?: FrontmatterTransform[];
  /** Whether this migration is breaking */
  breaking: boolean;
}

export interface FrontmatterTransform {
  type: "rename" | "add_field" | "remove_field" | "change_type";
  field: string;
  new_field?: string;
  new_type?: string;
  default_value?: unknown;
}

export interface SchemaPackDefinition {
  /** Schema pack identifier */
  id: string;
  /** Human-readable name */
  name: string;
  /** Semantic version */
  version: string;
  /** Description */
  description: string;
  /** All page types */
  page_types: PageTypeSpec[];
  /** All link verbs */
  link_verbs: LinkVerbSpec[];
  /** Frontmatter schema per page type */
  frontmatter_schemas: Record<string, FrontmatterFieldSpec[]>;
  /** Entity types (coupled with entity-resolution.ts) */
  entity_types: string[];
  /** Deadline rules (coupled with legal-deadlines.ts) */
  deadline_rule_keys: string[];
  /** RVG constants version */
  rvg_version: string;
  /** Supported jurisdictions */
  jurisdictions: ("DE" | "AT" | "CH")[];
  /** Migration path */
  migrations: MigrationStep[];
  /** Schema pack dependencies */
  dependencies: string[];
}

// ── Page Types ────────────────────────────────────────────────────────

export const LEGAL_PAGE_TYPES: PageTypeSpec[] = [
  {
    type: "case",
    label: "Akte",
    description: "Rechtliche Akte / Matter mit Metadaten, Parteien, Fristen",
    required_frontmatter: ["case_number", "status", "practice_area"],
    optional_frontmatter: ["client", "opponent", "court", "judge", "value_in_dispute", "deadline_next", "privileged", "ethical_wall", "permissions"],
    outgoing_links: ["has_document", "has_party", "has_deadline", "has_fact", "has_activity", "has_communication"],
    incoming_links: [],
    matter_scoped: true,
    can_be_privileged: true,
    gobd_relevant: true,
  },
  {
    type: "document",
    label: "Dokument",
    description: "Rechtliches Dokument (Klage, Vertrag, Schriftsatz, Urteil)",
    required_frontmatter: ["title", "document_type"],
    optional_frontmatter: ["case_ref", "author", "date", "status", "privileged", "version", "source", "language"],
    outgoing_links: ["cites", "references", "supersedes"],
    incoming_links: ["has_document", "cited_by", "referenced_by", "superseded_by"],
    matter_scoped: true,
    can_be_privileged: true,
    gobd_relevant: true,
  },
  {
    type: "person",
    label: "Person",
    description: "Person (Mandant, Anwalt, Richter, Gegner, Zeuge)",
    required_frontmatter: ["name"],
    optional_frontmatter: ["email", "phone", "role", "organization", "bar_number", "address", "aliases"],
    outgoing_links: ["represents", "employed_by", "related_to"],
    incoming_links: ["represented_by", "employs", "related_to"],
    matter_scoped: false,
    can_be_privileged: true,
    gobd_relevant: false,
  },
  {
    type: "organization",
    label: "Organisation",
    description: "Organisation (Kanzlei, Gericht, Firma, Behörde)",
    required_frontmatter: ["name"],
    optional_frontmatter: ["type", "address", "email", "phone", "register_number", "jurisdiction"],
    outgoing_links: ["employs", "related_to", "subsidiary_of"],
    incoming_links: ["employed_by", "related_to", "subsidiary_of"],
    matter_scoped: false,
    can_be_privileged: false,
    gobd_relevant: false,
  },
  {
    type: "deadline",
    label: "Frist",
    description: "Prozessuale oder materielle Frist",
    required_frontmatter: ["case_ref", "rule_key", "date", "status"],
    optional_frontmatter: ["description", "days_remaining", "is_statutory", "is_court_ordered", "completed_at", "completed_by"],
    outgoing_links: [],
    incoming_links: ["has_deadline"],
    matter_scoped: true,
    can_be_privileged: false,
    gobd_relevant: true,
  },
  {
    type: "fact",
    label: "Fakt",
    description: "Relevanter Fakt in einer Akte",
    required_frontmatter: ["case_ref", "content", "confidence"],
    optional_frontmatter: ["source", "contradicts", "superseded_by", "supersedes", "created_at", "verified", "legal_hold"],
    outgoing_links: ["contradicts", "supersedes"],
    incoming_links: ["has_fact", "contradicted_by", "superseded_by"],
    matter_scoped: true,
    can_be_privileged: true,
    gobd_relevant: true,
  },
  {
    type: "statute",
    label: "Gesetz/Norm",
    description: "Gesetzliche Norm (BGB, ZPO, StGB, etc.)",
    required_frontmatter: ["title", "jurisdiction"],
    optional_frontmatter: ["section", "paragraph", "effective_date", "superseded_by", "amended_by"],
    outgoing_links: ["amends", "supersedes"],
    incoming_links: ["amended_by", "superseded_by", "cites"],
    matter_scoped: false,
    can_be_privileged: false,
    gobd_relevant: false,
  },
  {
    type: "judgment",
    label: "Urteil",
    description: "Gerichtliches Urteil / Entscheidung",
    required_frontmatter: ["title", "court", "date"],
    optional_frontmatter: ["case_number", "parties", "outcome", "cites", "jurisdiction", "instance"],
    outgoing_links: ["cites", "references"],
    incoming_links: ["cited_by", "referenced_by"],
    matter_scoped: false,
    can_be_privileged: false,
    gobd_relevant: false,
  },
  {
    type: "contract",
    label: "Vertrag",
    description: "Vertrag oder vertragliches Dokument",
    required_frontmatter: ["title", "parties", "date"],
    optional_frontmatter: ["case_ref", "contract_type", "value", "termination_date", "status", "clauses"],
    outgoing_links: ["references", "amends"],
    incoming_links: ["referenced_by", "amended_by", "has_document"],
    matter_scoped: true,
    can_be_privileged: true,
    gobd_relevant: true,
  },
  {
    type: "communication",
    label: "Kommunikation",
    description: "E-Mail, Brief, WhatsApp, beA-Nachricht",
    required_frontmatter: ["channel", "direction", "subject"],
    optional_frontmatter: ["case_ref", "sender", "recipient", "date", "body", "attachments", "privileged"],
    outgoing_links: ["references"],
    incoming_links: ["has_communication"],
    matter_scoped: true,
    can_be_privileged: true,
    gobd_relevant: true,
  },
  {
    type: "activity",
    label: "Aktivität",
    description: "Aktenaktivität (Fristablauf, Eingang, Notiz)",
    required_frontmatter: ["case_ref", "type", "timestamp"],
    optional_frontmatter: ["description", "actor", "related_document"],
    outgoing_links: [],
    incoming_links: ["has_activity"],
    matter_scoped: true,
    can_be_privileged: false,
    gobd_relevant: true,
  },
  {
    type: "bea_message",
    label: "beA-Nachricht",
    description: "Nachricht aus dem beA (elektronischer Rechtsverkehr)",
    required_frontmatter: ["sender", "recipient", "subject", "sent_date"],
    optional_frontmatter: ["case_reference", "attachments", "message_id", "body"],
    outgoing_links: [],
    incoming_links: [],
    matter_scoped: true,
    can_be_privileged: true,
    gobd_relevant: true,
  },
];

// ── Link Verbs ────────────────────────────────────────────────────────

export const LEGAL_LINK_VERBS: LinkVerbSpec[] = [
  { verb: "has_document", label: "hat Dokument", from_types: ["case"], to_types: ["document", "contract"], directional: true },
  { verb: "has_party", label: "hat Beteiligte(n)", from_types: ["case"], to_types: ["person", "organization"], directional: true },
  { verb: "has_deadline", label: "hat Frist", from_types: ["case"], to_types: ["deadline"], directional: true },
  { verb: "has_fact", label: "hat Fakt", from_types: ["case"], to_types: ["fact"], directional: true },
  { verb: "has_activity", label: "hat Aktivität", from_types: ["case"], to_types: ["activity"], directional: true },
  { verb: "has_communication", label: "hat Kommunikation", from_types: ["case"], to_types: ["communication", "bea_message"], directional: true },
  { verb: "represents", label: "vertritt", from_types: ["person"], to_types: ["person", "organization"], directional: true, inverse: "represented_by" },
  { verb: "employed_by", label: "angestellt bei", from_types: ["person"], to_types: ["organization"], directional: true, inverse: "employs" },
  { verb: "related_to", label: "verwandt/verbunden mit", from_types: ["person", "organization"], to_types: ["person", "organization"], directional: false },
  { verb: "cites", label: "zitiert", from_types: ["document", "judgment", "contract"], to_types: ["statute", "judgment", "document"], directional: true, inverse: "cited_by" },
  { verb: "references", label: "referenziert", from_types: ["document", "contract", "communication"], to_types: ["document", "statute", "judgment"], directional: true, inverse: "referenced_by" },
  { verb: "supersedes", label: "ersetzt", from_types: ["document", "fact", "statute"], to_types: ["document", "fact", "statute"], directional: true, inverse: "superseded_by" },
  { verb: "contradicts", label: "widerspricht", from_types: ["fact"], to_types: ["fact"], directional: false },
  { verb: "amends", label: "ändert", from_types: ["statute", "contract"], to_types: ["statute", "contract"], directional: true, inverse: "amended_by" },
  { verb: "subsidiary_of", label: "Tochtergesellschaft von", from_types: ["organization"], to_types: ["organization"], directional: true },
];

// ── Frontmatter Schemas ───────────────────────────────────────────────

export const LEGAL_FRONTMATTER_SCHEMAS: Record<string, FrontmatterFieldSpec[]> = {
  case: [
    { key: "case_number", type: "string", required: true, description: "Aktenzeichen", gobd_relevant: true },
    { key: "status", type: "enum", required: true, enum_values: ["active", "closed", "archived", "pending"], description: "Aktenstatus" },
    { key: "practice_area", type: "string", required: true, description: "Rechtsgebiet" },
    { key: "client", type: "string", required: false, description: "Mandant", gdpr_relevant: true },
    { key: "opponent", type: "string", required: false, description: "Gegner", gdpr_relevant: true },
    { key: "court", type: "string", required: false, description: "Gericht" },
    { key: "judge", type: "string", required: false, description: "Richter", gdpr_relevant: true },
    { key: "value_in_dispute", type: "number", required: false, description: "Streitwert" },
    { key: "privileged", type: "boolean", required: false, description: "Privilegiert (Attorney-Client)", default: false },
    { key: "ethical_wall", type: "boolean", required: false, description: "Ethical Wall aktiv", default: false },
  ],
  document: [
    { key: "title", type: "string", required: true, description: "Dokumenttitel" },
    { key: "document_type", type: "enum", required: true, enum_values: ["klage", "urteil", "vertrag", "schriftsatz", "gutachten", "korrespondenz", "rechnung", "other"], description: "Dokumenttyp" },
    { key: "case_ref", type: "string", required: false, description: "Aktenreferenz" },
    { key: "author", type: "string", required: false, description: "Verfasser", gdpr_relevant: true },
    { key: "date", type: "date", required: false, description: "Datum" },
    { key: "privileged", type: "boolean", required: false, description: "Privilegiert", default: false },
    { key: "version", type: "string", required: false, description: "Version", default: "1" },
  ],
  person: [
    { key: "name", type: "string", required: true, description: "Vollständiger Name", gdpr_relevant: true },
    { key: "email", type: "string", required: false, description: "E-Mail", gdpr_relevant: true },
    { key: "phone", type: "string", required: false, description: "Telefon", gdpr_relevant: true },
    { key: "role", type: "enum", required: false, enum_values: ["client", "lawyer", "judge", "opponent", "witness", "third_party"], description: "Rolle" },
    { key: "organization", type: "string", required: false, description: "Organisation" },
    { key: "bar_number", type: "string", required: false, description: "Aktenzeichen des Anwalts" },
    { key: "aliases", type: "array", required: false, description: "Alternative Namen" },
  ],
  deadline: [
    { key: "case_ref", type: "string", required: true, description: "Aktenreferenz", gobd_relevant: true },
    { key: "rule_key", type: "string", required: true, description: "Fristen-Regel-Key" },
    { key: "date", type: "date", required: true, description: "Fristdatum", gobd_relevant: true },
    { key: "status", type: "enum", required: true, enum_values: ["pending", "completed", "overdue", "waived"], description: "Friststatus" },
    { key: "is_statutory", type: "boolean", required: false, description: "Gesetzliche Frist", default: false },
    { key: "is_court_ordered", type: "boolean", required: false, description: "Gerichtlich angeordnet", default: false },
  ],
  fact: [
    { key: "case_ref", type: "string", required: true, description: "Aktenreferenz" },
    { key: "content", type: "string", required: true, description: "Fakteninhalt" },
    { key: "confidence", type: "enum", required: true, enum_values: ["high", "medium", "low"], description: "Konfidenzniveau" },
    { key: "source", type: "string", required: false, description: "Quelle" },
    { key: "verified", type: "boolean", required: false, description: "Verifiziert", default: false },
    { key: "legal_hold", type: "boolean", required: false, description: "Legal Hold", default: false },
  ],
  statute: [
    { key: "title", type: "string", required: true, description: "Gesetzestitel" },
    { key: "jurisdiction", type: "enum", required: true, enum_values: ["DE", "AT", "CH"], description: "Rechtsordnung" },
    { key: "section", type: "string", required: false, description: "Paragraph/Section" },
    { key: "effective_date", type: "date", required: false, description: "Inkrafttretedatum" },
  ],
  communication: [
    { key: "channel", type: "enum", required: true, enum_values: ["email", "whatsapp", "phone", "letter", "portal", "bea", "other"], description: "Kommunikationskanal" },
    { key: "direction", type: "enum", required: true, enum_values: ["incoming", "outgoing"], description: "Richtung" },
    { key: "subject", type: "string", required: true, description: "Betreff" },
    { key: "case_ref", type: "string", required: false, description: "Aktenreferenz" },
    { key: "sender", type: "string", required: false, description: "Absender", gdpr_relevant: true },
    { key: "recipient", type: "string", required: false, description: "Empfänger", gdpr_relevant: true },
    { key: "privileged", type: "boolean", required: false, description: "Privilegiert", default: false },
  ],
  organization: [
    { key: "name", type: "string", required: true, description: "Organisationsname", gdpr_relevant: true },
    { key: "type", type: "enum", required: false, enum_values: ["law_firm", "court", "company", "government", "other"], description: "Organisationstyp" },
    { key: "address", type: "string", required: false, description: "Adresse", gdpr_relevant: true },
    { key: "registration_number", type: "string", required: false, description: "Registernummer" },
  ],
  judgment: [
    { key: "title", type: "string", required: true, description: "Urteilstitel" },
    { key: "court", type: "string", required: true, description: "Gericht" },
    { key: "date", type: "date", required: true, description: "Urteilsdatum", gobd_relevant: true },
    { key: "case_ref", type: "string", required: false, description: "Aktenreferenz" },
    { key: "file_number", type: "string", required: false, description: "Aktenzeichen" },
    { key: "outcome", type: "string", required: false, description: "Urteilsausgang" },
  ],
  contract: [
    { key: "title", type: "string", required: true, description: "Vertragstitel" },
    { key: "parties", type: "array", required: true, description: "Vertragsparteien", gdpr_relevant: true },
    { key: "date", type: "date", required: true, description: "Vertragsdatum", gobd_relevant: true },
    { key: "case_ref", type: "string", required: false, description: "Aktenreferenz" },
    { key: "contract_type", type: "string", required: false, description: "Vertragstyp" },
    { key: "value", type: "number", required: false, description: "Vertragswert" },
  ],
  activity: [
    { key: "case_ref", type: "string", required: true, description: "Aktenreferenz", gobd_relevant: true },
    { key: "type", type: "enum", required: true, enum_values: ["filing", "hearing", "deadline", "meeting", "call", "research", "drafting", "review", "other"], description: "Aktivitätstyp" },
    { key: "timestamp", type: "datetime", required: true, description: "Zeitstempel", gobd_relevant: true },
    { key: "description", type: "string", required: false, description: "Beschreibung" },
    { key: "actor", type: "string", required: false, description: "Durchgeführt von", gdpr_relevant: true },
  ],
  bea_message: [
    { key: "sender", type: "string", required: true, description: "Absender (beA-Id)", gdpr_relevant: true },
    { key: "recipient", type: "string", required: true, description: "Empfänger (beA-Id)", gdpr_relevant: true },
    { key: "subject", type: "string", required: true, description: "Betreff" },
    { key: "sent_date", type: "datetime", required: true, description: "Sendezeitpunkt", gobd_relevant: true },
    { key: "case_ref", type: "string", required: false, description: "Aktenreferenz" },
    { key: "bea_id", type: "string", required: false, description: "beA-Message-Id" },
    { key: "delivery_status", type: "enum", required: false, enum_values: ["sent", "delivered", "read", "failed"], description: "Zustellstatus" },
  ],
};

// ── Entity Types (coupled with entity-resolution.ts) ──────────────────

export const LEGAL_ENTITY_TYPES = [
  "person",
  "company",
  "client",
  "opponent",
  "lawyer",
  "judge",
  "court",
  "witness",
  "third_party",
] as const;

// ── Deadline Rule Keys (coupled with legal-deadlines.ts) ──────────────

export const LEGAL_DEADLINE_RULE_KEYS = [
  "zpo_klageerwiderung",
  "zpo_berufung",
  "zpo_revision",
  "zpo_widerspruch",
  "zpo_einspruch",
  "bgb_verjaehrung_regelmaessig",
  "bgb_verjaehrung_kurz",
  "bgb_ruegewaehrung",
  "bgb_mangelverjaehrung",
  "stgb_einspruch",
  "vvg_klaerungsfrist",
  "rvg_verjaehrung",
  "gkg_zahlungsfrist",
] as const;

// ── Migrations ────────────────────────────────────────────────────────

export const LEGAL_SCHEMA_MIGRATIONS: MigrationStep[] = [
  {
    from_version: "1.0.0",
    to_version: "1.1.0",
    description: "Add communication page type and has_communication link verb",
    ddl: [],
    frontmatter_transforms: [
      { type: "add_field", field: "channel", new_type: "enum", default_value: "email" },
    ],
    breaking: false,
  },
  {
    from_version: "1.1.0",
    to_version: "1.2.0",
    description: "Add bea_message page type with beA-specific frontmatter",
    ddl: [],
    frontmatter_transforms: [
      { type: "add_field", field: "message_id", new_type: "string" },
      { type: "add_field", field: "sent_date", new_type: "datetime" },
    ],
    breaking: false,
  },
  {
    from_version: "1.2.0",
    to_version: "2.0.0",
    description: "Add privileged/ethical_wall fields to case, add privilege_labels support",
    ddl: [],
    frontmatter_transforms: [
      { type: "add_field", field: "privileged", new_type: "boolean", default_value: false },
      { type: "add_field", field: "ethical_wall", new_type: "boolean", default_value: false },
      { type: "add_field", field: "permissions", new_type: "object" },
    ],
    breaking: false,
  },
  {
    from_version: "2.0.0",
    to_version: "2.1.0",
    description: "Add legal_hold field to facts, add superseded_by tracking",
    ddl: [],
    frontmatter_transforms: [
      { type: "add_field", field: "legal_hold", new_type: "boolean", default_value: false },
      { type: "add_field", field: "superseded_by", new_type: "string" },
    ],
    breaking: false,
  },
];

// ── Schema Pack Definition ────────────────────────────────────────────

export const LEGAL_SCHEMA_PACK: SchemaPackDefinition = {
  id: "subsumio-legal",
  name: "Subsumio Legal Schema Pack",
  version: "2.1.0",
  description: "Versionierter Datenvertrag für das Legal Brain — Page-Types, Link-Verbs, Frontmatter-Schema, Entity-Types, Deadline-Rules",
  page_types: LEGAL_PAGE_TYPES,
  link_verbs: LEGAL_LINK_VERBS,
  frontmatter_schemas: LEGAL_FRONTMATTER_SCHEMAS,
  entity_types: [...LEGAL_ENTITY_TYPES],
  deadline_rule_keys: [...LEGAL_DEADLINE_RULE_KEYS],
  rvg_version: "2024-01-01",
  jurisdictions: ["DE", "AT", "CH"],
  migrations: LEGAL_SCHEMA_MIGRATIONS,
  dependencies: [],
};

// ── Validation ────────────────────────────────────────────────────────

export interface SchemaPackValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

export function validateSchemaPack(pack: SchemaPackDefinition): SchemaPackValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  // Check page types
  const pageTypeNames = new Set<string>();
  for (const pt of pack.page_types) {
    if (pageTypeNames.has(pt.type)) {
      errors.push(`Duplicate page type: ${pt.type}`);
    }
    pageTypeNames.add(pt.type);

    if (!pt.type || pt.type.trim().length === 0) errors.push("Page type has empty type field");
    if (!pt.label || pt.label.trim().length === 0) errors.push(`Page type ${pt.type} has empty label`);

    // Check frontmatter schema exists
    if (!pack.frontmatter_schemas[pt.type] && pt.required_frontmatter.length > 0) {
      errors.push(`Page type ${pt.type} has required_frontmatter but no frontmatter_schemas entry`);
    }

    // Check required frontmatter fields exist in schema
    if (pack.frontmatter_schemas[pt.type]) {
      const schemaKeys = new Set(pack.frontmatter_schemas[pt.type].map((f) => f.key));
      for (const req of pt.required_frontmatter) {
        if (!schemaKeys.has(req)) {
          errors.push(`Page type ${pt.type} requires frontmatter field "${req}" but it's not in the schema`);
        }
      }
    }
  }

  // Check link verbs
  const verbNames = new Set<string>();
  for (const verb of pack.link_verbs) {
    if (verbNames.has(verb.verb)) {
      errors.push(`Duplicate link verb: ${verb.verb}`);
    }
    verbNames.add(verb.verb);

    // Check from_types and to_types reference valid page types
    for (const from of verb.from_types) {
      if (!pageTypeNames.has(from)) {
        errors.push(`Link verb ${verb.verb} references unknown from_type: ${from}`);
      }
    }
    for (const to of verb.to_types) {
      if (!pageTypeNames.has(to)) {
        errors.push(`Link verb ${verb.verb} references unknown to_type: ${to}`);
      }
    }

    // Check inverse references valid verb
    if (verb.inverse && !verbNames.has(verb.inverse) && !pack.link_verbs.some((v) => v.verb === verb.inverse)) {
      warnings.push(`Link verb ${verb.verb} has inverse "${verb.inverse}" which is not defined yet`);
    }
  }

  // Check migrations are ordered
  for (let i = 1; i < pack.migrations.length; i++) {
    if (pack.migrations[i].from_version !== pack.migrations[i - 1].to_version) {
      errors.push(`Migration ${i} from_version (${pack.migrations[i].from_version}) doesn't match previous to_version (${pack.migrations[i - 1].to_version})`);
    }
  }

  // Check version matches last migration
  if (pack.migrations.length > 0) {
    const lastMigration = pack.migrations[pack.migrations.length - 1];
    if (lastMigration.to_version !== pack.version) {
      warnings.push(`Pack version (${pack.version}) doesn't match last migration to_version (${lastMigration.to_version})`);
    }
  }

  return { valid: errors.length === 0, errors, warnings };
}

// ── Migration Helpers ─────────────────────────────────────────────────

export function getMigrationPath(
  pack: SchemaPackDefinition,
  fromVersion: string,
  toVersion: string,
): MigrationStep[] {
  const path: MigrationStep[] = [];
  let current = fromVersion;
  for (const migration of pack.migrations) {
    if (migration.from_version === current) {
      path.push(migration);
      current = migration.to_version;
      if (current === toVersion) break;
    }
  }
  return path;
}

export function getLatestVersion(pack: SchemaPackDefinition): string {
  if (pack.migrations.length === 0) return pack.version;
  return pack.migrations[pack.migrations.length - 1].to_version;
}

export function needsMigration(pack: SchemaPackDefinition, currentVersion: string): boolean {
  return currentVersion !== pack.version;
}

// ── Lookup Helpers ────────────────────────────────────────────────────

export function getPageType(pack: SchemaPackDefinition, type: string): PageTypeSpec | undefined {
  return pack.page_types.find((pt) => pt.type === type);
}

export function getLinkVerb(pack: SchemaPackDefinition, verb: string): LinkVerbSpec | undefined {
  return pack.link_verbs.find((v) => v.verb === verb);
}

export function getFrontmatterSchema(pack: SchemaPackDefinition, pageType: string): FrontmatterFieldSpec[] {
  return pack.frontmatter_schemas[pageType] ?? [];
}

export function getRequiredFrontmatter(pack: SchemaPackDefinition, pageType: string): string[] {
  const spec = getPageType(pack, pageType);
  return spec?.required_frontmatter ?? [];
}

export function getOptionalFrontmatter(pack: SchemaPackDefinition, pageType: string): string[] {
  const spec = getPageType(pack, pageType);
  return spec?.optional_frontmatter ?? [];
}

export function getOutgoingLinks(pack: SchemaPackDefinition, pageType: string): string[] {
  const spec = getPageType(pack, pageType);
  return spec?.outgoing_links ?? [];
}

export function getIncomingLinks(pack: SchemaPackDefinition, pageType: string): string[] {
  const spec = getPageType(pack, pageType);
  return spec?.incoming_links ?? [];
}

export function isMatterScoped(pack: SchemaPackDefinition, pageType: string): boolean {
  const spec = getPageType(pack, pageType);
  return spec?.matter_scoped ?? false;
}

export function canBePrivileged(pack: SchemaPackDefinition, pageType: string): boolean {
  const spec = getPageType(pack, pageType);
  return spec?.can_be_privileged ?? false;
}

export function isGoBdRelevant(pack: SchemaPackDefinition, pageType: string): boolean {
  const spec = getPageType(pack, pageType);
  return spec?.gobd_relevant ?? false;
}

export function getGdprRelevantFields(pack: SchemaPackDefinition, pageType: string): FrontmatterFieldSpec[] {
  return getFrontmatterSchema(pack, pageType).filter((f) => f.gdpr_relevant);
}

export function getGoBdRelevantFields(pack: SchemaPackDefinition, pageType: string): FrontmatterFieldSpec[] {
  return getFrontmatterSchema(pack, pageType).filter((f) => f.gobd_relevant);
}

// ── Summary ───────────────────────────────────────────────────────────

export interface SchemaPackSummary {
  version: string;
  page_type_count: number;
  link_verb_count: number;
  frontmatter_schema_count: number;
  entity_type_count: number;
  deadline_rule_count: number;
  migration_count: number;
  jurisdictions: string[];
  rvg_version: string;
}

export function getSchemaPackSummary(pack: SchemaPackDefinition = LEGAL_SCHEMA_PACK): SchemaPackSummary {
  return {
    version: pack.version,
    page_type_count: pack.page_types.length,
    link_verb_count: pack.link_verbs.length,
    frontmatter_schema_count: Object.keys(pack.frontmatter_schemas).length,
    entity_type_count: pack.entity_types.length,
    deadline_rule_count: pack.deadline_rule_keys.length,
    migration_count: pack.migrations.length,
    jurisdictions: pack.jurisdictions,
    rvg_version: pack.rvg_version,
  };
}
