/**
 * Copilot tool registry — the model-facing contract for native tool use.
 *
 * One zod schema per Copilot tool (every name in `TOOL_CONDITIONS`). From it
 * the chat derives the JSON-Schema tool definitions sent with `/api/think`,
 * and validates the arguments a model returns in a structured `tool_call`
 * before they reach the existing execution / confirmation logic.
 *
 * The schemas mirror the attributes the marker parser in chat-panel.tsx reads
 * (`[TOOL:name attr="…"]`) so both paths — native tool calls and the regex
 * fallback for providers without tool use — normalise into the same params.
 * The server route (`/api/copilot/tools`) re-validates every call with its
 * own, stricter schemas; this registry is the contract, not the guard.
 */
import { z } from "zod";
import {
  TOOL_CONDITIONS,
  getAvailableTools,
  type CopilotToolName,
  type ToolConditionContext,
} from "@/lib/agent-conditionals";

/** Tool names the engine accepts (whitelist, mirrored in the engine). */
export const COPILOT_TOOL_NAME_PATTERN = /^[a-z_]{1,40}$/;
/** Longest description the engine forwards to the model. */
export const MAX_TOOL_DESCRIPTION_CHARS = 400;
/** Upper bound of tool definitions per request (engine rejects more). */
export const MAX_TOOLS_PER_REQUEST = 40;

export interface CopilotToolDefinition {
  name: CopilotToolName;
  description: string;
  /** JSON Schema (draft-07 subset) of the tool's arguments. */
  inputSchema: Record<string, unknown>;
}

interface ToolSchemaEntry {
  schema: z.ZodObject<z.ZodRawShape>;
  /** What the model reads; German, like the rest of the Copilot prompt. */
  description: string;
  /**
   * False for tools the chat cannot execute from an answer (no executor in
   * the chat panel, or deliberately never offered to the model). They keep a
   * schema so the registry stays complete, but are not sent to the model.
   */
  offered: boolean;
}

const caseSlug = z.string().max(300).describe("Slug der Akte, z. B. cases/123");
const docSlug = z.string().max(300).describe("Slug des Dokuments");

