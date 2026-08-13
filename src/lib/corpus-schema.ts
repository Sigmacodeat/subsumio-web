/**
 * Frontmatter Schema-Validation für Corpus-Dateien.
 *
 * Definiert Pflichtfelder und erlaubte Werte pro doc_class.
 * Wird beim Create/Write verwendet um Datenqualität sicherzustellen.
 */

interface SchemaField {
  name: string;
  required: boolean;
  type: "string" | "number" | "boolean" | "array" | "enum";
  enumValues?: string[];
  description?: string;
}

interface DocSchema {
  docClass: string;
  label: string;
  requiredFields: SchemaField[];
  optionalFields: SchemaField[];
}

// ── Schemas pro doc_class ───────────────────────────────────────────────

const SCHEMAS: Record<string, DocSchema> = {
  statute: {
    docClass: "statute",
    label: "Gesetz / Verordnung",
    requiredFields: [
      { name: "title", required: true, type: "string", description: "Titel des Gesetzes" },
      {
        name: "doc_class",
        required: true,
        type: "enum",
        enumValues: ["statute"],
        description: "Dokumentklasse",
      },
      {
        name: "jurisdiction",
        required: true,
        type: "enum",
        enumValues: ["at", "de", "ch", "eu"],
        description: "Rechtsraum",
      },
      { name: "doc_id", required: true, type: "string", description: "Eindeutige Dokument-ID" },
    ],
    optionalFields: [
      { name: "doc_id_alt", required: false, type: "array", description: "Alternative IDs" },
      {
        name: "doc_subtype",
        required: false,
        type: "string",
        description: "Untertyp (Bundesgesetz, Verordnung, etc.)",
      },
      { name: "source", required: false, type: "string", description: "Quelle" },
      { name: "source_url", required: false, type: "string", description: "URL zur Quelle" },
      {
        name: "content_hash",
        required: false,
        type: "string",
        description: "Content-Hash für Dedup",
      },
      { name: "schema_version", required: false, type: "number", description: "Schema-Version" },
      {
        name: "in_force_from",
        required: false,
        type: "string",
        description: "Inkrafttretensdatum",
      },
    ],
  },
  decision: {
    docClass: "decision",
    label: "Gerichtsentscheidung",
    requiredFields: [
      { name: "title", required: true, type: "string", description: "Titel der Entscheidung" },
      {
        name: "doc_class",
        required: true,
        type: "enum",
        enumValues: ["decision"],
        description: "Dokumentklasse",
      },
      {
        name: "jurisdiction",
        required: true,
        type: "enum",
        enumValues: ["at", "de", "ch", "eu"],
        description: "Rechtsraum",
      },
      { name: "doc_id", required: true, type: "string", description: "Eindeutige Dokument-ID" },
    ],
    optionalFields: [
      { name: "doc_id_alt", required: false, type: "array", description: "Alternative IDs" },
      { name: "doc_subtype", required: false, type: "string", description: "Gerichtstyp" },
      { name: "source", required: false, type: "string", description: "Quelle (Gericht)" },
      { name: "source_url", required: false, type: "string", description: "URL zur Quelle" },
      { name: "content_hash", required: false, type: "string", description: "Content-Hash" },
      { name: "court", required: false, type: "string", description: "Gericht" },
      { name: "decision_date", required: false, type: "string", description: "Entscheidungsdatum" },
      { name: "case_number", required: false, type: "string", description: "Geschäftszahl" },
      { name: "ecli", required: false, type: "string", description: "ECLI" },
      { name: "schema_version", required: false, type: "number", description: "Schema-Version" },
    ],
  },
  literature: {
    docClass: "literature",
    label: "Literatur / Kommentar",
    requiredFields: [
      { name: "title", required: true, type: "string", description: "Titel" },
      {
        name: "doc_class",
        required: true,
        type: "enum",
        enumValues: ["literature"],
        description: "Dokumentklasse",
      },
      {
        name: "jurisdiction",
        required: true,
        type: "enum",
        enumValues: ["at", "de", "ch", "eu"],
        description: "Rechtsraum",
      },
    ],
    optionalFields: [
      { name: "author", required: false, type: "string", description: "Autor" },
      { name: "year", required: false, type: "string", description: "Jahr" },
      { name: "source", required: false, type: "string", description: "Quelle" },
      { name: "source_url", required: false, type: "string", description: "URL" },
    ],
  },
};

