import { randomUUID } from "node:crypto";
import { z } from "zod";
import { engineThink } from "@/lib/engine-think";
import {
  CONFIRMED_TOOLS,
  consumeToolConfirmation,
  createToolConfirmation,
} from "@/lib/copilot-confirmation";
import { sanitizeUserInput } from "@/lib/prompt-sanitizer";
import { ENGINE_URL, recordCreditConsumption, enginePatchPage } from "@/lib/engine";
import { buildNdaTemplate } from "@/lib/nda-template";
import { contactSlugFor } from "@/lib/case-contacts";
import { listEnginePages } from "@/lib/engine-pages";
import { createServerBrainClient } from "@/lib/server-brain";
import { listAllTimeEntries, type TimeEntryWithCase } from "@/lib/time-tracking";
import { createInvoiceReservingEntries } from "@/lib/invoice-billing-lock";
import { createCaseSafely, engineCaseCreateDeps } from "@/lib/safe-case-create";
import { requestConflictCheck } from "@/lib/conflict-gate";
import { allocateInvoiceNumber, highestInvoiceNumber } from "@/lib/invoice-numbering";
import { gobdFrontmatter, invoiceContentString, sha256Hex } from "@/lib/gobd";
import { vatRateFor } from "@/lib/kanzlei-settings";
import type { TaskEntry, DeadlineEntry, TimeEntry, DocumentEntry } from "@/lib/legal-types";
import { mapWithConcurrency } from "@/lib/cron-utils";
import { brainPageHref, INVOICING_HREF } from "@/lib/dashboard-hrefs";
import { planVaultOrganization } from "@/lib/vault-organization";
import {
  CREDIT_COSTS,
  checkCredits,
  ensureTrialCredits,
  insufficientCreditsResponse,
  type CreditOperation,
} from "@/lib/billing/credits";
import { env } from "@/lib/env";
import { createHandler, apiSuccess, apiError } from "@/lib/api-handler";
import { isToolAvailable, getToolList, type ToolConditionContext } from "@/lib/agent-conditionals";
import { sendMailboxMessage, buildMailDraft } from "@/lib/email/mailbox";
import { markOnboardingProgress } from "@/lib/auth/store";
import { extractVariableKeys, fillTemplate, resolveKnownVariables } from "@/lib/templates";
import { KANZLEI_SETTINGS_SLUG, type KanzleiSettings } from "@/lib/kanzlei-settings";
import {
  REGISTER_LABEL,
  resolveRegisterAdapter,
  type RegisterEntry,
  type RegisterKind,
} from "@/lib/legal/register-adapter";
import type { CaseFrontmatter } from "@/lib/legal-types";
import {
  MAX_ACTIONS,
  MAX_DUE_SOON_DAYS,
  TRIGGER_ACTION_TYPES,
  TRIGGER_EVENTS,
  buildNewAutomationRule,
  describeRule,
  normalizeTriggerEvent,
  saveAutomation,
  validateActions,
  type AutomationAction,
} from "@/lib/automation";

import { logger } from "@/lib/logger";
const log = logger("api/copilot/tools");

// ── Tool Schemas ──────────────────────────────────────────────────────

const navigateSchema = z.object({
  route: z
    .string()
    .min(1)
    .refine((r) => r.startsWith("/dashboard"), "must start with /dashboard"),
});

const ALLOWED_DASHBOARD_ROUTES = new Set([
  "/dashboard",
  "/dashboard/agents",
  "/dashboard/analyze",
  "/dashboard/anonymize",
  "/dashboard/api-keys",
  "/dashboard/approvals",
  "/dashboard/audit",
  "/dashboard/billing",
  "/dashboard/brain",
  "/dashboard/calendar-export",
  "/dashboard/case-scanner",
  "/dashboard/cases",
  "/dashboard/cases/new",
  "/dashboard/chat",
  "/dashboard/clause-library",
  "/dashboard/client-portal",
  "/dashboard/compliance",
  "/dashboard/compliance/retention",
  "/dashboard/connectors",
  "/dashboard/contacts",
  "/dashboard/contracts",
  "/dashboard/controlling",
  "/dashboard/data-export",
  "/dashboard/deadlines",
  "/dashboard/deep-analysis",
  "/dashboard/document-requests",
  "/dashboard/drafting",
  "/dashboard/email-import",
  "/dashboard/graph",
  "/dashboard/import-kanzlei",
  "/dashboard/intake",
  "/dashboard/invoicing",
  "/dashboard/judgements-sync",
  "/dashboard/kollisionspruefung",
  "/dashboard/monitoring",
  "/dashboard/obligation-tracking",
  "/dashboard/onboarding",
  "/dashboard/opponents",
  "/dashboard/playbooks",
  "/dashboard/process-strategy",
  "/dashboard/research",
  "/dashboard/review-queue",
  "/dashboard/settings",
  "/dashboard/settings/ai-model",
  "/dashboard/settings/kanzlei",
  "/dashboard/settings/scim",
  "/dashboard/settings/security",
  "/dashboard/signature",
  "/dashboard/sources",
  "/dashboard/tabular-review",
  "/dashboard/team",
  "/dashboard/translate",
  "/dashboard/upload",
  "/dashboard/vault",
  "/dashboard/verfahrensdoku",
  "/dashboard/version-history",
  "/dashboard/whatsapp",
  "/dashboard/whatsapp/templates",
  "/dashboard/word-addin",
  "/dashboard/workflows",
]);