export const COPILOT_TOOL_SCHEMAS: Record<CopilotToolName, ToolSchemaEntry> = {
  navigate: {
    description:
      "Zu einer Dashboard-Seite navigieren, z. B. /dashboard/cases oder /dashboard/deadlines.",
    offered: true,
    schema: z.object({
      route: z.string().max(200).describe("Pfad, beginnt mit /dashboard"),
    }),
  },
  search_cases: {
    description: "Akten nach Mandant, Gegner oder Aktenzeichen suchen.",
    offered: true,
    schema: z.object({ query: z.string().max(2000).describe("Suchbegriff") }),
  },
  search_deadlines: {
    description:
      "Fristen prüfen — offene, kritische (< 7 Tage) oder überfällige, optional nur für eine Akte.",
    offered: true,
    schema: z.object({
      case_slug: caseSlug.optional(),
      status: z.enum(["open", "overdue", "critical", "all"]).default("open"),
    }),
  },
  search_knowledge: {
    description: "Im Kanzlei-Wissen und in den Rechtsquellen suchen, z. B. „ABGB § 1295“.",
    offered: true,
    schema: z.object({ query: z.string().max(2000).describe("Suchbegriff") }),
  },
  search_tasks: {
    description: "Offene oder erledigte Aufgaben anzeigen, optional nach Akte und Priorität.",
    offered: true,
    schema: z.object({
      case_slug: caseSlug.optional(),
      status: z.enum(["open", "done", "all"]).default("open"),
      priority: z.enum(["low", "medium", "high", "critical", "all"]).default("all"),
    }),
  },
  search_calendar: {
    description:
      "Termine anzeigen — heute, diese Woche oder diesen Monat, optional ab einem Datum.",
    offered: true,
    schema: z.object({
      date: z.string().max(20).optional().describe("ISO-Datum YYYY-MM-DD"),
      range: z.enum(["today", "week", "month"]).default("week"),
      case_slug: caseSlug.optional(),
    }),
  },
  create_case: {
    description: "Eine neue Akte anlegen (braucht Bestätigung durch den Nutzer).",
    offered: true,
    schema: z.object({
      title: z.string().max(300).describe("Aktentitel"),
      client_name: z.string().max(200).optional(),
      opponent_name: z.string().max(200).optional(),
      case_type: z.string().max(100).optional(),
    }),
  },
  case_summary: {
    description: "Strukturierte Zusammenfassung einer Akte (Parteien, Stand, Fristen).",
    offered: true,
    schema: z.object({ case_slug: caseSlug }),
  },
  email_draft: {
    description: "Einen E-Mail-Entwurf verfassen (wird nicht versendet).",
    offered: true,
    schema: z.object({
      subject: z.string().max(500).describe("Betreff"),
      recipient: z.string().max(500).optional().describe("Empfängeradresse"),
      case_slug: caseSlug.optional(),
      tone: z.enum(["formal", "neutral", "urgent"]).default("formal"),
    }),
  },
  deadline_extract: {
    description: "Fristen aus einem Dokument extrahieren.",
    offered: true,
    schema: z.object({ document_slug: docSlug }),
  },
  document_summary: {
    description: "Ein Dokument mit Kernpunkten zusammenfassen.",
    offered: true,
    schema: z.object({ document_slug: docSlug }),
  },
  conflict_check: {
    description: "Kollisionsprüfung für einen Namen (Mandant oder Gegner).",
    offered: true,
    schema: z.object({
      name: z.string().max(500).describe("Name der Person oder Firma"),
    }),
  },
  time_entry: {
    description: "Verrechenbaren Zeiteintrag auf einer Akte anlegen (braucht Bestätigung).",
    offered: true,
    schema: z.object({
      case_slug: caseSlug,
      description: z.string().max(2000).describe("Tätigkeit"),
      hours: z.number().min(0.1).max(24).optional().describe("Stunden, z. B. 1.5"),
      activity_type: z
        .enum(["research", "drafting", "review", "meeting", "correspondence", "other"])
        .default("other"),
    }),
  },
  client_update: {
    description: "Mandanten-Update zu einer Akte formulieren.",
    offered: true,
    schema: z.object({
      case_slug: caseSlug,
      update_type: z.enum(["status", "deadline", "next_steps", "summary"]).default("status"),
    }),
  },
  meeting_tasks: {
    description: "Aufgaben aus Besprechungsnotizen ableiten.",
    offered: true,
    schema: z.object({
      notes: z.string().max(10_000).describe("Notizen der Besprechung"),
      case_slug: caseSlug.optional(),
    }),
  },
  intake_create: {
    description:
      "Mandatsaufnahme mit Kollisionsprüfung anlegen (österreichisches Recht; braucht Bestätigung).",
    offered: true,
    schema: z.object({
      client_name: z.string().max(200),
      matter_type: z.string().max(200).describe("Rechtsgebiet, z. B. Zivilrecht"),
      urgency: z.enum(["low", "medium", "high", "critical"]).default("medium"),
    }),
  },
  document_request_create: {
    description:
      "Unterlagen vom Mandanten anfordern (Dokumentenanfrage im Portal; braucht Bestätigung).",
    offered: true,
    schema: z.object({
      case_slug: caseSlug,
      items: z
        .array(z.string().max(160))
        .max(50)
        .optional()
        .describe("Angeforderte Unterlagen, je ein Eintrag"),
      message: z.string().max(5000).optional().describe("Nachricht an den Mandanten"),
    }),
  },
  precedent_search: {
    description: "Judikatur und Präzedenzfälle suchen (österreichisches Recht).",
    offered: true,
    schema: z.object({
      query: z.string().max(2000),
      jurisdiction: z.literal("at").optional(),
      legal_area: z.string().max(200).optional(),
    }),
  },
  translate_text: {
    description: "Juristischen Text oder ein Dokument übersetzen.",
    offered: true,
    schema: z.object({
      target_language: z.string().min(2).max(10).describe("Zielsprache, z. B. en"),
      source_language: z.string().max(10).optional(),
      text: z.string().max(50_000).optional().describe("Zu übersetzender Text"),
      document_slug: docSlug.optional(),
    }),
  },
  obligation_extract: {
    description: "Vertragspflichten aus einem Dokument oder Text extrahieren.",
    offered: true,
    schema: z.object({
      document_slug: docSlug.optional(),
      text: z.string().max(50_000).optional(),
      jurisdiction: z.enum(["at", "all"]).default("at"),
    }),
  },
  tabular_review: {
    description: "Mehrere Dokumente tabellarisch nach denselben Fragen prüfen (Massenreview).",
    offered: true,
    schema: z.object({
      questions: z.array(z.string().max(500)).min(1).max(50).describe("Prüffragen"),
      document_slugs: z.array(z.string().max(300)).max(100).optional(),
      case_slug: caseSlug.optional(),
    }),
  },
  deep_analysis: {
    // No executor in the chat panel; the dashboard runs it with its own UI.
    description: "Tiefenanalyse über mehrere Vault-Dokumente.",
    offered: false,
    schema: z.object({
      slugs: z.array(z.string().max(300)).min(1).max(25),
      prompt: z.string().max(2000).optional(),
      jurisdiction: z.enum(["at", "all"]).default("at"),
    }),
  },
  case_investigation: {
    // No executor in the chat panel; started from the matter page.
    description: "Sachverhaltsprüfung: Widersprüche, Beweislücken, neutrale Fragen.",
    offered: false,
    schema: z.object({
      case_slug: caseSlug,
      pruefauftrag: z.string().max(2000).optional(),
      incremental: z.boolean().optional(),
    }),
  },
  send_email: {
    // Never offered: mail leaves the firm from the mailbox after a draft.
    description: "E-Mail versenden.",
    offered: false,
    schema: z.object({
      to: z.array(z.string().max(500)).max(50),
      subject: z.string().max(500),
      text: z.string().max(100_000),
      cc: z.array(z.string().max(500)).max(50).optional(),
      case_slug: caseSlug.optional(),
    }),
  },
  client_lookup: {
    description: "Mandanten nachschlagen: Akte und Fristen in einem Schritt.",
    offered: true,
    schema: z.object({
      query: z.string().max(500).describe("Name des Mandanten"),
      deadline_status: z.enum(["open", "critical", "overdue", "all"]).default("open"),
    }),
  },
  deadline_mark_done: {
    description: "Eine Frist als erledigt markieren (braucht Bestätigung).",
    offered: true,
    schema: z.object({ deadline_slug: z.string().max(300) }),
  },
  create_task: {
    description: "Aufgabe auf einer Akte anlegen (braucht Bestätigung).",
    offered: true,
    schema: z.object({
      case_slug: caseSlug.optional(),
      title: z.string().max(500),
      due_date: z.string().max(20).optional().describe("ISO-Datum YYYY-MM-DD"),
    }),
  },
  create_deadline: {
    description:
      "Frist auf einer Akte anlegen — wird als ungeprüft markiert, der Anwalt bestätigt sie im Fristenkalender.",
    offered: true,
    schema: z.object({
      case_slug: caseSlug.optional(),
      title: z.string().max(500),
      due_date: z.string().max(20).describe("ISO-Datum YYYY-MM-DD"),
    }),
  },
  create_contact: {
    description: "Kontakt anlegen — Mandant, Gegner, Gericht, Anwalt (braucht Bestätigung).",
    offered: true,
    schema: z.object({
      name: z.string().max(300),
      role: z.enum(["client", "opponent", "court", "lawyer", "other"]).default("client"),
      email: z.string().max(300).optional(),
      phone: z.string().max(50).optional(),
      company: z.string().max(200).optional(),
    }),
  },
  request_signature: {
    description:
      "Signatur oder NDA vom Mandanten anfordern — legt nur den Entwurf an, versendet wird im Signaturbereich.",
    offered: true,
    schema: z.object({
      case_slug: caseSlug.optional(),
      document_name: z.string().max(300),
      recipient_name: z.string().max(300),
      recipient_email: z.string().max(300).optional(),
      template: z.enum(["manual", "nda"]).default("manual"),
    }),
  },
  render_template: {
    description:
      "Vorlage mit Akten- und Kanzleidaten befüllen; offene Platzhalter werden gemeldet (braucht Bestätigung).",
    offered: true,
    schema: z.object({
      template_query: z.string().max(300).describe("Name oder Slug der Vorlage"),
      case_slug: caseSlug.optional(),
      create_document: z
        .boolean()
        .default(false)
        .describe("Ergebnis als Dokument in der Akte ablegen"),
    }),
  },
  register_lookup: {
    description:
      "Registerabfrage (Firmenbuch, Grundbuch, Handelsregister …) — nur echte Partnerdaten, sonst „nicht konfiguriert“.",
    offered: true,
    schema: z.object({
      register: z
        .enum([
          "firmenbuch_at",
          "grundbuch_at",
          "handelsregister_de",
          "unternehmensregister_de",
          "insolvenz_de",
          "vollstreckungsportal_de",
        ])
        .optional(),
      query: z.string().max(300).optional().describe("Firmenname"),
      register_number: z.string().max(80).optional().describe("z. B. FN 123456a"),
      court: z.string().max(200).optional(),
    }),
  },
  create_automation_rule: {
    description:
      "„Wenn X, dann Y“-Regel anlegen; reagiert nur auf Ereignisse ab jetzt und läuft mit den Rechten des Nutzers (braucht Bestätigung). Bei deadline.due_soon Vorlauf über within_days.",
    offered: true,
    schema: z.object({
      name: z.string().max(200),
      event: z
        .enum([
          "document.uploaded",
          "deadline.created",
          "deadline.due_soon",
          "case.created",
          "case.status_changed",
          "message.received",
          "booking.created",
          "invoice.overdue",
        ])
        .describe("Auslöser"),
      within_days: z.number().int().min(0).max(365).optional(),
      action_type: z.enum(["create_task", "notify", "send_mail", "start_workflow", "set_status"]),
      action_title: z.string().max(300).optional(),
      action_message: z.string().max(2000).optional(),
      action_assignee: z.string().max(200).optional(),
      action_due_in_days: z.number().int().min(0).max(365).optional(),
      action_workflow_template_id: z.string().max(100).optional(),
      action_recipient: z.string().max(300).optional(),
      action_status: z
        .enum(["open", "pending", "settled", "won", "lost", "appealed", "dormant"])
        .optional(),
    }),
  },
  invoice_draft: {
    description:
      "Rechnungsentwurf aus den unverrechneten Zeiteinträgen einer Akte — bleibt Entwurf zur Prüfung (braucht Bestätigung).",
    offered: true,
    schema: z.object({
      case_slug: caseSlug.optional(),
      notes: z.string().max(2000).optional(),
    }),
  },
  organize_documents: {
    description:
      "Dokumente einer Akte in Ordner einordnen — vorher fragen, ob nur unsortierte oder alle (braucht Bestätigung).",
    offered: true,
    schema: z.object({
      case_slug: caseSlug.optional(),
      only_unsorted: z.boolean().default(true),
      overwrite: z.boolean().default(false),
    }),
  },
  rvg_calculate: {
    // Listed in the catalogue, but no executor exists in /api/copilot/tools.
    description: "Gebühren nach RVG berechnen.",
    offered: false,
    schema: z.object({
      streitwert: z.number().min(0),
      gebuehrentatbestand: z.string().max(100).optional(),
    }),
  },
};