// Default schema for unknown doc_class
const DEFAULT_SCHEMA: DocSchema = {
  docClass: "unknown",
  label: "Unbekannt",
  requiredFields: [
    { name: "title", required: true, type: "string", description: "Titel" },
    { name: "doc_class", required: true, type: "string", description: "Dokumentklasse" },
  ],
  optionalFields: [],
};

// ── Validation ──────────────────────────────────────────────────────────

export interface ValidationError {
  field: string;
  message: string;
  severity: "error" | "warning";
}

export interface ValidationResult {
  valid: boolean;
  errors: ValidationError[];
  warnings: ValidationError[];
  schema: DocSchema;
}

export function getSchema(docClass: string): DocSchema {
  return SCHEMAS[docClass] ?? DEFAULT_SCHEMA;
}

export function validateFrontmatter(
  frontmatter: Record<string, unknown>,
  docClass?: string
): ValidationResult {
  const dc = (docClass as string) ?? (frontmatter.doc_class as string) ?? "unknown";
  const schema = getSchema(dc);
  const errors: ValidationError[] = [];
  const warnings: ValidationError[] = [];

  // Check required fields
  for (const field of schema.requiredFields) {
    if (!field.required) continue; // Skip fields marked as optional
    const val = frontmatter[field.name];
    if (val === undefined || val === null || val === "") {
      errors.push({
        field: field.name,
        message: `Pflichtfeld "${field.name}" fehlt`,
        severity: "error",
      });
      continue;
    }

    // Type check
    if (field.type === "enum" && field.enumValues) {
      if (!field.enumValues.includes(String(val))) {
        errors.push({
          field: field.name,
          message: `"${field.name}" muss einer von ${field.enumValues.join(", ")} sein (ist: ${String(val)})`,
          severity: "error",
        });
      }
    } else if (field.type === "string" && typeof val !== "string") {
      // BUG 33: string-Typ wurde vorher nicht geprüft — ein title=123 (number)
      // oder title=true (boolean) passierte die Validierung ungeprüft.
      errors.push({
        field: field.name,
        message: `"${field.name}" muss ein String sein (ist: ${typeof val})`,
        severity: "error",
      });
    } else if (field.type === "array" && !Array.isArray(val)) {
      warnings.push({
        field: field.name,
        message: `"${field.name}" sollte ein Array sein`,
        severity: "warning",
      });
    } else if (field.type === "number" && typeof val !== "number") {
      warnings.push({
        field: field.name,
        message: `"${field.name}" sollte eine Zahl sein`,
        severity: "warning",
      });
    } else if (field.type === "boolean" && typeof val !== "boolean") {
      warnings.push({
        field: field.name,
        message: `"${field.name}" sollte ein Boolean sein`,
        severity: "warning",
      });
    }
  }

  // Check for unknown fields (warnings)
  const allKnownFields = new Set([
    ...schema.requiredFields.map((f) => f.name),
    ...schema.optionalFields.map((f) => f.name),
  ]);
  for (const key of Object.keys(frontmatter)) {
    if (!allKnownFields.has(key)) {
      warnings.push({
        field: key,
        message: `Unbekanntes Feld "${key}" (nicht im Schema für doc_class="${dc}")`,
        severity: "warning",
      });
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
    schema,
  };
}

export function listSchemas(): DocSchema[] {
  return Object.values(SCHEMAS);
}