function isAllowedDashboardRoute(route: string): boolean {
  const clean = route.split(/[?#]/)[0]?.replace(/\/$/, "") || "/dashboard";
  return (
    ALLOWED_DASHBOARD_ROUTES.has(clean) ||
    clean.startsWith("/dashboard/cases/") ||
    clean.startsWith("/dashboard/brain/")
  );
}

const searchCasesSchema = z.object({
  query: z.string().min(1).max(2_000),
  limit: z.number().min(1).max(50).default(10),
});

const searchDeadlinesSchema = z.object({
  case_slug: z.string().optional(),
  status: z.enum(["open", "overdue", "critical", "all"]).default("open"),
  limit: z.number().min(1).max(50).default(10),
});

const searchKnowledgeSchema = z.object({
  query: z.string().min(1).max(2_000),
  limit: z.number().min(1).max(20).default(5),
});

const createCaseSchema = z.object({
  title: z.string().min(1).max(300),
  client_name: z.string().max(200).optional(),
  opponent_name: z.string().max(200).optional(),
  case_type: z.string().max(100).optional(),
});

const caseSummarySchema = z.object({
  case_slug: z.string().min(1).max(200),
});

const emailDraftSchema = z.object({
  case_slug: z.string().max(200).optional(),
  recipient: z.string().max(500).optional(),
  subject: z.string().min(1).max(500),
  tone: z.enum(["formal", "neutral", "urgent"]).default("formal"),
  key_points: z.array(z.string().max(500)).max(20).default([]),
});

const deadlineExtractSchema = z.object({
  document_slug: z.string().min(1).max(200),
});

const documentSummarySchema = z.object({
  document_slug: z.string().min(1).max(200),
  max_points: z.number().min(3).max(20).default(8),
});

const conflictCheckSchema = z.object({
  name: z.string().min(1).max(500),
  /** Side of the name in the NEW mandate (§ 10 RAO): client or opponent. */
  side: z.enum(["client", "opponent"]).default("client"),
});

const timeEntrySchema = z.object({
  case_slug: z.string().min(1).max(200),
  description: z.string().min(1).max(2000),
  hours: z.number().min(0.1).max(24).optional(),
  activity_type: z
    .enum(["research", "drafting", "review", "meeting", "correspondence", "other"])
    .default("other"),
});

const clientUpdateSchema = z.object({
  case_slug: z.string().min(1).max(200),
  update_type: z.enum(["status", "deadline", "next_steps", "summary"]).default("status"),
});

const meetingTasksSchema = z.object({
  notes: z.string().min(1).max(10_000),
  case_slug: z.string().max(200).optional(),
});

const intakeCreateSchema = z.object({
  client_name: z.string().min(1).max(200),
  matter_type: z.string().min(1).max(200),
  jurisdiction: z.literal("at").default("at"),
  urgency: z.enum(["low", "medium", "high", "critical"]).default("medium"),
  conflict_check: z.boolean().default(true),
});

const documentRequestCreateSchema = z.object({
  case_slug: z.string().min(1).max(200),
  items: z.array(z.string().min(1).max(160)).max(50).optional(),
  message_draft: z.string().max(5000).optional(),
  channel: z.enum(["whatsapp", "portal", "email", "manual"]).default("portal"),
});

const precedentSearchToolSchema = z.object({
  query: z.string().min(1).max(2000),
  jurisdiction: z.literal("at").optional(),
  legal_area: z.string().max(200).optional(),
});

const translateTextToolSchema = z
  .object({
    document_slug: z.string().max(300).optional(),
    text: z.string().max(512_000).optional(),
    source_language: z.string().max(10).optional(),
    target_language: z.string().min(2).max(10),
  })
  .refine((v) => v.document_slug || v.text, { message: "document_slug_or_text_required" });

const obligationExtractToolSchema = z
  .object({
    document_slug: z.string().max(300).optional(),
    text: z.string().max(512_000).optional(),
    jurisdiction: z.enum(["at", "all"]).default("at"),
  })
  .refine((v) => v.document_slug || v.text, { message: "document_slug_or_text_required" });

const tabularReviewToolSchema = z.object({
  questions: z.array(z.string().min(1)).min(1).max(50),
  document_slugs: z.array(z.string()).optional(),
  case_slug: z.string().optional(),
});

const deepAnalysisToolSchema = z.object({
  slugs: z.array(z.string().min(1)).min(1).max(25),
  prompt: z.string().max(2000).optional(),
  jurisdiction: z.enum(["at", "all"]).default("at"),
});

const caseInvestigationToolSchema = z.object({
  case_slug: z.string().min(1),
  pruefauftrag: z.string().max(2000).optional(),
  jurisdiction: z.literal("at").default("at"),
  incremental: z.boolean().optional(),
});

const sendEmailToolSchema = z.object({
  to: z.union([z.string().max(500), z.array(z.string().max(500)).max(50)]),
  subject: z.string().min(1).max(500),
  text: z.string().min(1).max(100_000),
  cc: z.union([z.string().max(500), z.array(z.string().max(500)).max(50)]).optional(),
  case_slug: z.string().max(200).optional(),
});

const clientLookupSchema = z.object({
  query: z.string().min(1).max(500),
  include_deadlines: z.boolean().default(true),
  deadline_status: z.enum(["open", "critical", "overdue", "all"]).default("open"),
});

const deadlineMarkDoneSchema = z.object({
  deadline_slug: z.string().min(1).max(300),
});

const createTaskSchema = z.object({
  case_slug: z.string().min(1).max(300),
  title: z.string().min(1).max(500),
  due_date: z.string().max(20).optional(),
  /**
   * WP-7.42: "agent" weist die Aufgabe dem KI-Agenten zu — cron/agent-tasks
   * bearbeitet sie mit Aktenkontext und stellt das Ergebnis zur Prüfung.
   */
  assignee_type: z.enum(["user", "agent"]).optional(),
});

const createDeadlineSchema = z.object({
  case_slug: z.string().min(1).max(300),
  title: z.string().min(1).max(500),
  due_date: z.string().min(1).max(20),
});

const createContactSchema = z.object({
  name: z.string().min(1).max(300),
  role: z.enum(["client", "opponent", "court", "lawyer", "other"]).default("client"),
  email: z.string().email().optional().or(z.literal("")),
  phone: z.string().max(50).optional(),
  company: z.string().max(200).optional(),
});

const requestSignatureSchema = z.object({
  case_slug: z.string().min(1).max(300),
  document_name: z.string().min(1).max(300),
  recipient_name: z.string().min(1).max(300),
  recipient_email: z.string().email().optional().or(z.literal("")),
  template: z.enum(["manual", "nda"]).default("manual"),
  expires_days: z.number().min(1).max(90).default(14),
});

const searchTasksSchema = z.object({
  case_slug: z.string().max(200).optional(),
  status: z.enum(["open", "done", "all"]).default("open"),
  priority: z.enum(["low", "medium", "high", "critical", "all"]).default("all"),
  limit: z.number().min(1).max(50).default(15),
});

const searchCalendarSchema = z.object({
  date: z.string().max(20).optional(),
  range: z.enum(["today", "week", "month"]).default("week"),
  case_slug: z.string().max(200).optional(),
  limit: z.number().min(1).max(50).default(20),
});

const renderTemplateSchema = z.object({
  /** Slug oder Titel der Vorlage (Teilstring-Suche). */
  template_query: z.string().min(1).max(300),
  case_slug: z.string().max(300).optional(),
  /** Manuelle Platzhalter-Werte, überschreiben die automatische Auflösung. */
  values: z.record(z.string().max(100), z.string().max(4_000)).optional(),
  /** Befülltes Ergebnis als Dokument-Seite in der Akte ablegen. */
  create_document: z.boolean().default(false),
});

const registerLookupSchema = z
  .object({
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
    query: z.string().max(300).optional(),
    register_number: z.string().max(80).optional(),
    court: z.string().max(200).optional(),
    limit: z.number().min(1).max(20).default(10),
  })
  .refine((v) => (v.query?.trim() ?? "") !== "" || (v.register_number?.trim() ?? "") !== "", {
    message: "query_or_number_required",
  });

const invoiceDraftSchema = z.object({
  case_slug: z.string().min(1).max(300),
  /**
   * Explizite Positionen. Fehlen sie, werden die unbilled billable
   * time_entries der Akte gesammelt — „Rechnung entwerfen" soll ohne
   * Positionsliste funktionieren.
   */
  items: z
    .array(
      z.object({
        description: z.string().min(1).max(500),
        hours: z.number().nonnegative().max(10_000).optional(),
        rate: z.number().nonnegative().max(100_000).optional(),
        amount: z.number().nonnegative().max(100_000_000).optional(),
      })
    )
    .max(100)
    .optional(),
  include_unbilled_time: z.boolean().default(true),
  notes: z.string().max(2_000).optional(),
});

const automationActionSchema = z.object({
  type: z.enum(TRIGGER_ACTION_TYPES),
  title: z.string().max(300).optional(),
  message: z.string().max(2_000).optional(),
  assignee: z.string().max(200).optional(),
  due_in_days: z.number().int().min(0).max(365).optional(),
  workflow_template_id: z.string().max(100).optional(),
  recipient: z.string().max(300).optional(),
  status: z.string().max(100).optional(),
});

const createAutomationRuleSchema = z.object({
  name: z.string().min(1).max(200),
  /** Kanonischer Auslöser; Alt-Schreibweisen (invoice_overdue …) werden übersetzt. */
  event: z.preprocess((v) => normalizeTriggerEvent(v) ?? v, z.enum(TRIGGER_EVENTS)),
  /** Gleichheitsfilter auf Event-Payload-Felder, z. B. { channel: "whatsapp" }. */
  filters: z.record(z.string().max(100), z.string().max(300)).optional(),
  /** deadline.due_soon: Vorlauf in Tagen (Standard 7). */
  within_days: z.number().int().min(0).max(MAX_DUE_SOON_DAYS).optional(),
  action: automationActionSchema.optional(),
  actions: z.array(automationActionSchema).min(1).max(MAX_ACTIONS).optional(),
});

const organizeDocumentsSchema = z.object({
  case_slug: z.string().min(1).max(300),
  /** true = nur ungeordnete Dokumente einordnen; false + overwrite = neu sortieren. */
  only_unsorted: z.boolean().default(true),
  overwrite: z.boolean().default(false),
});

const toolSchema = z.object({
  tool: z.enum([
    "navigate",
    "search_cases",
    "search_deadlines",
    "search_knowledge",
    "search_tasks",
    "search_calendar",
    "create_case",
    "case_summary",
    "email_draft",
    "deadline_extract",
    "document_summary",
    "conflict_check",
    "time_entry",
    "client_update",
    "meeting_tasks",
    "intake_create",
    "document_request_create",
    "precedent_search",
    "translate_text",
    "obligation_extract",
    "tabular_review",
    "deep_analysis",
    "case_investigation",
    "send_email",
    "client_lookup",
    "deadline_mark_done",
    "create_task",
    "create_deadline",
    "create_contact",
    "request_signature",
    "render_template",
    "register_lookup",
    "invoice_draft",
    "create_automation_rule",
    "organize_documents",
  ]),
  params: z.record(z.unknown()).default({}),
  /** "prepare" returns a confirmation token for a tool in CONFIRMED_TOOLS. */
  mode: z.enum(["prepare", "execute"]).default("execute"),
  confirmation: z.string().max(2_000).optional(),
});

// ── Tool Executors ────────────────────────────────────────────────────

interface ToolResponse {
  success: boolean;
  data?: unknown;
  error?: string;
  display: {
    kind:
      | "navigation"
      | "list"
      | "summary"
      | "confirmation"
      | "deadline_cards"
      | "client_overview"
      | "calendar_cards"
      | "task_cards";
    title: string;
    items?: Array<{
      label: string;
      value?: string;
      href?: string;
      // deadline_cards
      deadlineStatus?: string;
      daysUntil?: number;
      dueDate?: string;
      caseTitle?: string;
      caseSlug?: string;
      isNotfrist?: boolean;
      isVorfrist?: boolean;
      needsSecondCheck?: boolean;
      deadlineSlug?: string;
      // calendar_cards
      startTime?: string;
      endTime?: string;
      date?: string;
      eventType?: string;
      location?: string;
      // task_cards
      priority?: string;
      done?: boolean;
      taskSlug?: string;
      // case list enrichment (AP6)
      caseStatus?: string;
      openDeadlineCount?: number;
    }>;
    href?: string;
    message?: string;
    filterHref?: string;
    summary?: {
      caseTitle?: string;
      caseSlug?: string;
      caseStatus?: string;
      openDeadlines?: number;
      totalDeadlines?: number;
      nextDeadlineDate?: string;
      openTasks?: number;
      documentCount?: number;
    };
  };
}

async function executeNavigate(params: z.infer<typeof navigateSchema>): Promise<ToolResponse> {
  if (!isAllowedDashboardRoute(params.route)) {
    return {
      success: false,
      error: "Route not allowed",
      display: {
        kind: "navigation",
        title: "Navigation blockiert",
        message: "Diese Dashboard-Route ist nicht bekannt.",
      },
    };
  }
  return {
    success: true,
    data: { route: params.route },
    display: {
      kind: "navigation",
      title: "Navigation",
      href: params.route,
      message: `Wechseln zu ${params.route}`,
    },
  };
}

async function executeSearchCases(
  ctx: { headers: Record<string, string> },
  params: z.infer<typeof searchCasesSchema>
): Promise<ToolResponse> {
  try {
    const res = await fetch(
      `${ENGINE_URL}/api/pages?type=legal_case&limit=${params.limit}&q=${encodeURIComponent(params.query)}`,
      { headers: ctx.headers }
    );
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const pages = (await res.json()) as Array<{
      slug: string;
      title: string;
      frontmatter?: Record<string, unknown>;
    }>;
    return {
      success: true,
      data: pages,
      display: {
        kind: "list",
        title: `${pages.length} Akten gefunden`,
        items: pages.map((p) => ({
          label: p.title,
          value: (p.frontmatter?.case_type as string) ?? "Akten",
          href: `/dashboard/cases/${p.slug.replace(/^cases\//, "")}`,
        })),
      },
    };
  } catch (_err) {
    return {
      success: false,
      error: "Search failed",
      display: {
        kind: "list",
        title: "Akten-Suche fehlgeschlagen",
        message: "Engine nicht erreichbar",
      },
    };
  }
}

async function executeSearchDeadlines(
  ctx: { headers: Record<string, string> },
  params: z.infer<typeof searchDeadlinesSchema>
): Promise<ToolResponse> {
  try {
    const params_url = new URLSearchParams();
    params_url.set("type", "deadline");
    params_url.set("limit", String(params.limit));
    if (params.case_slug) params_url.set("q", params.case_slug);
    const res = await fetch(`${ENGINE_URL}/api/pages?${params_url.toString()}`, {
      headers: ctx.headers,
      signal: AbortSignal.timeout(30_000),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const pages = (await res.json()) as Array<{
      slug: string;
      title: string;
      frontmatter?: Record<string, unknown>;
    }>;
    const now = new Date();
    now.setUTCHours(0, 0, 0, 0);

    // Build rich deadline items using shared helper
    const items = pages
      .map((p) => buildDeadlineItem(p, now))
      .filter((item): item is NonNullable<typeof item> => item !== null);

    // Filter by requested status
    let filtered = items;
    if (params.status === "open") {
      filtered = items.filter((i) => i.deadlineStatus !== "done" && i.deadlineStatus !== "overdue");
    } else if (params.status === "overdue") {
      filtered = items.filter((i) => i.deadlineStatus === "overdue");
    } else if (params.status === "critical") {
      filtered = items.filter(
        (i) =>
          i.deadlineStatus === "critical" ||
          i.deadlineStatus === "overdue" ||
          i.deadlineStatus === "vorfrist"
      );
    }

    // Sort: most urgent first
    filtered.sort((a, b) => (a.daysUntil ?? 9999) - (b.daysUntil ?? 9999));

    // Build filter href for deep-link to deadlines page
    const filterParams = new URLSearchParams();
    if (params.case_slug) filterParams.set("case", params.case_slug);
    if (params.status === "critical") filterParams.set("status", "critical");
    else if (params.status === "overdue") filterParams.set("status", "overdue");
    const filterHref = `/dashboard/deadlines${filterParams.toString() ? `?${filterParams.toString()}` : ""}`;

    const statusLabel =
      params.status === "open"
        ? "offen"
        : params.status === "overdue"
          ? "überfällig"
          : params.status === "critical"
            ? "kritisch"
            : "alle";

    return {
      success: true,
      data: filtered,
      display: {
        kind: "deadline_cards",
        title: `${filtered.length} Fristen (${statusLabel})`,
        items: filtered,
        filterHref,
        message: filtered.length === 0 ? `Keine ${statusLabel} Fristen gefunden.` : undefined,
      },
    };
  } catch (_err) {
    return {
      success: false,
      error: "Search failed",
      display: {
        kind: "deadline_cards",
        title: "Fristen-Suche fehlgeschlagen",
        message: "Engine nicht erreichbar",
      },
    };
  }
}

async function executeSearchKnowledge(
  ctx: { headers: Record<string, string> },
  params: z.infer<typeof searchKnowledgeSchema>
): Promise<ToolResponse> {
  try {
    const res = await fetch(
      `${ENGINE_URL}/api/search?q=${encodeURIComponent(params.query)}&limit=${params.limit}`,
      { headers: ctx.headers }
    );
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const results = (await res.json()) as Array<{
      slug: string;
      title: string;
      snippet?: string;
      score?: number;
    }>;
    return {
      success: true,
      data: results,
      display: {
        kind: "list",
        title: `${results.length} Wissenseinträge gefunden`,
        items: results.map((r) => ({
          label: r.title,
          value: r.snippet?.slice(0, 80) ?? "",
          href: `/dashboard/brain/${encodeURIComponent(r.slug)}`,
        })),
      },
    };
  } catch (_err) {
    return {
      success: false,
      error: "Search failed",
      display: {
        kind: "list",
        title: "Wissens-Suche fehlgeschlagen",
        message: "Engine nicht erreichbar",
      },
    };
  }
}

async function executeCreateCase(
  ctx: { headers: Record<string, string> },
  params: z.infer<typeof createCaseSchema>
): Promise<ToolResponse> {
  const safeTitle = sanitizeUserInput(params.title);
  const safeClientName = params.client_name ? sanitizeUserInput(params.client_name) : undefined;
  const safeOpponentName = params.opponent_name
    ? sanitizeUserInput(params.opponent_name)
    : undefined;
  const safeCaseType = params.case_type ? sanitizeUserInput(params.case_type) : undefined;
  // Shared safe path: server slug, never replaces a matter, conflict check (§ 10 RAO).
  const outcome = await createCaseSafely(engineCaseCreateDeps(ctx.headers), {
    title: safeTitle,
    slugHint: safeTitle,
    content: `# ${safeTitle}\n\n## Akteninformation\n\n- **Mandant:** ${safeClientName ?? "—"}\n- **Gegenseite:** ${safeOpponentName ?? "—"}\n- **Typ:** ${safeCaseType ?? "Zivilrecht"}\n`,
    frontmatter: {
      ...(safeClientName ? { client_name: safeClientName } : {}),
      ...(safeOpponentName ? { opponent_name: safeOpponentName } : {}),
      ...(safeCaseType ? { case_type: safeCaseType } : {}),
      status: "active",
      created_via: "copilot",
      created_at: new Date().toISOString(),
    },
  });
  if (outcome.status === "created") {
    return {
      success: true,
      data: { slug: outcome.slug },
      display: {
        kind: "confirmation",
        title: `Akte erstellt: ${safeTitle}`,
        href: `/dashboard/cases/${outcome.slug.replace(/^legal\/cases\//, "")}`,
        message: `Die Akte wurde angelegt. Mandant: ${safeClientName ?? "—"}, Gegenseite: ${safeOpponentName ?? "—"}`,
      },
    };
  }
  if (outcome.status === "conflict") {
    return {
      success: false,
      error: "conflict_detected",
      data: { conflict: { hasConflict: true, matches: outcome.matches } },
      display: {
        kind: "confirmation",
        title: "⚠️ Interessenkonflikt — keine Akte angelegt",
        message:
          "Die Kollisionsprüfung hat einen Konflikt gefunden. Bitte über die Mandatsannahme prüfen und nur mit begründeter Freigabe fortfahren.",
        items: outcome.matches.map((m) => ({ label: `⚠️ ${m.name}`, value: m.type })),
      },
    };
  }
  return {
    success: false,
    error: outcome.status === "exists" ? "case_slug_exists" : outcome.code,
    display: {
      kind: "confirmation",
      title: "Akte konnte nicht erstellt werden",
      message:
        outcome.status === "exists"
          ? "Unter dieser Kennung gibt es bereits eine Akte."
          : outcome.message,
    },
  };
}

async function executeCaseSummary(
  ctx: { headers: Record<string, string> },
  params: z.infer<typeof caseSummarySchema>
): Promise<ToolResponse> {
  try {
    const path = params.case_slug.split("/").map(encodeURIComponent).join("/");
    const res = await fetch(`${ENGINE_URL}/api/pages/${path}`, {
      headers: ctx.headers,
      signal: AbortSignal.timeout(30_000),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const page = (await res.json()) as {
      slug: string;
      title: string;
      content: string;
      frontmatter?: Record<string, unknown>;
    };
    const fm = page.frontmatter ?? {};
    return {
      success: true,
      data: page,
      display: {
        kind: "summary",
        title: `Zusammenfassung: ${page.title}`,
        href: `/dashboard/cases/${params.case_slug.replace(/^cases\//, "")}`,
        items: [
          { label: "Mandant", value: (fm.client_name as string) ?? "—" },
          { label: "Gegenseite", value: (fm.opponent_name as string) ?? "—" },
          { label: "Status", value: (fm.status as string) ?? "aktiv" },
          { label: "Typ", value: (fm.case_type as string) ?? "—" },
        ],
      },
    };
  } catch (_err) {
    return {
      success: false,
      error: "Summary failed",
      display: {
        kind: "summary",
        title: "Zusammenfassung fehlgeschlagen",
        message: "Akte nicht gefunden",
      },
    };
  }
}

// ── New Tool Executors ────────────────────────────────────────────────

async function executeEmailDraft(
  ctx: { headers: Record<string, string> },
  params: z.infer<typeof emailDraftSchema>
): Promise<ToolResponse> {
  try {
    let caseContext = "";
    if (params.case_slug) {
      const path = params.case_slug.split("/").map(encodeURIComponent).join("/");
      const res = await fetch(`${ENGINE_URL}/api/pages/${path}`, {
        headers: ctx.headers,
        signal: AbortSignal.timeout(10_000),
      });
      if (res.ok) {
        const page = (await res.json()) as { title: string; frontmatter?: Record<string, unknown> };
        const fm = page.frontmatter ?? {};
        caseContext = `\nAKTKONTEXT: ${sanitizeUserInput(page.title)}\nMandant: ${sanitizeUserInput(String(fm.client_name ?? "—"))}\nGegenseite: ${sanitizeUserInput(String(fm.opponent_name ?? "—"))}\nStatus: ${sanitizeUserInput(String(fm.status ?? "aktiv"))}`;
      }
    }

    const toneMap = {
      formal: "formell und professionell",
      neutral: "sachlich und neutral",
      urgent: "dringend, aber professionell",
    };
    const safeRecipient = params.recipient ? sanitizeUserInput(params.recipient) : undefined;
    const safeSubject = sanitizeUserInput(params.subject);
    const safePoints = params.key_points.map((p) => sanitizeUserInput(p));
    const pointsList =
      safePoints.length > 0 ? `\nHauptpunkte:\n${safePoints.map((p) => `- ${p}`).join("\n")}` : "";

    const draftBody = {
      query: `Verfasse eine ${toneMap[params.tone]} E-Mail${safeRecipient ? ` an ${safeRecipient}` : ""} zum Thema "${safeSubject}".${caseContext}${pointsList}\n\nDie E-Mail soll:\n- Eine angemessene Anrede\n- Den Sachverhalt präzise zusammenfassen\n- Klare nächste Schritte nennen\n- Eine professionelle Signatur andeuten\n\nFormat: Betreff + Body`,
      mode: "balanced" as const,
    };

    // /api/think streams (SSE); engineThink reads the stream and the final answer.
    const data = await engineThink(ctx.headers, { ...draftBody, timeoutMs: 60_000 });

    return {
      success: true,
      data: { draft: data.answer },
      display: {
        kind: "summary",
        title: `Email-Entwurf: ${params.subject}`,
        message: data.answer ? data.answer.slice(0, 200) + "..." : "Kein Entwurf generiert",
        items: [
          { label: "Betreff", value: params.subject },
          { label: "Empfänger", value: params.recipient ?? "—" },
          { label: "Ton", value: toneMap[params.tone] },
        ],
      },
    };
  } catch (_err) {
    return {
      success: false,
      error: "Email draft failed",
      display: {
        kind: "summary",
        title: "Email-Entwurf fehlgeschlagen",
        message: "Engine nicht erreichbar",
      },
    };
  }
}

async function executeDeadlineExtract(
  ctx: { headers: Record<string, string> },
  params: z.infer<typeof deadlineExtractSchema>
): Promise<ToolResponse> {
  try {
    const path = params.document_slug.split("/").map(encodeURIComponent).join("/");
    const res = await fetch(`${ENGINE_URL}/api/pages/${path}`, {
      headers: ctx.headers,
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const page = (await res.json()) as {
      slug: string;
      title: string;
      content: string;
      frontmatter?: Record<string, unknown>;
    };

    // /api/think streams (SSE); engineThink reads the stream and the final answer.
    const thinkData = await engineThink(ctx.headers, {
      query: `Analysiere das folgende Dokument und extrahiere alle Fristen, Termine und Deadlines. Gib jedes als strukturierten Eintrag zurück (Datum, Art, Beschreibung):\n\n${sanitizeUserInput(page.content.slice(0, 8000))}`,
      mode: "balanced",
      timeoutMs: 60_000,
    });

    return {
      success: true,
      data: { extracted: thinkData.answer, document: page.title },
      display: {
        kind: "summary",
        title: `Fristen extrahiert aus: ${page.title}`,
        message: thinkData.answer
          ? thinkData.answer.slice(0, 300) + "..."
          : "Keine Fristen gefunden",
        items: [
          {
            label: "Dokument",
            value: page.title,
            href: `/dashboard/brain/${encodeURIComponent(page.slug)}`,
          },
        ],
      },
    };
  } catch (_err) {
    return {
      success: false,
      error: "Deadline extraction failed",
      display: {
        kind: "summary",
        title: "Fristen-Extraktion fehlgeschlagen",
        message: "Dokument nicht gefunden",
      },
    };
  }
}

async function executeDocumentSummary(
  ctx: { headers: Record<string, string> },
  params: z.infer<typeof documentSummarySchema>
): Promise<ToolResponse> {
  try {
    const path = params.document_slug.split("/").map(encodeURIComponent).join("/");
    const res = await fetch(`${ENGINE_URL}/api/pages/${path}`, {
      headers: ctx.headers,
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const page = (await res.json()) as { slug: string; title: string; content: string };

    // /api/think streams (SSE); engineThink reads the stream and the final answer.
    const thinkData = await engineThink(ctx.headers, {
      query: `Fasse das folgende Dokument in ${params.max_points} Key Points zusammen. Identifiziere kritische Klauseln, Risiken und Handlungsbedarf:\n\n${sanitizeUserInput(page.content.slice(0, 10000))}`,
      mode: "balanced",
      timeoutMs: 60_000,
    });

    return {
      success: true,
      data: { summary: thinkData.answer, document: page.title },
      display: {
        kind: "summary",
        title: `Zusammenfassung: ${page.title}`,
        message: thinkData.answer
          ? thinkData.answer.slice(0, 400) + "..."
          : "Keine Zusammenfassung verfügbar",
        items: [
          {
            label: "Dokument",
            value: page.title,
            href: `/dashboard/brain/${encodeURIComponent(page.slug)}`,
          },
        ],
      },
    };
  } catch (_err) {
    return {
      success: false,
      error: "Summary failed",
      display: {
        kind: "summary",
        title: "Zusammenfassung fehlgeschlagen",
        message: "Dokument nicht gefunden",
      },
    };
  }
}

async function executeConflictCheck(
  ctx: { headers: Record<string, string> },
  params: z.infer<typeof conflictCheckSchema>
): Promise<ToolResponse> {
  const safeName = sanitizeUserInput(params.name);
  try {
    const result = await requestConflictCheck(
      ctx.headers,
      { name: safeName, side: params.side },
      30_000
    );
    const relevant = result.matches.filter((m) => m.assessment !== "info");
    const hasConflict = result.severity === "critical";
    return {
      success: true,
      data: { severity: result.severity, hasConflict, matches: relevant },
      display: {
        kind: "confirmation",
        title: hasConflict
          ? `⚠️ Interessenkonflikt für "${safeName}"`
          : result.severity === "low"
            ? `Prüfen: Treffer für "${safeName}"`
            : `✓ Kein Konflikt für "${safeName}"`,
        message: `${result.explanation} Anwaltlich zu prüfen.`,
        items: relevant.map((m) => ({
          label: m.matched_name || m.title,
          value: m.assessment === "critical" ? "Konflikt" : "prüfen",
          href: m.slug ? `/dashboard/brain/${encodeURIComponent(m.slug)}` : undefined,
        })),
      },
    };
  } catch {
    return {
      success: false,
      error: "conflict_check_unavailable",
      display: {
        kind: "summary",
        title: "Kollisionsprüfung nicht verfügbar",
        message:
          "Die Prüfung konnte nicht durchgeführt werden. Bitte später erneut versuchen — ohne Prüfung kein Mandat annehmen.",
      },
    };
  }
}

async function executeTimeEntry(
  ctx: { headers: Record<string, string> },
  params: z.infer<typeof timeEntrySchema>
): Promise<ToolResponse> {
  try {
    const safeDescription = sanitizeUserInput(params.description);
    const path = params.case_slug.split("/").map(encodeURIComponent).join("/");
    const caseRes = await fetch(`${ENGINE_URL}/api/pages/${path}`, {
      headers: ctx.headers,
      signal: AbortSignal.timeout(10_000),
    });
    let caseTitle = params.case_slug;
    if (caseRes.ok) {
      const caseData = (await caseRes.json()) as { title: string };
      caseTitle = caseData.title;
    }

    const entry = {
      slug: `time/${params.case_slug.split("/").pop()}-${Date.now().toString(36)}`,
      title: `Zeiteintrag: ${safeDescription}`,
      type: "time_entry",
      content: `# Zeiteintrag\n\n- **Akte:** ${caseTitle}\n- **Beschreibung:** ${safeDescription}\n- **Stunden:** ${params.hours ?? "—"}\n- **Aktivität:** ${params.activity_type}\n- **Datum:** ${new Date().toISOString()}\n`,
      frontmatter: {
        case_slug: params.case_slug,
        description: safeDescription,
        hours: params.hours,
        activity_type: params.activity_type,
        date: new Date().toISOString(),
        billable: true,
      },
    };

    const res = await fetch(`${ENGINE_URL}/api/pages`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...ctx.headers },
      body: JSON.stringify(entry),
      signal: AbortSignal.timeout(30_000),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);

    return {
      success: true,
      data: { entry },
      display: {
        kind: "confirmation",
        title: `Zeiteintrag erstellt: ${params.hours ?? "—"}h`,
        message: `${safeDescription} (${params.activity_type}) für ${caseTitle}`,
        items: [
          {
            label: "Akte",
            value: caseTitle,
            href: `/dashboard/cases/${params.case_slug.replace(/^cases\//, "")}`,
          },
          { label: "Stunden", value: params.hours?.toString() ?? "—" },
          { label: "Aktivität", value: params.activity_type },
        ],
      },
    };
  } catch (_err) {
    return {
      success: false,
      error: "Time entry failed",
      display: {
        kind: "confirmation",
        title: "Zeiteintrag fehlgeschlagen",
        message: "Engine nicht erreichbar",
      },
    };
  }
}

async function executeClientUpdate(
  ctx: { headers: Record<string, string> },
  params: z.infer<typeof clientUpdateSchema>
): Promise<ToolResponse> {
  try {
    const path = params.case_slug.split("/").map(encodeURIComponent).join("/");
    const res = await fetch(`${ENGINE_URL}/api/pages/${path}`, {
      headers: ctx.headers,
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const page = (await res.json()) as {
      title: string;
      content: string;
      frontmatter?: Record<string, unknown>;
    };
    const fm = page.frontmatter ?? {};

    const updateTypeMap = {
      status:
        "Erstelle ein Status-Update für den Mandanten: Wo steht die Akte, was wurde gemacht, was kommt als Nächstes.",
      deadline:
        "Erstelle eine Übersicht aller relevanten Fristen für den Mandanten mit klaren Datumsangaben.",
      next_steps: "Erstelle eine Übersicht der nächsten Schritte für den Mandanten mit Zeitrahmen.",
      summary:
        "Erstelle eine umfassende Zusammenfassung der Akte für den Mandanten in verständlicher Sprache.",
    };

    // /api/think streams (SSE); engineThink reads the stream and the final answer.
    const thinkData = await engineThink(ctx.headers, {
      query: `${updateTypeMap[params.update_type]}\n\nAKTE: ${sanitizeUserInput(page.title)}\nMandant: ${sanitizeUserInput(String(fm.client_name ?? "—"))}\n\nDokumentinhalt:\n${sanitizeUserInput(page.content.slice(0, 6000))}`,
      mode: "balanced",
      timeoutMs: 60_000,
    });

    return {
      success: true,
      data: { update: thinkData.answer, case_title: page.title },
      display: {
        kind: "summary",
        title: `Mandanten-Update: ${page.title}`,
        message: thinkData.answer
          ? thinkData.answer.slice(0, 300) + "..."
          : "Kein Update generiert",
        items: [
          {
            label: "Akte",
            value: page.title,
            href: `/dashboard/cases/${params.case_slug.replace(/^cases\//, "")}`,
          },
          { label: "Typ", value: params.update_type },
        ],
      },
    };
  } catch (_err) {
    return {
      success: false,
      error: "Client update failed",
      display: {
        kind: "summary",
        title: "Mandanten-Update fehlgeschlagen",
        message: "Akte nicht gefunden",
      },
    };
  }
}

async function executeMeetingTasks(
  ctx: { headers: Record<string, string> },
  params: z.infer<typeof meetingTasksSchema>
): Promise<ToolResponse> {
  try {
    // /api/think streams (SSE); engineThink reads the stream and the final answer.
    const thinkData = await engineThink(ctx.headers, {
      query: `Analysiere die folgenden Besprechungsnotizen und extrahiere:\n1. Aufgaben (Task) mit Assignee und Due Date falls erwähnt\n2. Entscheidungen\n3. Offene Fragen\n\nFormat als strukturierte Liste.\n\nNotizen:\n${sanitizeUserInput(params.notes.slice(0, 6000))}`,
      mode: "balanced",
      timeoutMs: 60_000,
    });

    return {
      success: true,
      data: { tasks: thinkData.answer },
      display: {
        kind: "summary",
        title: "Besprechungsnotizen analysiert",
        message: thinkData.answer
          ? thinkData.answer.slice(0, 400) + "..."
          : "Keine Aufgaben extrahiert",
        items: params.case_slug
          ? [
              {
                label: "Akte",
                value: params.case_slug,
                href: `/dashboard/cases/${params.case_slug.replace(/^cases\//, "")}`,
              },
            ]
          : [],
      },
    };
  } catch (_err) {
    return {
      success: false,
      error: "Meeting task extraction failed",
      display: {
        kind: "summary",
        title: "Analyse fehlgeschlagen",
        message: "Engine nicht erreichbar",
      },
    };
  }
}

async function executeIntakeCreate(
  ctx: { headers: Record<string, string> },
  params: z.infer<typeof intakeCreateSchema>
): Promise<ToolResponse> {
  const safeClientName = sanitizeUserInput(params.client_name);
  const safeMatterType = sanitizeUserInput(params.matter_type);
  // The conflict check (§ 10 RAO) always runs — the matter is only created
  // through the shared safe path, never directly on the engine.
  const outcome = await createCaseSafely(engineCaseCreateDeps(ctx.headers), {
    title: `${safeClientName} — ${safeMatterType}`,
    slugHint: safeClientName,
    content: `# ${safeClientName} — ${safeMatterType}\n\n## Mandanteninformation\n\n- **Mandant:** ${safeClientName}\n- **Aktenart:** ${safeMatterType}\n- **Jurisdiktion:** ${params.jurisdiction.toUpperCase()}\n- **Dringlichkeit:** ${params.urgency}\n`,
    frontmatter: {
      client_name: safeClientName,
      matter_type: safeMatterType,
      jurisdiction: params.jurisdiction,
      urgency: params.urgency,
      status: "intake",
      created_via: "copilot",
      created_at: new Date().toISOString(),
    },
  });

  if (outcome.status === "created") {
    return {
      success: true,
      data: { case: { slug: outcome.slug }, conflict: { hasConflict: false, matches: [] } },
      display: {
        kind: "confirmation",
        title: `Mandant aufgenommen: ${safeClientName}`,
        href: `/dashboard/cases/${outcome.slug.replace(/^legal\/cases\//, "")}`,
        message: `Akte erstellt: ${safeMatterType} (${params.jurisdiction.toUpperCase()}) | Kollisionsprüfung: ✓ kein blockierender Konflikt`,
        items: [
          { label: "Mandant", value: safeClientName },
          { label: "Aktenart", value: safeMatterType },
          { label: "Dringlichkeit", value: params.urgency },
        ],
      },
    };
  }
  if (outcome.status === "conflict") {
    return {
      success: false,
      error: "conflict_detected",
      data: { conflict: { hasConflict: true, matches: outcome.matches } },
      display: {
        kind: "confirmation",
        title: `⚠️ Interessenkonflikt — keine Akte angelegt`,
        message:
          "Die Kollisionsprüfung hat einen Konflikt gefunden. Bitte über die Mandatsannahme prüfen und nur mit begründeter Freigabe fortfahren.",
        items: outcome.matches.map((m) => ({ label: `⚠️ ${m.name}`, value: m.type })),
      },
    };
  }
  return {
    success: false,
    error: outcome.status === "exists" ? "case_slug_exists" : outcome.code,
    display: {
      kind: "confirmation",
      title: "Mandantsaufnahme fehlgeschlagen",
      message:
        outcome.status === "exists"
          ? "Unter dieser Kennung gibt es bereits eine Akte."
          : outcome.message,
    },
  };
}

async function executeDocumentRequestCreate(
  ctx: { headers: Record<string, string> },
  params: z.infer<typeof documentRequestCreateSchema>
): Promise<ToolResponse> {
  const safeCaseSlug = sanitizeUserInput(params.case_slug);
  const safeItems = params.items?.map((item) => sanitizeUserInput(item)) ?? [];
  const safeMessage = params.message_draft ? sanitizeUserInput(params.message_draft) : undefined;
  const slug = `document-requests/${safeCaseSlug.replace(/^cases\//, "").replace(/[^a-zA-Z0-9_-]+/g, "-")}-${Date.now().toString(36)}`;
  const title = `Dokumentenanfrage: ${safeCaseSlug}`;
  const content = [
    `# ${title}`,
    "",
    "## Angeforderte Unterlagen",
    ...(safeItems.length ? safeItems.map((item) => `- ${item}`) : ["- Unterlagen bitte ergänzen"]),
    "",
    safeMessage ? `## Nachricht\n\n${safeMessage}` : "",
  ].join("\n");
  const res = await fetch(`${ENGINE_URL}/api/pages`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...ctx.headers },
    body: JSON.stringify({
      slug,
      title,
      type: "document_request",
      content,
      frontmatter: {
        case_slug: safeCaseSlug,
        status: "draft",
        channel: params.channel,
        items: safeItems,
        message_draft: safeMessage,
        created_at: new Date().toISOString(),
      },
    }),
    signal: AbortSignal.timeout(30_000),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return {
    success: true,
    data: { slug, items: safeItems },
    display: {
      kind: "confirmation",
      title: "Dokumentenanfrage erstellt",
      href: "/dashboard/document-requests",
      message: `${safeItems.length || 1} Unterlage(n) als Entwurf angelegt.`,
      items: [
        {
          label: "Akte",
          value: safeCaseSlug,
          href: `/dashboard/cases/${safeCaseSlug.replace(/^cases\//, "")}`,
        },
        ...safeItems.map((item) => ({ label: "Unterlage", value: item })),
      ],
    },
  };
}

async function executePrecedentSearch(
  ctx: { headers: Record<string, string> },
  params: z.infer<typeof precedentSearchToolSchema>
): Promise<ToolResponse> {
  const res = await fetch(`${ENGINE_URL}/api/legal/precedent-search`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...ctx.headers },
    body: JSON.stringify({ ...params, query: sanitizeUserInput(params.query), limit: 10 }),
    signal: AbortSignal.timeout(30_000),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = (await res.json()) as { results?: Array<Record<string, unknown>> };
  const results = data.results ?? [];
  return {
    success: true,
    data,
    display: {
      kind: "list",
      title: `${results.length} Präzedenztreffer`,
      href: "/dashboard/research?tab=precedent-search",
      items: results.slice(0, 8).map((item) => ({
        label: String(item.title ?? item.case_title ?? item.slug ?? "Treffer"),
        value: String(item.court ?? item.date ?? item.summary ?? ""),
        href: item.caseRef ? `/dashboard/cases/${String(item.caseRef)}` : undefined,
      })),
    },
  };
}

async function executeTranslateText(
  ctx: { headers: Record<string, string> },
  params: z.infer<typeof translateTextToolSchema>
): Promise<ToolResponse> {
  const res = await fetch(`${ENGINE_URL}/api/legal/translate`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...ctx.headers },
    body: JSON.stringify({
      ...params,
      text: params.text ? sanitizeUserInput(params.text) : undefined,
      legal_terminology: true,
      preserve_formatting: true,
    }),
    signal: AbortSignal.timeout(30_000),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = (await res.json()) as { translated_text?: string; translation?: string };
  const translated = data.translated_text ?? data.translation ?? "";
  return {
    success: true,
    data,
    display: {
      kind: "summary",
      title: `Übersetzung nach ${params.target_language}`,
      href: "/dashboard/translate",
      message: translated
        ? `${translated.slice(0, 400)}${translated.length > 400 ? "..." : ""}`
        : "Übersetzung abgeschlossen.",
    },
  };
}

async function executeObligationExtract(
  ctx: { headers: Record<string, string> },
  params: z.infer<typeof obligationExtractToolSchema>
): Promise<ToolResponse> {
  const res = await fetch(`${ENGINE_URL}/api/legal/obligation-extract`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...ctx.headers },
    body: JSON.stringify({
      ...params,
      text: params.text ? sanitizeUserInput(params.text) : undefined,
    }),
    signal: AbortSignal.timeout(30_000),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = (await res.json()) as { obligations?: Array<Record<string, unknown>> };
  const obligations = data.obligations ?? [];
  return {
    success: true,
    data,
    display: {
      kind: "list",
      title: `${obligations.length} Pflichten extrahiert`,
      href: "/dashboard/obligation-tracking",
      items: obligations.slice(0, 10).map((item) => ({
        label: String(item.title ?? item.obligation ?? item.description ?? "Pflicht"),
        value: String(item.due_date ?? item.party ?? item.risk ?? ""),
      })),
    },
  };
}

async function executeTabularReview(
  ctx: { headers: Record<string, string> },
  params: z.infer<typeof tabularReviewToolSchema>
): Promise<ToolResponse> {
  const res = await fetch(`${ENGINE_URL}/api/legal/tabular-review`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...ctx.headers },
    body: JSON.stringify(params),
    signal: AbortSignal.timeout(30_000),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = await res.json();
  return {
    success: true,
    data,
    display: {
      kind: "summary",
      title: "Massenreview abgeschlossen",
      href: "/dashboard/tabular-review",
      message: `${params.questions.length} Frage(n) geprüft.`,
    },
  };
}

async function executeDeepAnalysis(
  ctx: { headers: Record<string, string> },
  params: z.infer<typeof deepAnalysisToolSchema>
): Promise<ToolResponse> {
  try {
    const res = await fetch(`${ENGINE_URL}/api/legal/deep-analysis`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...ctx.headers },
      body: JSON.stringify({
        slugs: params.slugs,
        prompt: params.prompt,
        jurisdiction: params.jurisdiction,
      }),
      signal: AbortSignal.timeout(120_000),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = (await res.json()) as { summary?: string; findings?: unknown[] };
    return {
      success: true,
      data,
      display: {
        kind: "summary",
        title: "Tiefenanalyse abgeschlossen",
        message: data.summary?.slice(0, 400) ?? "Analyse durchgeführt",
        items: params.slugs.map((s) => ({
          label: "Dokument",
          value: s,
          href: `/dashboard/brain/${encodeURIComponent(s)}`,
        })),
      },
    };
  } catch (_err) {
    return {
      success: false,
      error: "Deep analysis failed",
      display: {
        kind: "summary",
        title: "Tiefenanalyse fehlgeschlagen",
        message: "Engine nicht erreichbar",
      },
    };
  }
}

async function executeCaseInvestigation(
  ctx: { headers: Record<string, string> },
  params: z.infer<typeof caseInvestigationToolSchema>
): Promise<ToolResponse> {
  try {
    const res = await fetch(`${ENGINE_URL}/api/legal/case-investigation`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...ctx.headers },
      body: JSON.stringify({
        case_slug: params.case_slug,
        pruefauftrag: params.pruefauftrag,
        jurisdiction: params.jurisdiction,
        incremental: params.incremental,
      }),
      signal: AbortSignal.timeout(280_000),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = (await res.json()) as {
      run_id?: string;
      contradictions?: Array<{ severity?: string; category?: string }>;
      evidence_gaps?: unknown[];
      claims_count?: number;
    };
    const runId = data.run_id ?? "";
    const contradictionCount = data.contradictions?.length ?? 0;
    const gapCount = data.evidence_gaps?.length ?? 0;
    return {
      success: true,
      data,
      display: {
        kind: "summary",
        title: "Sachverhaltsprüfung abgeschlossen",
        message: `${data.claims_count ?? 0} Behauptungen geprüft · ${contradictionCount} Widersprüche · ${gapCount} Beweislücken`,
        href: runId
          ? `/dashboard/cases/${encodeURIComponent(params.case_slug)}/investigation/${encodeURIComponent(runId)}`
          : undefined,
      },
    };
  } catch (_err) {
    return {
      success: false,
      error: "Case investigation failed",
      display: {
        kind: "summary",
        title: "Sachverhaltsprüfung fehlgeschlagen",
        message: "Engine nicht erreichbar. Bitte später erneut versuchen.",
      },
    };
  }
}

async function executeSendEmail(
  ctx: {
    headers: Record<string, string>;
    brainId: string;
    user: { id: string; role: string; brainId: string };
  },
  params: z.infer<typeof sendEmailToolSchema>
): Promise<ToolResponse> {
  try {
    const safeSubject = sanitizeUserInput(params.subject);
    const safeText = sanitizeUserInput(params.text);
    const recipients = Array.isArray(params.to) ? params.to : [params.to];
    const ccRecipients = params.cc
      ? Array.isArray(params.cc)
        ? params.cc
        : [params.cc]
      : undefined;

    const draft = buildMailDraft({
      to: recipients.length === 1 ? recipients[0] : recipients,
      cc: ccRecipients,
      subject: safeSubject,
      text: safeText,
    });
    const message = await sendMailboxMessage({ userId: ctx.user.id, brainId: ctx.brainId }, draft);
    const sent = message.status === "sent";

    return {
      success: true,
      data: { messageId: message.id, status: message.status },
      display: {
        kind: "confirmation",
        title: sent ? "E-Mail gesendet" : "E-Mail in Warteschlange",
        message: sent
          ? `E-Mail an ${recipients.join(", ")} wurde versendet.`
          : "E-Mail-Provider nicht konfiguriert — Inhalt wurde protokolliert.",
        items: [
          { label: "Betreff", value: safeSubject },
          { label: "Empfänger", value: recipients.join(", ") },
          ...(ccRecipients ? [{ label: "CC", value: ccRecipients.join(", ") }] : []),
          ...(params.case_slug
            ? [
                {
                  label: "Akte",
                  value: params.case_slug,
                  href: `/dashboard/cases/${params.case_slug.replace(/^cases\//, "")}`,
                },
              ]
            : []),
        ],
      },
    };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : "Send failed",
      display: {
        kind: "confirmation",
        title: "E-Mail-Versand fehlgeschlagen",
        message: err instanceof Error ? err.message : "Unbekannter Fehler",
      },
    };
  }
}

// ── Client Lookup: Combined case + deadline search + summary ───────────

async function executeClientLookup(
  ctx: { headers: Record<string, string> },
  params: z.infer<typeof clientLookupSchema>
): Promise<ToolResponse> {
  try {
    // 1. Search cases by query
    const caseParams = new URLSearchParams();
    caseParams.set("type", "legal_case");
    caseParams.set("q", params.query);
    caseParams.set("limit", "5");
    const caseRes = await fetch(`${ENGINE_URL}/api/pages?${caseParams.toString()}`, {
      headers: ctx.headers,
      signal: AbortSignal.timeout(30_000),
    });
    if (!caseRes.ok) throw new Error(`HTTP ${caseRes.status}`);
    const cases = (await caseRes.json()) as Array<{
      slug: string;
      title: string;
      frontmatter?: Record<string, unknown>;
    }>;

    if (cases.length === 0) {
      return {
        success: true,
        data: { cases: [], deadlines: [] },
        display: {
          kind: "client_overview",
          title: `Keine Akten für "${params.query}" gefunden`,
          message: "Keine passende Akte gefunden. Bitte Namen oder Schlagwort prüfen.",
        },
      };
    }

    // Use first matching case (most relevant)
    const casePage = cases[0];
    const caseFm = casePage.frontmatter ?? {};
    const caseSlug = casePage.slug;

    // 2. Search deadlines for this case
    let deadlineItems: Array<NonNullable<ReturnType<typeof buildDeadlineItem>>> = [];
    if (params.include_deadlines) {
      const dlParams = new URLSearchParams();
      dlParams.set("type", "deadline");
      dlParams.set("q", caseSlug);
      dlParams.set("limit", "20");
      const dlRes = await fetch(`${ENGINE_URL}/api/pages?${dlParams.toString()}`, {
        headers: ctx.headers,
        signal: AbortSignal.timeout(30_000),
      });
      if (dlRes.ok) {
        const dlPages = (await dlRes.json()) as Array<{
          slug: string;
          title: string;
          frontmatter?: Record<string, unknown>;
        }>;
        const now = new Date();
        now.setUTCHours(0, 0, 0, 0);
        deadlineItems = dlPages
          .map((p) => buildDeadlineItem(p, now))
          .filter((item): item is NonNullable<typeof item> => item !== null);

        // Filter by requested deadline_status
        if (params.deadline_status === "open") {
          deadlineItems = deadlineItems.filter(
            (i) => i.deadlineStatus !== "done" && i.deadlineStatus !== "overdue"
          );
        } else if (params.deadline_status === "critical") {
          deadlineItems = deadlineItems.filter(
            (i) =>
              i.deadlineStatus === "critical" ||
              i.deadlineStatus === "overdue" ||
              i.deadlineStatus === "vorfrist"
          );
        } else if (params.deadline_status === "overdue") {
          deadlineItems = deadlineItems.filter((i) => i.deadlineStatus === "overdue");
        }
        deadlineItems.sort((a, b) => (a.daysUntil ?? 9999) - (b.daysUntil ?? 9999));
      }
    }

    // 3. Build summary
    const openDeadlines = deadlineItems.filter((i) => i.deadlineStatus !== "done").length;
    const nextDeadline = deadlineItems.find(
      (i) => i.deadlineStatus !== "done" && (i.daysUntil ?? 9999) >= 0
    );

    // 4. Build filter href
    const filterParams = new URLSearchParams();
    filterParams.set("case", caseSlug);
    if (params.deadline_status === "critical") filterParams.set("status", "critical");
    else if (params.deadline_status === "overdue") filterParams.set("status", "overdue");
    const filterHref = `/dashboard/deadlines?${filterParams.toString()}`;

    return {
      success: true,
      data: { case: casePage, deadlines: deadlineItems },
      display: {
        kind: "client_overview",
        title: `Mandantenübersicht: ${casePage.title}`,
        items: deadlineItems,
        filterHref,
        summary: {
          caseTitle: casePage.title,
          caseSlug,
          caseStatus: (caseFm.status as string) ?? undefined,
          openDeadlines,
          totalDeadlines: deadlineItems.length,
          nextDeadlineDate: nextDeadline?.dueDate,
        },
        message: deadlineItems.length === 0 ? "Keine offenen Fristen für diese Akte." : undefined,
      },
    };
  } catch (_err) {
    return {
      success: false,
      error: "Client lookup failed",
      display: {
        kind: "client_overview",
        title: "Mandantensuche fehlgeschlagen",
        message: "Engine nicht erreichbar",
      },
    };
  }
}

// Helper to build a rich deadline item from a page
function buildDeadlineItem(
  p: { slug: string; title: string; frontmatter?: Record<string, unknown> },
  now: Date
) {
  const fm = p.frontmatter ?? {};
  const dueStr = (fm.due_date || fm.date) as string | undefined;
  if (!dueStr) return null;
  const due = new Date(dueStr);
  due.setUTCHours(0, 0, 0, 0);
  const diff = due.getTime() - now.getTime();
  const days = Math.ceil(diff / (1000 * 60 * 60 * 24));

  let status: string;
  if (fm.status === "done") {
    status = "done";
  } else if (days < 0) {
    status = "overdue";
  } else if (days <= 3) {
    status = "critical";
  } else if (days <= 7) {
    status = "warning";
  } else if (fm.vorfrist_date) {
    const vf = new Date(fm.vorfrist_date as string);
    vf.setUTCHours(0, 0, 0, 0);
    status = vf.getTime() <= now.getTime() ? "vorfrist" : "pending";
  } else {
    status = "pending";
  }

  const caseSlug = (fm.case_slug as string) ?? undefined;
  const isNotfrist = Boolean(fm.notfrist || fm.is_notfrist);
  const isVorfrist = Boolean(fm.vorfrist_date);
  const needsSecondCheck = Boolean(fm.needs_second_check || (isNotfrist && fm.status !== "done"));

  return {
    label: p.title,
    value: dueStr,
    href: caseSlug
      ? `/dashboard/cases/${caseSlug.replace(/^cases\//, "")}?tab=deadlines`
      : "/dashboard/deadlines",
    deadlineStatus: status,
    daysUntil: days,
    dueDate: dueStr,
    caseTitle: (fm.case_title as string) ?? undefined,
    caseSlug,
    isNotfrist,
    isVorfrist,
    needsSecondCheck,
    deadlineSlug: p.slug,
  };
}

// ── Search Tasks (AP5) ────────────────────────────────────────────────

async function executeSearchTasks(
  ctx: { headers: Record<string, string> },
  params: z.infer<typeof searchTasksSchema>
): Promise<ToolResponse> {
  try {
    const urlParams = new URLSearchParams();
    urlParams.set("type", "legal_task");
    urlParams.set("limit", String(params.limit));
    if (params.case_slug) urlParams.set("q", params.case_slug);
    const res = await fetch(`${ENGINE_URL}/api/pages?${urlParams.toString()}`, {
      headers: ctx.headers,
      signal: AbortSignal.timeout(20_000),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const pages = (await res.json()) as Array<{
      slug: string;
      title: string;
      frontmatter?: Record<string, unknown>;
    }>;

    const now = new Date();
    now.setUTCHours(0, 0, 0, 0);

    const items = pages
      .map((p) => {
        const fm = p.frontmatter ?? {};
        const done = fm.done === true || String(fm.status ?? "").toLowerCase() === "done";
        const priority = (fm.priority as string) ?? "medium";
        const dueStr = (fm.due_date as string) ?? (fm.date as string) ?? undefined;
        let daysUntil: number | undefined;
        if (dueStr) {
          const due = new Date(dueStr);
          due.setUTCHours(0, 0, 0, 0);
          daysUntil = Math.ceil((due.getTime() - now.getTime()) / 86_400_000);
        }
        return {
          label: p.title,
          href: `/dashboard/tasks`,
          priority: priority as "low" | "medium" | "high" | "critical",
          dueDate: dueStr,
          daysUntil,
          caseTitle: (fm.case_title as string) ?? undefined,
          caseSlug: (fm.case_slug as string) ?? undefined,
          done,
          taskSlug: p.slug,
        };
      })
      .filter((item) => {
        if (params.status === "open") return !item.done;
        if (params.status === "done") return item.done;
        return true;
      })
      .filter((item) => {
        if (params.priority === "all") return true;
        return item.priority === params.priority;
      })
      .sort((a, b) => {
        const pOrder = { critical: 0, high: 1, medium: 2, low: 3 };
        return (pOrder[a.priority] ?? 2) - (pOrder[b.priority] ?? 2);
      });

    const statusLabel =
      params.status === "open" ? "offene" : params.status === "done" ? "erledigte" : "alle";

    return {
      success: true,
      data: items,
      display: {
        kind: "task_cards",
        title: `${items.length} ${statusLabel} Aufgaben`,
        items,
        filterHref: `/dashboard/tasks`,
        message: items.length === 0 ? `Keine ${statusLabel} Aufgaben gefunden.` : undefined,
      },
    };
  } catch (_err) {
    return {
      success: false,
      error: "Tasks search failed",
      display: {
        kind: "task_cards",
        title: "Aufgaben-Suche fehlgeschlagen",
        message: "Engine nicht erreichbar",
      },
    };
  }
}

// ── Search Calendar (AP3) ──────────────────────────────────────────────

async function executeSearchCalendar(
  ctx: { headers: Record<string, string> },
  params: z.infer<typeof searchCalendarSchema>
): Promise<ToolResponse> {
  try {
    const urlParams = new URLSearchParams();
    urlParams.set("type", "calendar_event");
    urlParams.set("limit", String(params.limit));
    if (params.case_slug) urlParams.set("q", params.case_slug);
    const res = await fetch(`${ENGINE_URL}/api/pages?${urlParams.toString()}`, {
      headers: ctx.headers,
      signal: AbortSignal.timeout(20_000),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const pages = (await res.json()) as Array<{
      slug: string;
      title: string;
      frontmatter?: Record<string, unknown>;
    }>;

    const now = new Date();
    now.setUTCHours(0, 0, 0, 0);
    let rangeEnd: Date;
    if (params.range === "today") {
      rangeEnd = new Date(now);
      rangeEnd.setDate(rangeEnd.getDate() + 1);
    } else if (params.range === "month") {
      rangeEnd = new Date(now);
      rangeEnd.setDate(rangeEnd.getDate() + 30);
    } else {
      rangeEnd = new Date(now);
      rangeEnd.setDate(rangeEnd.getDate() + 7);
    }

    const items = pages
      .map((p) => {
        const fm = p.frontmatter ?? {};
        const dateStr =
          (fm.start_date as string) ?? (fm.date as string) ?? (fm.due_date as string) ?? undefined;
        if (!dateStr) return null;
        const eventDate = new Date(dateStr);
        if (Number.isNaN(eventDate.getTime())) return null;
        const eventDay = new Date(eventDate);
        eventDay.setUTCHours(0, 0, 0, 0);
        if (eventDay < now || eventDay > rangeEnd) return null;
        return {
          label: p.title,
          startTime: (fm.start_time as string) ?? dateStr,
          endTime: (fm.end_time as string) ?? undefined,
          date: dateStr,
          eventType: ((fm.event_type as string) ?? (fm.type as string) ?? "other") as
            | "hearing"
            | "appointment"
            | "deadline"
            | "meeting"
            | "other",
          caseTitle: (fm.case_title as string) ?? undefined,
          caseSlug: (fm.case_slug as string) ?? undefined,
          location: (fm.location as string) ?? undefined,
          href: (fm.case_slug as string)
            ? `/dashboard/cases/${String(fm.case_slug).replace(/^cases\//, "")}`
            : "/dashboard/calendar",
        };
      })
      .filter((item): item is NonNullable<typeof item> => item !== null)
      .sort(
        (a, b) => new Date(a.startTime ?? "").getTime() - new Date(b.startTime ?? "").getTime()
      );

    const rangeLabel =
      params.range === "today"
        ? "heute"
        : params.range === "month"
          ? "diesen Monat"
          : "diese Woche";

    return {
      success: true,
      data: items,
      display: {
        kind: "calendar_cards",
        title: `${items.length} Termine ${rangeLabel}`,
        items,
        filterHref: "/dashboard/calendar",
        message: items.length === 0 ? `Keine Termine ${rangeLabel} gefunden.` : undefined,
      },
    };
  } catch (_err) {
    return {
      success: false,
      error: "Calendar search failed",
      display: {
        kind: "calendar_cards",
        title: "Kalender-Suche fehlgeschlagen",
        message: "Engine nicht erreichbar",
      },
    };
  }
}

// ── Deadline Mark Done ─────────────────────────────────────────────────

async function executeDeadlineMarkDone(
  ctx: { headers: Record<string, string> },
  params: z.infer<typeof deadlineMarkDoneSchema>
): Promise<ToolResponse> {
  try {
    // Update the deadline page frontmatter via engine
    const res = await fetch(`${ENGINE_URL}/api/pages/${encodeURIComponent(params.deadline_slug)}`, {
      method: "PATCH",
      headers: {
        ...ctx.headers,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        frontmatter: { status: "done", done_at: new Date().toISOString() },
      }),
      signal: AbortSignal.timeout(15_000),
    });

    if (!res.ok) {
      // Fallback: try to at least confirm
      return {
        success: false,
        error: `HTTP ${res.status}`,
        display: {
          kind: "confirmation",
          title: "Frist konnte nicht markiert werden",
          message:
            "Engine hat den Status nicht aktualisiert. Bitte auf der Fristenseite manuell erledigen.",
        },
      };
    }

    return {
      success: true,
      data: { slug: params.deadline_slug, status: "done" },
      display: {
        kind: "confirmation",
        title: "Frist als erledigt markiert",
        message: `Frist "${params.deadline_slug}" wurde als erledigt markiert.`,
        href: "/dashboard/deadlines",
      },
    };
  } catch (_err) {
    return {
      success: false,
      error: "Mark done failed",
      display: {
        kind: "confirmation",
        title: "Aktion fehlgeschlagen",
        message: "Engine nicht erreichbar. Bitte später erneut versuchen.",
      },
    };
  }
}

async function fetchCasePage(
  headers: Record<string, string>,
  caseSlug: string
): Promise<{
  slug: string;
  title: string;
  content: string;
  frontmatter?: Record<string, unknown>;
} | null> {
  const path = caseSlug.split("/").map(encodeURIComponent).join("/");
  const res = await fetch(`${ENGINE_URL}/api/pages/${path}`, {
    headers,
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) return null;
  return res.json();
}

async function executeCreateTask(
  ctx: { headers: Record<string, string> },
  params: z.infer<typeof createTaskSchema>
): Promise<ToolResponse> {
  try {
    const page = await fetchCasePage(ctx.headers, params.case_slug);
    if (!page) {
      return {
        success: false,
        error: "case_not_found",
        display: {
          kind: "confirmation",
          title: "Akte nicht gefunden",
          message: `"${params.case_slug}" wurde nicht gefunden.`,
        },
      };
    }
    const safeTitle = sanitizeUserInput(params.title);
    const fm = (page.frontmatter ?? {}) as { tasks?: TaskEntry[] };
    const current = Array.isArray(fm.tasks) ? fm.tasks : [];
    // dueDate isn't on the TaskEntry type (nothing writes a structured task
    // due date today, though dashboard/tasks/page.tsx already reads
    // task.dueDate for sorting and the overdue badge — it just never had
    // anything to read). Embedding the date in `text` only, as the WhatsApp
    // task intent already does, makes it dead text the dashboard can't sort
    // or flag on — write both so this tool's dates are actually usable.
    const toAgent = params.assignee_type === "agent";
    const task: TaskEntry & { source?: string } = {
      id: randomUUID(),
      text: safeTitle,
      done: false,
      createdAt: new Date().toISOString(),
      source: "copilot",
      dueDate: params.due_date || undefined,
      ...(toAgent ? { assigneeType: "agent" as const, agentStatus: "pending" as const } : {}),
    };
    const res = await enginePatchPage(ctx.headers, {
      slug: page.slug,
      frontmatter: { tasks: [...current, task] },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return {
      success: true,
      data: { task },
      display: {
        kind: "confirmation",
        title: `Aufgabe angelegt: ${safeTitle}`,
        href: `/dashboard/cases/${page.slug.replace(/^cases\//, "")}`,
        message: toAgent
          ? `Der KI-Agent bearbeitet die Aufgabe mit Aktenkontext — das Ergebnis kommt zur anwaltlichen Prüfung zurück.`
          : `Aufgabe wurde zur Akte "${page.title}" hinzugefügt.`,
      },
    };
  } catch (_err) {
    return {
      success: false,
      error: "Create task failed",
      display: {
        kind: "confirmation",
        title: "Aufgabe konnte nicht angelegt werden",
        message: "Engine nicht erreichbar.",
      },
    };
  }
}

async function executeCreateDeadline(
  ctx: { headers: Record<string, string> },
  params: z.infer<typeof createDeadlineSchema>
): Promise<ToolResponse> {
  try {
    const page = await fetchCasePage(ctx.headers, params.case_slug);
    if (!page) {
      return {
        success: false,
        error: "case_not_found",
        display: {
          kind: "confirmation",
          title: "Akte nicht gefunden",
          message: `"${params.case_slug}" wurde nicht gefunden.`,
        },
      };
    }
    const safeTitle = sanitizeUserInput(params.title);
    const fm = (page.frontmatter ?? {}) as { deadlines?: DeadlineEntry[] };
    const current = Array.isArray(fm.deadlines) ? fm.deadlines : [];
    // AI-proposed deadlines start unreviewed — same human-in-the-loop bar as
    // every other deadline source (docs/AUDIT_KI_AGENTEN_PIPELINE_2026-09-19.md):
    // this tool call itself already needed the lawyer's explicit confirmation
    // in the chat UI, and the deadline still shows as needing review afterwards.
    const deadline: DeadlineEntry = {
      id: randomUUID(),
      title: safeTitle,
      description: safeTitle,
      due_date: params.due_date,
      status: "pending",
      type: "deadline",
      source: "copilot",
      review_status: "unreviewed",
      created_at: new Date().toISOString(),
    };
    const res = await enginePatchPage(ctx.headers, {
      slug: page.slug,
      frontmatter: { deadlines: [...current, deadline] },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return {
      success: true,
      data: { deadline },
      display: {
        kind: "confirmation",
        title: `Frist angelegt: ${safeTitle}`,
        href: "/dashboard/deadlines",
        message: `Frist "${safeTitle}" (${params.due_date}) wurde zur Akte "${page.title}" hinzugefügt — bitte fachlich prüfen.`,
      },
    };
  } catch (_err) {
    return {
      success: false,
      error: "Create deadline failed",
      display: {
        kind: "confirmation",
        title: "Frist konnte nicht angelegt werden",
        message: "Engine nicht erreichbar.",
      },
    };
  }
}

async function executeCreateContact(
  ctx: { headers: Record<string, string> },
  params: z.infer<typeof createContactSchema>
): Promise<ToolResponse> {
  try {
    const safeName = sanitizeUserInput(params.name);
    // Same page shape the Kontakte dashboard writes (dashboard/contacts/page.tsx)
    // — a different type here ("client" is a tempting but wrong name, used by
    // the older WhatsApp create_client path) means the contact never shows up
    // in that list. contactSlugFor is the same slug scheme case-contacts.ts
    // already uses for contacts created from the matter wizard.
    const slug = contactSlugFor(safeName);
    const body = {
      slug,
      title: safeName,
      type: "legal_contact",
      content: "",
      frontmatter: {
        type: "legal_contact",
        role: params.role,
        name: safeName,
        company: params.company ? sanitizeUserInput(params.company) : undefined,
        email: params.email || undefined,
        phone: params.phone || undefined,
      },
    };
    const res = await fetch(`${ENGINE_URL}/api/pages`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...ctx.headers },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return {
      success: true,
      data: { slug },
      display: {
        kind: "confirmation",
        title: `Kontakt angelegt: ${safeName}`,
        href: "/dashboard/contacts",
        message: `Kontakt "${safeName}" wurde angelegt.`,
      },
    };
  } catch (_err) {
    return {
      success: false,
      error: "Create contact failed",
      display: {
        kind: "confirmation",
        title: "Kontakt konnte nicht angelegt werden",
        message: "Engine nicht erreichbar.",
      },
    };
  }
}

async function executeRequestSignature(
  ctx: { headers: Record<string, string> },
  params: z.infer<typeof requestSignatureSchema>
): Promise<ToolResponse> {
  try {
    const safeDocName = sanitizeUserInput(params.document_name);
    const safeRecipientName = sanitizeUserInput(params.recipient_name);
    const now = new Date();
    const slug = `legal/signatures/${now.toISOString().split("T")[0]}-${safeDocName
      .toLowerCase()
      .replace(/[^a-z0-9äöüß]+/g, "-")
      .slice(0, 60)}`;
    const expiresAt = new Date(Date.now() + params.expires_days * 86400000).toISOString();
    // Same shape SignatureQuickCreateDialog writes — status "draft": this
    // creates the request, it does not send anything. The Copilot is
    // deliberately never given a send step here, same as email_draft; a
    // lawyer opens the Signatur page and picks WhatsApp/E-Mail/link there.
    const content =
      params.template === "nda"
        ? buildNdaTemplate({ recipientName: safeRecipientName })
        : `Empfänger: ${safeRecipientName} <${params.recipient_email || ""}>`;
    const body = {
      slug,
      title: `Signatur: ${safeDocName}`,
      type: "signature_request",
      content,
      frontmatter: {
        type: "signature_request",
        document_name: safeDocName,
        recipient_name: safeRecipientName,
        recipient_email: params.recipient_email || undefined,
        status: "draft",
        expires_at: expiresAt,
        created_at: now.toISOString(),
        provider: params.template === "nda" ? "template" : "external",
        case_slug: params.case_slug,
      },
    };
    const res = await fetch(`${ENGINE_URL}/api/pages`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...ctx.headers },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return {
      success: true,
      data: { slug },
      display: {
        kind: "confirmation",
        title: `Signaturanfrage erstellt: ${safeDocName}`,
        href: "/dashboard/signature",
        message: `Entwurf für "${safeDocName}" an ${safeRecipientName} wurde angelegt. Zum Versenden im Signaturbereich öffnen und Kanal wählen.`,
      },
    };
  } catch (_err) {
    return {
      success: false,
      error: "Request signature failed",
      display: {
        kind: "confirmation",
        title: "Signaturanfrage fehlgeschlagen",
        message: "Engine nicht erreichbar.",
      },
    };
  }
}

/**
 * WP-5.23 — Vorlage rendern: findet eine `legal_template`-Seite per
 * Titel/Slug, befüllt `{{platzhalter}}` mit Akten- + Kanzleidaten plus
 * manuellen Werten und legt das Ergebnis optional als Dokument ab.
 */
async function executeRenderTemplate(
  ctx: { headers: Record<string, string>; brainId: string },
  params: z.infer<typeof renderTemplateSchema>
): Promise<ToolResponse> {
  const fail = (error: string, title: string, message: string): ToolResponse => ({
    success: false,
    error,
    display: { kind: "confirmation", title, message },
  });
  try {
    // Cursor-paginated: a bare /api/pages call is capped at 100 rows.
    const templates = await listEnginePages(ctx.headers, "legal_template", 10_000, {
      strict: true,
      timeoutMs: 30_000,
    });
    const q = params.template_query.trim().toLowerCase();
    const template =
      templates.find((t) => t.slug.toLowerCase() === q || t.title.toLowerCase() === q) ??
      templates.find((t) => t.slug.toLowerCase().includes(q) || t.title.toLowerCase().includes(q));
    if (!template) {
      return fail(
        "template_not_found",
        "Vorlage nicht gefunden",
        `Keine Vorlage passt auf „${params.template_query}“. Verfügbar: ${templates
          .slice(0, 5)
          .map((t) => t.title)
          .join(", ")}${templates.length > 5 ? " …" : ""}`
      );
    }

    const body = template.content ?? "";
    const keys = extractVariableKeys(body);

    // Akte + Kanzlei-Einstellungen für die automatische Auflösung laden.
    const fetchPage = async (slug: string) => {
      const res = await fetch(`${ENGINE_URL}/api/pages/${encodeURIComponent(slug)}`, {
        headers: ctx.headers,
        signal: AbortSignal.timeout(15_000),
      });
      return res.ok
        ? ((await res.json()) as { frontmatter?: Record<string, unknown>; title?: string })
        : null;
    };
    const [casePage, kanzleiPage] = await Promise.all([
      params.case_slug ? fetchPage(params.case_slug) : Promise.resolve(null),
      fetchPage(KANZLEI_SETTINGS_SLUG),
    ]);
    const known = resolveKnownVariables(
      casePage
        ? {
            ...(casePage.frontmatter as CaseFrontmatter),
            title: casePage.title,
            slug: params.case_slug,
          }
        : null,
      (kanzleiPage?.frontmatter ?? null) as KanzleiSettings | null
    );
    const values = { ...known, ...(params.values ?? {}) };
    const filled = fillTemplate(body, values);
    const unfilled = keys.filter((k) => values[k] === undefined || values[k]?.trim() === "");

    let documentSlug: string | undefined;
    if (params.create_document) {
      documentSlug = `legal/documents/${randomUUID()}`;
      const res = await fetch(`${ENGINE_URL}/api/pages`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...ctx.headers },
        body: JSON.stringify({
          slug: documentSlug,
          title: `${template.title} (aus Vorlage)`,
          type: "document",
          content: filled,
          frontmatter: {
            type: "document",
            source: "template",
            template_slug: template.slug,
            ...(params.case_slug ? { case_slug: params.case_slug } : {}),
            unfilled_variables: unfilled,
            created_at: new Date().toISOString(),
          },
        }),
        signal: AbortSignal.timeout(15_000),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
    }

    return {
      success: true,
      data: {
        template: template.title,
        templateSlug: template.slug,
        filled,
        unfilledVariables: unfilled,
        documentSlug,
      },
      display: {
        kind: "confirmation",
        title: `Vorlage gerendert: ${template.title}`,
        ...(documentSlug ? { href: brainPageHref(documentSlug) } : {}),
        message:
          unfilled.length > 0
            ? `Offene Platzhalter: ${unfilled.join(", ")} — bitte manuell ergänzen.`
            : documentSlug
              ? "Als Dokument in der Akte abgelegt."
              : "Alle Platzhalter befüllt.",
      },
    };
  } catch {
    return fail(
      "render_failed",
      "Vorlage konnte nicht gerendert werden",
      "Engine nicht erreichbar."
    );
  }
}

/**
 * WP-5.23 — Registerabfrage über den Register-Adapter. Ohne konfigurierten
 * Partner-Endpunkt (REGISTER_*_ENDPOINT) antwortet das Tool mit einem
 * sauberen "nicht konfiguriert"-Status statt erfundener Daten.
 */
async function executeRegisterLookup(
  ctx: { headers: Record<string, string> },
  params: z.infer<typeof registerLookupSchema>
): Promise<ToolResponse> {
  try {
    const kinds = params.register
      ? [params.register]
      : (Object.keys(REGISTER_LABEL) as RegisterKind[]);
    const configured: { kind: RegisterKind; entries: RegisterEntry[] }[] = [];
    const unconfigured: string[] = [];
    const unreachable: string[] = [];

    for (const kind of kinds) {
      const endpoint = env(`REGISTER_${kind.toUpperCase()}_ENDPOINT`);
      if (!endpoint) {
        unconfigured.push(REGISTER_LABEL[kind]);
        continue;
      }
      const adapter = resolveRegisterAdapter(kind, {
        endpoint,
        apiKey: env(`REGISTER_${kind.toUpperCase()}_API_KEY`),
      });
      try {
        const entries = await adapter.search({
          query: params.query,
          registerNumber: params.register_number,
          court: params.court,
          limit: params.limit,
        });
        configured.push({ kind, entries });
      } catch {
        unreachable.push(REGISTER_LABEL[kind]);
      }
    }

    const total = configured.reduce((n, c) => n + c.entries.length, 0);
    return {
      success: true,
      data: {
        results: configured.flatMap((c) => c.entries),
        registersSearched: configured.map((c) => REGISTER_LABEL[c.kind]),
        registersUnconfigured: unconfigured,
        registersUnreachable: unreachable,
      },
      display: {
        kind: "list",
        title: `${total} Register-Treffer`,
        items: configured.flatMap((c) =>
          c.entries.map((e) => ({
            label: e.name,
            value: [e.registerNumber, e.court, e.status].filter(Boolean).join(" · "),
          }))
        ),
        message:
          unconfigured.length > 0
            ? `Nicht konfiguriert (Partnerzugang fehlt): ${unconfigured.join(", ")}`
            : unreachable.length > 0
              ? `Nicht erreichbar: ${unreachable.join(", ")}`
              : undefined,
      },
    };
  } catch {
    return {
      success: false,
      error: "register_lookup_failed",
      display: {
        kind: "list",
        title: "Registerabfrage fehlgeschlagen",
        message: "Die Registerabfrage ist derzeit nicht verfügbar.",
      },
    };
  }
}

/**
 * WP-5.23 — Rechnungsentwurf aus der Akte: sammelt unbilled billable
 * time_entries (oder explizite Positionen), reserviert eine fortlaufende
 * Rechnungsnummer (GoBD), legt den Entwurf als `invoice`-Page an und
 * markiert die verrechneten Zeiteinträge — identisch zum Dialog-Pfad in
 * InvoiceQuickCreateDialog, damit die FiBu-Sichten konsistent bleiben.
 */
async function executeInvoiceDraft(
  ctx: { headers: Record<string, string>; brainId: string },
  params: z.infer<typeof invoiceDraftSchema>
): Promise<ToolResponse> {
  const fail = (error: string, title: string, message: string): ToolResponse => ({
    success: false,
    error,
    display: { kind: "confirmation", title, message },
  });
  try {
    const [page, kanzleiRes] = await Promise.all([
      fetchCasePage(ctx.headers, params.case_slug),
      fetch(`${ENGINE_URL}/api/pages/${encodeURIComponent(KANZLEI_SETTINGS_SLUG)}`, {
        headers: ctx.headers,
        signal: AbortSignal.timeout(10_000),
      }).catch(() => null),
    ]);
    if (!page) {
      return fail(
        "case_not_found",
        "Akte nicht gefunden",
        `"${params.case_slug}" wurde nicht gefunden.`
      );
    }
    const kanzlei = kanzleiRes?.ok
      ? (((await kanzleiRes.json()) as { frontmatter?: KanzleiSettings }).frontmatter ?? null)
      : null;
    const fm = (page.frontmatter ?? {}) as CaseFrontmatter & { time_entries?: TimeEntry[] };

    const stundensatz = Number.parseFloat(kanzlei?.stundensatz ?? "") || 0;
    const billedEntryIds: string[] = [];
    // `include_unbilled_time` must see BOTH stores: the matter's
    // time_entries array AND standalone `time_entry` pages the timer
    // created for this case — otherwise timer time is invisible to the
    // copilot invoice draft.
    let unbilledEntries: TimeEntryWithCase[] = [];
    if (!params.items?.length && params.include_unbilled_time) {
      const brain = createServerBrainClient(ctx.headers);
      const all = await listAllTimeEntries(brain).catch(() => null);
      // Matter-embedded entries carry no case_slug of their own — they are
      // this matter's array by definition, so tag them on the way in.
      const embedded: TimeEntryWithCase[] = (fm.time_entries ?? []).map((e) => ({
        ...e,
        case_slug: params.case_slug,
      }));
      unbilledEntries = (all ?? embedded).filter(
        (e) => e.case_slug === params.case_slug && e.billable !== false && !e.billed
      );
    }
    const items = params.items?.length
      ? params.items.map((i) => {
          const amount =
            i.amount ?? Math.round((i.hours ?? 0) * (i.rate ?? stundensatz) * 100) / 100;
          return {
            description: sanitizeUserInput(i.description),
            date: new Date().toISOString().split("T")[0],
            hours: i.hours ?? 0,
            rate: i.rate ?? stundensatz,
            amount,
          };
        })
      : params.include_unbilled_time
        ? unbilledEntries.map((e) => {
            billedEntryIds.push(e.id);
            const hours = e.minutes / 60;
            const rate = e.rate ?? stundensatz;
            return {
              description: sanitizeUserInput(e.description),
              date: (e.date ?? "").split("T")[0],
              hours: Math.round(hours * 100) / 100,
              rate,
              amount: Math.round(hours * rate * 100) / 100,
            };
          })
        : [];

    if (items.length === 0) {
      return fail(
        "no_billable_items",
        "Keine verrechenbaren Leistungen",
        `In der Akte "${page.title}" gibt es keine offenen verrechenbaren Zeiteinträge — Positionen können als items-Parameter übergeben werden.`
      );
    }

    const subtotal = Math.round(items.reduce((s, i) => s + i.amount, 0) * 100) / 100;
    const vatRate = vatRateFor(kanzlei);
    const tax = Math.round(subtotal * vatRate * 100) / 100;
    const total = Math.round((subtotal + tax) * 100) / 100;
    const paymentDays = Math.max(1, parseInt(kanzlei?.zahlungszielTage || "14", 10) || 14);

    let existing: string[] = [];
    try {
      const pages = await listEnginePages(ctx.headers, "invoice", 50_000);
      existing = pages.map((p) => String(p.frontmatter?.invoice_number ?? ""));
    } catch {
      // Der Zähler garantiert Eindeutigkeit auch ohne Bestandsliste.
    }
    const year = new Date().getFullYear();
    const invoiceNumber = await allocateInvoiceNumber(
      ctx.brainId,
      year,
      highestInvoiceNumber(existing, year)
    );

    const now = new Date();
    const invoice = {
      id: `invoice/${now.getTime()}`,
      number: invoiceNumber,
      client: fm.client_name ?? "",
      clientSlug: fm.client_slug,
      caseNumber: fm.case_number ?? page.slug,
      date: now.toISOString().split("T")[0],
      dueDate: new Date(now.getTime() + paymentDays * 86_400_000).toISOString().split("T")[0],
      items,
      status: "draft" as const,
      subtotal,
      vatRate,
      tax,
      total,
      paymentTerms: `${paymentDays} Tage netto`,
      bank: { name: kanzlei?.bankName, iban: kanzlei?.iban, bic: kanzlei?.bic },
      notes:
        params.notes?.trim() ||
        `Rechnungsentwurf zur Akte ${fm.case_number ?? page.title} (via Copilot — bitte prüfen)`,
    };
    const hash = await sha256Hex(invoiceContentString(invoice));

    // Reserve the time entries for this number first, then write the invoice
    // (one helper, shared with /api/invoices). If another invoice took some
    // of them meanwhile, nothing is created — no second invoice over the
    // same work.
    const outcome = await createInvoiceReservingEntries(
      ctx.headers,
      createServerBrainClient(ctx.headers),
      {
        slug: invoice.id,
        title: `Rechnung ${invoice.number}`,
        caseSlug: page.slug,
        invoiceNumber: invoice.number,
        timeEntryIds: billedEntryIds,
        expenseIds: [],
        frontmatter: {
          invoice_number: invoice.number,
          client: invoice.client,
          client_slug: invoice.clientSlug,
          case_number: invoice.caseNumber,
          case_slugs: [params.case_slug],
          date: invoice.date,
          due_date: invoice.dueDate,
          items: invoice.items,
          time_entry_ids: billedEntryIds,
          status: "draft",
          subtotal: invoice.subtotal,
          vat_rate: invoice.vatRate,
          tax: invoice.tax,
          total: invoice.total,
          payment_terms: invoice.paymentTerms,
          bank: invoice.bank,
          notes: invoice.notes,
          invoice_type: "standard",
          source: "copilot",
          ...gobdFrontmatter(hash, now),
        },
      }
    );
    if (outcome.kind === "conflict") {
      return fail(
        "entries_already_billed",
        "Leistungen bereits abgerechnet",
        `Einige Zeiteinträge der Akte "${page.title}" wurden inzwischen abgerechnet — es wurde kein Rechnungsentwurf angelegt. Bitte erneut versuchen.`
      );
    }
    if (outcome.kind === "create_failed") throw new Error(`HTTP ${outcome.status}`);

    return {
      success: true,
      data: { invoiceNumber, total, slug: invoice.id, billedEntries: billedEntryIds.length },
      display: {
        kind: "confirmation",
        title: `Rechnungsentwurf ${invoice.number}`,
        href: INVOICING_HREF,
        message: `Entwurf über ${total.toFixed(2)} € (inkl. ${vatRate * 100} % USt) zur Akte "${page.title}" angelegt — bitte prüfen und versenden.`,
      },
    };
  } catch (err) {
    log.error(
      "[copilot/tools] invoice_draft failed:",
      err instanceof Error ? err.message : String(err)
    );
    return fail(
      "invoice_draft_failed",
      "Rechnungsentwurf fehlgeschlagen",
      "Engine nicht erreichbar."
    );
  }
}

/**
 * WP-7.43 — Magic Builder: der Copilot übersetzt den natürlichsprachlichen
 * Wunsch („wenn eine Rechnung überfällig ist, Mail an die Buchhaltung")
 * in eine Regel des einen Regelmodells (`automation`-Seiten — dieselben,
 * die /dashboard/workflows anzeigt und cron/automations ausführt). Wie in
 * der Oberfläche: der Nutzer wird Besitzer, die Regel reagiert erst auf
 * Ereignisse ab jetzt.
 */
async function executeCreateAutomationRule(
  ctx: { headers: Record<string, string>; brainId: string; user: { id: string } },
  params: z.infer<typeof createAutomationRuleSchema>
): Promise<ToolResponse> {
  const fail = (error: string, message: string): ToolResponse => ({
    success: false,
    error,
    display: { kind: "confirmation", title: "Regel konnte nicht angelegt werden", message },
  });
  const raw = params.actions ?? (params.action ? [params.action] : []);
  const actions: AutomationAction[] = raw.map((a) => ({
    type: a.type,
    ...(a.title ? { title: sanitizeUserInput(a.title) } : {}),
    ...(a.message ? { message: sanitizeUserInput(a.message) } : {}),
    ...(a.assignee ? { assignee: sanitizeUserInput(a.assignee) } : {}),
    ...(a.due_in_days !== undefined ? { due_in_days: a.due_in_days } : {}),
    ...(a.workflow_template_id ? { workflow_template_id: a.workflow_template_id } : {}),
    ...(a.recipient ? { recipient: a.recipient.trim() } : {}),
    ...(a.status ? { status: a.status.trim() } : {}),
  }));
  // Semantische Mindestvalidierung — die Aktion braucht ihre Pflichtfelder.
  const invalid = validateActions(actions);
  if (invalid) {
    return fail(actions.length === 0 ? "action_required" : "invalid_action", invalid);
  }
  try {
    const rule = buildNewAutomationRule(
      {
        name: sanitizeUserInput(params.name),
        event: params.event,
        filters: params.filters,
        within_days: params.within_days,
        actions,
      },
      // Runs with this user's matter access (see cron/automations).
      { userId: ctx.user.id, label: `copilot:${ctx.user.id}` }
    );
    const ok = await saveAutomation(ctx, rule);
    if (!ok) throw new Error("save failed");
    return {
      success: true,
      data: { slug: rule.slug, name: rule.name },
      display: {
        kind: "confirmation",
        title: `Automatisierung aktiv: ${rule.name}`,
        href: "/dashboard/workflows",
        message: `${describeRule(rule)} — reagiert auf Ereignisse ab jetzt.`,
      },
    };
  } catch {
    return fail("save_failed", "Engine nicht erreichbar.");
  }
}

async function executeOrganizeDocuments(
  ctx: { headers: Record<string, string>; brainId: string },
  params: z.infer<typeof organizeDocumentsSchema>
): Promise<ToolResponse> {
  const fail = (error: string, message: string): ToolResponse => ({
    success: false,
    error,
    display: { kind: "confirmation", title: "Einordnung fehlgeschlagen", message },
  });

  try {
    const caseRes = await fetch(`${ENGINE_URL}/api/pages/${encodeURIComponent(params.case_slug)}`, {
      headers: ctx.headers,
      signal: AbortSignal.timeout(10_000),
    });
    if (!caseRes.ok) {
      return fail("case_not_found", `Akte '${params.case_slug}' nicht gefunden.`);
    }
    const casePage = (await caseRes.json()) as {
      frontmatter?: { documents?: DocumentEntry[] };
    };
    const docs = (casePage.frontmatter?.documents ?? []).filter((d) => d.slug || d.url);
    if (docs.length === 0) {
      return {
        success: true,
        data: { assigned: 0 },
        display: {
          kind: "confirmation",
          title: "Keine Dokumente",
          message: "In dieser Akte sind keine Dokumente vorhanden.",
        },
      };
    }

    // Ordner-Stand der Doc-Pages laden (für only_unsorted/overwrite-Logik).
    const folders = new Map<string, string>();
    await mapWithConcurrency(
      docs.slice(0, 100),
      async (d) => {
        const key = d.slug || d.url!;
        try {
          const res = await fetch(`${ENGINE_URL}/api/pages/${encodeURIComponent(key)}`, {
            headers: ctx.headers,
            signal: AbortSignal.timeout(8_000),
          });
          if (!res.ok) return;
          const page = (await res.json()) as { frontmatter?: Record<string, unknown> };
          const folder = page.frontmatter?.folder;
          if (typeof folder === "string" && folder.trim()) folders.set(key, folder.trim());
        } catch {
          // einzelne Doc-Pages sind best-effort
        }
      },
      6
    );

    const vaultDocs = docs.map((d) => ({
      key: d.slug || d.url!,
      name: d.name,
      doc_type: d.doc_type,
      kind: d.kind,
      source: d.source,
      mime_type: d.mime_type,
      folder: folders.get(d.slug || d.url!),
    }));
    const plan = planVaultOrganization(vaultDocs, {
      onlyUnsorted: params.only_unsorted,
      overwrite: params.overwrite,
    });

    if (plan.length === 0) {
      return {
        success: true,
        data: { assigned: 0, total: docs.length },
        display: {
          kind: "confirmation",
          title: "Alles eingeordnet",
          message: params.only_unsorted
            ? "Alle Dokumente sind bereits zugeordnet oder nicht eindeutig zuordenbar."
            : "Keine Einordnung möglich — die Dokumente liefern keine eindeutigen Signale.",
        },
      };
    }

    let applied = 0;
    await mapWithConcurrency(
      plan,
      async (a) => {
        try {
          const res = await enginePatchPage(ctx.headers, {
            slug: a.key,
            frontmatter: { folder: a.folder },
          });
          if (res.ok) applied += 1;
        } catch {
          // einzelner Patch schlägt fehl — Rest läuft weiter
        }
      },
      4
    );

    const byFolder = plan.reduce<Record<string, number>>((acc, a) => {
      acc[a.folder] = (acc[a.folder] ?? 0) + 1;
      return acc;
    }, {});
    const summary = Object.entries(byFolder)
      .map(([f, n]) => `${f}: ${n}`)
      .join(", ");

    return {
      success: applied > 0,
      data: { assigned: applied, planned: plan.length, total: docs.length },
      display: {
        kind: "confirmation",
        title: `Vault eingeordnet: ${applied}/${plan.length} Dokumente`,
        href: `/dashboard/cases/${encodeURIComponent(params.case_slug)}`,
        message: summary,
      },
    };
  } catch (err) {
    return fail(
      "organize_failed",
      err instanceof Error ? err.message : "Einordnung fehlgeschlagen."
    );
  }
}

// ── GET: List available tools for current user (Agent Conditionals) ──

export const GET = createHandler(
  {
    action: "copilot.tool",
    rateTier: "standard",
  },
  async (ctx) => {
    const condCtx: ToolConditionContext = {
      role: ctx.user.role,
      features: {
        deepAnalysis: true,
        caseInvestigation: true,
        precedentSearch: true,
      },
    };
    const tools = getToolList(condCtx);
    return apiSuccess({ tools, total: tools.length });
  }
);

// ── Route Handler ─────────────────────────────────────────────────────

/**
 * What an AI tool costs, the same as its dedicated route (deep-analysis and
 * case-investigation: subsumption; tabular-review and summaries:
 * document_analysis). Lookups and navigation are free.
 */
const TOOL_CREDITS: Partial<Record<z.infer<typeof toolSchema>["tool"], CreditOperation>> = {
  deep_analysis: "subsumption",
  case_investigation: "subsumption",
  tabular_review: "document_analysis",
  document_summary: "document_analysis",
  obligation_extract: "document_analysis",
  deadline_extract: "deadline_detect",
  email_draft: "think",
  client_update: "think",
  meeting_tasks: "think",
  translate_text: "think",
  precedent_search: "think",
};

export const POST = createHandler(
  {
    action: "copilot.tool",
    rateTier: "standard",
    body: toolSchema,
    audit: (ctx, body) => ({
      action: "query.submit" as const,
      entityType: "copilot_tool",
      entityId: body.tool,
      details: { tool: body.tool, params: body.params },
    }),
  },
  async (ctx, body, _query, _req) => {
    // Agent Conditionals: check tool availability before execution. Matter
    // tools need a matter: the call carries it as case_slug.
    const caseParam = body.params.case_slug;
    const condCtx: ToolConditionContext = {
      role: ctx.user.role,
      hasCaseContext: typeof caseParam === "string" && caseParam.trim().length > 0,
      features: {
        deepAnalysis: true,
        caseInvestigation: true,
        precedentSearch: true,
      },
    };
    if (!isToolAvailable(body.tool, condCtx)) {
      return apiError(
        "forbidden",
        `Tool "${body.tool}" is not available for your role or context`,
        403
      );
    }
    // Actions that change data or send something run only with a token the
    // server issued for exactly these parameters (lib/copilot-confirmation.ts).
    if (CONFIRMED_TOOLS.has(body.tool)) {
      if (body.mode === "prepare") {
        const { token, expiresAt } = createToolConfirmation(ctx.user.id, body.tool, body.params);
        return apiSuccess({ confirmation: token, expires_at: expiresAt, params: body.params });
      }
      const check = consumeToolConfirmation(body.confirmation, ctx.user.id, body.tool, body.params);
      if (!check.ok) {
        return apiError(
          "confirmation_required",
          check.reason === "expired"
            ? "Die Bestätigung ist abgelaufen. Bitte die Aktion erneut bestätigen."
            : "Diese Aktion braucht Ihre Bestätigung.",
          403
        );
      }
    } else if (body.mode === "prepare") {
      return apiError("invalid_mode", "Diese Aktion braucht keine Bestätigung.", 400);
    }
    const creditOp = TOOL_CREDITS[body.tool];
    if (creditOp && CREDIT_COSTS[creditOp] > 0 && env("SUBSUMIO_E2E") !== "1") {
      await ensureTrialCredits(ctx.billing.ownerId, ctx.billing.ownerType);
      const credit = await checkCredits(
        ctx.billing.ownerId,
        ctx.billing.ownerType,
        CREDIT_COSTS[creditOp]
      );
      if (!credit.ok) return insufficientCreditsResponse(credit.balance, credit.required);
    }
    try {
      let result: ToolResponse;
      switch (body.tool) {
        case "navigate": {
          const params = navigateSchema.parse(body.params);
          result = await executeNavigate(params);
          break;
        }
        case "search_cases": {
          const params = searchCasesSchema.parse(body.params);
          result = await executeSearchCases(ctx, params);
          break;
        }
        case "search_deadlines": {
          const params = searchDeadlinesSchema.parse(body.params);
          result = await executeSearchDeadlines(ctx, params);
          break;
        }
        case "search_knowledge": {
          const params = searchKnowledgeSchema.parse(body.params);
          result = await executeSearchKnowledge(ctx, params);
          break;
        }
        case "create_case": {
          const params = createCaseSchema.parse(body.params);
          result = await executeCreateCase(ctx, params);
          break;
        }
        case "case_summary": {
          const params = caseSummarySchema.parse(body.params);
          result = await executeCaseSummary(ctx, params);
          break;
        }
        case "email_draft": {
          const params = emailDraftSchema.parse(body.params);
          result = await executeEmailDraft(ctx, params);
          break;
        }
        case "deadline_extract": {
          const params = deadlineExtractSchema.parse(body.params);
          result = await executeDeadlineExtract(ctx, params);
          break;
        }
        case "document_summary": {
          const params = documentSummarySchema.parse(body.params);
          result = await executeDocumentSummary(ctx, params);
          break;
        }
        case "conflict_check": {
          const params = conflictCheckSchema.parse(body.params);
          result = await executeConflictCheck(ctx, params);
          break;
        }
        case "time_entry": {
          const params = timeEntrySchema.parse(body.params);
          result = await executeTimeEntry(ctx, params);
          break;
        }
        case "client_update": {
          const params = clientUpdateSchema.parse(body.params);
          result = await executeClientUpdate(ctx, params);
          break;
        }
        case "meeting_tasks": {
          const params = meetingTasksSchema.parse(body.params);
          result = await executeMeetingTasks(ctx, params);
          break;
        }
        case "intake_create": {
          const params = intakeCreateSchema.parse(body.params);
          result = await executeIntakeCreate(ctx, params);
          break;
        }
        case "document_request_create": {
          const params = documentRequestCreateSchema.parse(body.params);
          result = await executeDocumentRequestCreate(ctx, params);
          break;
        }
        case "precedent_search": {
          const params = precedentSearchToolSchema.parse(body.params);
          result = await executePrecedentSearch(ctx, params);
          break;
        }
        case "translate_text": {
          const params = translateTextToolSchema.parse(body.params);
          result = await executeTranslateText(ctx, params);
          break;
        }
        case "obligation_extract": {
          const params = obligationExtractToolSchema.parse(body.params);
          result = await executeObligationExtract(ctx, params);
          break;
        }
        case "tabular_review": {
          const params = tabularReviewToolSchema.parse(body.params);
          result = await executeTabularReview(ctx, params);
          break;
        }
        case "deep_analysis": {
          const params = deepAnalysisToolSchema.parse(body.params);
          result = await executeDeepAnalysis(ctx, params);
          break;
        }
        case "case_investigation": {
          const params = caseInvestigationToolSchema.parse(body.params);
          result = await executeCaseInvestigation(ctx, params);
          break;
        }
        case "send_email": {
          const params = sendEmailToolSchema.parse(body.params);
          result = await executeSendEmail(ctx, params);
          break;
        }
        case "client_lookup": {
          const params = clientLookupSchema.parse(body.params);
          result = await executeClientLookup(ctx, params);
          break;
        }
        case "deadline_mark_done": {
          const params = deadlineMarkDoneSchema.parse(body.params);
          result = await executeDeadlineMarkDone(ctx, params);
          break;
        }
        case "create_task": {
          const params = createTaskSchema.parse(body.params);
          result = await executeCreateTask(ctx, params);
          break;
        }
        case "create_deadline": {
          const params = createDeadlineSchema.parse(body.params);
          result = await executeCreateDeadline(ctx, params);
          break;
        }
        case "create_contact": {
          const params = createContactSchema.parse(body.params);
          result = await executeCreateContact(ctx, params);
          break;
        }
        case "request_signature": {
          const params = requestSignatureSchema.parse(body.params);
          result = await executeRequestSignature(ctx, params);
          break;
        }
        case "search_tasks": {
          const params = searchTasksSchema.parse(body.params);
          result = await executeSearchTasks(ctx, params);
          break;
        }
        case "search_calendar": {
          const params = searchCalendarSchema.parse(body.params);
          result = await executeSearchCalendar(ctx, params);
          break;
        }
        case "render_template": {
          const params = renderTemplateSchema.parse(body.params);
          result = await executeRenderTemplate(ctx, params);
          break;
        }
        case "register_lookup": {
          const params = registerLookupSchema.parse(body.params);
          result = await executeRegisterLookup(ctx, params);
          break;
        }
        case "create_automation_rule": {
          const params = createAutomationRuleSchema.parse(body.params);
          result = await executeCreateAutomationRule(ctx, params);
          break;
        }
        case "invoice_draft": {
          const params = invoiceDraftSchema.parse(body.params);
          result = await executeInvoiceDraft(ctx, params);
          break;
        }
        case "organize_documents": {
          const params = organizeDocumentsSchema.parse(body.params);
          result = await executeOrganizeDocuments(ctx, params);
          break;
        }
        default:
          return apiError("invalid_tool", `Unknown tool: ${body.tool}`, 400);
      }

      if (
        body.tool === "create_case" &&
        result &&
        typeof result === "object" &&
        "success" in result &&
        result.success
      ) {
        void markOnboardingProgress(ctx.user.id, { firstCase: true });
      }
      if (creditOp && result.success) {
        void recordCreditConsumption(
          ctx,
          creditOp,
          typeof caseParam === "string" ? caseParam : undefined
        );
      }

      return Response.json(result);
    } catch (err) {
      if (err instanceof z.ZodError) {
        return apiError("invalid_params", JSON.stringify(err.issues), 400);
      }
      log.error(
        "[copilot/tools] execution failed:",
        err instanceof Error ? err.message : String(err)
      );
      return apiError("tool_execution_failed", "Tool-Ausführung fehlgeschlagen", 500);
    }
  }
);