// ── zod → JSON Schema (the subset the registry uses) ──────────────────

type ZodAny = z.ZodTypeAny;

function unwrap(schema: ZodAny): { inner: ZodAny; optional: boolean; defaultValue?: unknown } {
  let current = schema;
  let optional = false;
  let defaultValue: unknown;
  // Peel Optional / Default / Nullable wrappers in any order.
  for (;;) {
    if (current instanceof z.ZodOptional) {
      optional = true;
      current = current.unwrap();
    } else if (current instanceof z.ZodDefault) {
      optional = true;
      defaultValue = current._def.defaultValue();
      current = current.removeDefault();
    } else if (current instanceof z.ZodNullable) {
      optional = true;
      current = current.unwrap();
    } else {
      return { inner: current, optional, defaultValue };
    }
  }
}

function jsonSchemaFor(schema: ZodAny): Record<string, unknown> {
  const { inner, defaultValue } = unwrap(schema);
  const description = schema.description ?? inner.description;
  const base: Record<string, unknown> = {};
  if (description) base.description = description;
  if (defaultValue !== undefined) base.default = defaultValue;

  if (inner instanceof z.ZodString) {
    const out: Record<string, unknown> = { type: "string", ...base };
    for (const check of inner._def.checks) {
      if (check.kind === "min") out.minLength = check.value;
      if (check.kind === "max") out.maxLength = check.value;
    }
    return out;
  }
  if (inner instanceof z.ZodNumber) {
    const out: Record<string, unknown> = { type: "number", ...base };
    for (const check of inner._def.checks) {
      if (check.kind === "min") out.minimum = check.value;
      if (check.kind === "max") out.maximum = check.value;
      if (check.kind === "int") out.type = "integer";
    }
    return out;
  }
  if (inner instanceof z.ZodBoolean) return { type: "boolean", ...base };
  if (inner instanceof z.ZodEnum) return { type: "string", enum: [...inner.options], ...base };
  if (inner instanceof z.ZodLiteral) {
    const value = inner.value;
    return { type: typeof value === "number" ? "number" : "string", enum: [value], ...base };
  }
  if (inner instanceof z.ZodArray) {
    const out: Record<string, unknown> = {
      type: "array",
      items: jsonSchemaFor(inner.element),
      ...base,
    };
    if (inner._def.minLength) out.minItems = inner._def.minLength.value;
    if (inner._def.maxLength) out.maxItems = inner._def.maxLength.value;
    return out;
  }
  if (inner instanceof z.ZodObject) return { ...objectJsonSchema(inner), ...base };
  throw new Error(`copilot-tool-schemas: unsupported zod type ${inner._def.typeName}`);
}

function objectJsonSchema(schema: z.ZodObject<z.ZodRawShape>): Record<string, unknown> {
  const properties: Record<string, unknown> = {};
  const required: string[] = [];
  for (const [key, field] of Object.entries(schema.shape)) {
    properties[key] = jsonSchemaFor(field);
    if (!unwrap(field).optional) required.push(key);
  }
  const out: Record<string, unknown> = {
    type: "object",
    properties,
    additionalProperties: false,
  };
  if (required.length > 0) out.required = required;
  return out;
}

/** JSON Schema of one tool's arguments (what the provider receives). */
export function copilotToolInputSchema(name: CopilotToolName): Record<string, unknown> {
  return objectJsonSchema(COPILOT_TOOL_SCHEMAS[name].schema);
}

/** The zod schema used to validate a model's arguments, or undefined for unknown names. */
export function copilotToolSchema(name: string): z.ZodObject<z.ZodRawShape> | undefined {
  return COPILOT_TOOL_SCHEMAS[name as CopilotToolName]?.schema;
}

/** Tool names the model may be offered (executable from the chat, and known to the catalogue). */
export function offeredCopilotTools(): CopilotToolName[] {
  return (Object.keys(COPILOT_TOOL_SCHEMAS) as CopilotToolName[]).filter(
    (name) => COPILOT_TOOL_SCHEMAS[name].offered && name in TOOL_CONDITIONS
  );
}

/**
 * The tool definitions to send with a Copilot request: only tools the
 * catalogue allows for this role / context (agent-conditionals) and that the
 * chat can execute. Descriptions are capped at what the engine accepts.
 */
export function copilotToolDefinitions(ctx: ToolConditionContext): CopilotToolDefinition[] {
  const allowed = new Set(getAvailableTools(ctx));
  return offeredCopilotTools()
    .filter((name) => allowed.has(name))
    .slice(0, MAX_TOOLS_PER_REQUEST)
    .map((name) => ({
      name,
      description: COPILOT_TOOL_SCHEMAS[name].description.slice(0, MAX_TOOL_DESCRIPTION_CHARS),
      inputSchema: copilotToolInputSchema(name),
    }));
}

/**
 * Bridges a structured tool call into the attribute map the marker parser
 * produces, so both paths share one normalisation (`TOOL_SPECS` transforms
 * in chat-panel.tsx). Arrays join with "; " — the same separator the marker
 * format uses for lists.
 */
export function toolArgsToAttrs(args: Record<string, unknown>): Record<string, string> {
  const attrs: Record<string, string> = {};
  for (const [key, value] of Object.entries(args)) {
    if (value === undefined || value === null) continue;
    if (Array.isArray(value)) {
      attrs[key] = value
        .map((v) => (typeof v === "string" ? v : JSON.stringify(v)))
        .filter((v) => v.length > 0)
        .join("; ");
    } else if (typeof value === "object") {
      attrs[key] = JSON.stringify(value);
    } else {
      attrs[key] = String(value);
    }
  }
  return attrs;
}
