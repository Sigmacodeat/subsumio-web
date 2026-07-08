import { z } from "zod";
import { sanitizeUserInput } from "@/lib/prompt-sanitizer";
import { ENGINE_URL } from "@/lib/engine";
import { createHandler, apiSuccess, apiError } from "@/lib/api-handler";
import { calculateRvg } from "@/lib/rvg";
import { isToolAvailable, getToolList, type ToolConditionContext } from "@/lib/agent-conditionals";
import { sendMailboxMessage, buildMailDraft } from "@/lib/email/mailbox";

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
  "/dashboard/bea",
  "/dashboard/billing",
  "/dashboard/brain",
  "/dashboard/calendar-export",
  "/dashboard/case-scanner",
  "/dashboard/cases",
  "/dashboard/cases/new",
  "/dashboard/chat",
  "/dashboard/chat/analytics",
  "/dashboard/chat/compare",
  "/dashboard/clause-library",
  "/dashboard/client-portal",
  "/dashboard/compliance",
  "/dashboard/compliance/retention",
  "/dashboard/connectors",
  "/dashboard/contacts",
  "/dashboard/contracts",
  "/dashboard/controlling",
  "/dashboard/cost-calculator",
  "/dashboard/data-export",
  "/dashboard/datev-export",
  "/dashboard/deadlines",
  "/dashboard/deep-analysis",
  "/dashboard/document-requests",
  "/dashboard/drafting",
  "/dashboard/email-import",
  "/dashboard/experience",
  "/dashboard/graph",
  "/dashboard/import-kanzlei",
  "/dashboard/intake",
  "/dashboard/invoicing",
  "/dashboard/judgements-sync",
  "/dashboard/kollisionspruefung",
  "/dashboard/mobile",
  "/dashboard/monitoring",
  "/dashboard/obligation-tracking",
  "/dashboard/onboarding",
  "/dashboard/opponents",
  "/dashboard/playbooks",
  "/dashboard/process-strategy",
  "/dashboard/rag-eval",
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
  jurisdiction: z.enum(["de", "at", "ch"]).default("de"),
  urgency: z.enum(["low", "medium", "high", "critical"]).default("medium"),
  conflict_check: z.boolean().default(true),
});

const rvgCalculateSchema = z.object({
  streitwert: z
    .union([z.number(), z.string()])
    .transform((v) => (typeof v === "string" ? parseFloat(v) : v)),
});

const documentRequestCreateSchema = z.object({
  case_slug: z.string().min(1).max(200),
  items: z.array(z.string().min(1).max(160)).max(50).optional(),
  message_draft: z.string().max(5000).optional(),
  channel: z.enum(["whatsapp", "portal", "email", "manual"]).default("portal"),
});

const precedentSearchToolSchema = z.object({
  query: z.string().min(1).max(2000),
  jurisdiction: z.enum(["at", "de", "ch"]).optional(),
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
    jurisdiction: z.enum(["at", "de", "ch", "all"]).default("all"),
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
  jurisdiction: z.enum(["at", "de", "ch", "all"]).default("all"),
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
    "rvg_calculate",
    "document_request_create",
    "precedent_search",
    "translate_text",
    "obligation_extract",
    "tabular_review",
    "deep_analysis",
    "send_email",
    "client_lookup",
    "deadline_mark_done",
  ]),
  params: z.record(z.unknown()).default({}),
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
  try {
    const safeTitle = sanitizeUserInput(params.title);
    const safeClientName = params.client_name ? sanitizeUserInput(params.client_name) : undefined;
    const safeOpponentName = params.opponent_name
      ? sanitizeUserInput(params.opponent_name)
      : undefined;
    const safeCaseType = params.case_type ? sanitizeUserInput(params.case_type) : undefined;
    const slug = `cases/${safeTitle
      .toLowerCase()
      .replace(/ä/g, "ae")
      .replace(/ö/g, "oe")
      .replace(/ü/g, "ue")
      .replace(/ß/g, "ss")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")}-${Date.now().toString(36)}`;
    const body = {
      slug,
      title: safeTitle,
      type: "legal_case",
      content: `# ${safeTitle}\n\n## Akteninformation\n\n- **Mandant:** ${safeClientName ?? "—"}\n- **Gegenseite:** ${safeOpponentName ?? "—"}\n- **Typ:** ${safeCaseType ?? "Zivilrecht"}\n`,
      frontmatter: {
        client_name: safeClientName,
        opponent_name: safeOpponentName,
        case_type: safeCaseType,
        status: "active",
        created_at: new Date().toISOString(),
      },
    };
    const res = await fetch(`${ENGINE_URL}/api/pages`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...ctx.headers },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(30_000),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const result = (await res.json()) as { slug: string };
    return {
      success: true,
      data: result,
      display: {
        kind: "confirmation",
        title: `Akte erstellt: ${safeTitle}`,
        href: `/dashboard/cases/${result.slug.replace(/^cases\//, "")}`,
        message: `Die Akte wurde erfolgreich angelegt. Mandant: ${safeClientName ?? "—"}, Gegenseite: ${safeOpponentName ?? "—"}`,
      },
    };
  } catch (_err) {
    return {
      success: false,
      error: "Create failed",
      display: {
        kind: "confirmation",
        title: "Akte konnte nicht erstellt werden",
        message: "Engine nicht erreichbar",
      },
    };
  }
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
      mode: "balanced",
    };

    const res = await fetch(`${ENGINE_URL}/api/think`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...ctx.headers },
      body: JSON.stringify(draftBody),
      signal: AbortSignal.timeout(30_000),
    });

    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = (await res.json()) as { answer?: string };

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

    const thinkRes = await fetch(`${ENGINE_URL}/api/think`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...ctx.headers },
      body: JSON.stringify({
        query: `Analysiere das folgende Dokument und extrahiere alle Fristen, Termine und Deadlines. Gib jedes als strukturierten Eintrag zurück (Datum, Art, Beschreibung):\n\n${sanitizeUserInput(page.content.slice(0, 8000))}`,
        mode: "balanced",
        signal: AbortSignal.timeout(30_000),
      }),
    });

    if (!thinkRes.ok) throw new Error(`HTTP ${thinkRes.status}`);
    const thinkData = (await thinkRes.json()) as { answer?: string };

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

    const thinkRes = await fetch(`${ENGINE_URL}/api/think`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...ctx.headers },
      body: JSON.stringify({
        query: `Fasse das folgende Dokument in ${params.max_points} Key Points zusammen. Identifiziere kritische Klauseln, Risiken und Handlungsbedarf:\n\n${sanitizeUserInput(page.content.slice(0, 10000))}`,
        mode: "balanced",
        signal: AbortSignal.timeout(30_000),
      }),
    });

    if (!thinkRes.ok) throw new Error(`HTTP ${thinkRes.status}`);
    const thinkData = (await thinkRes.json()) as { answer?: string };

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
  try {
    const safeName = sanitizeUserInput(params.name);
    const res = await fetch(`${ENGINE_URL}/api/legal/conflict-check`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...ctx.headers },
      body: JSON.stringify({ name: safeName }),
      signal: AbortSignal.timeout(30_000),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = (await res.json()) as {
      matches?: Array<{ name: string; slug: string; type: string }>;
    };
    const matches = data.matches ?? [];
    const hasConflict = matches.length > 0;

    return {
      success: true,
      data: { matches, hasConflict },
      display: {
        kind: "confirmation",
        title: hasConflict
          ? `⚠️ Konflikt erkannt für "${safeName}"`
          : `✓ Kein Konflikt für "${safeName}"`,
        message: hasConflict
          ? `${matches.length} Treffer gefunden. Prüfe vor Mandatsannahme.`
          : "Keine Konflikte in der Datenbank gefunden.",
        items: matches.map((m) => ({
          label: m.name,
          value: m.type,
          href: m.slug ? `/dashboard/cases/${m.slug.replace(/^cases\//, "")}` : undefined,
        })),
      },
    };
  } catch (_err) {
    return {
      success: false,
      error: "Conflict check failed",
      display: {
        kind: "confirmation",
        title: "Konfliktprüfung fehlgeschlagen",
        message: "Engine nicht erreichbar",
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

    const thinkRes = await fetch(`${ENGINE_URL}/api/think`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...ctx.headers },
      body: JSON.stringify({
        query: `${updateTypeMap[params.update_type]}\n\nAKTE: ${sanitizeUserInput(page.title)}\nMandant: ${sanitizeUserInput(String(fm.client_name ?? "—"))}\n\nDokumentinhalt:\n${sanitizeUserInput(page.content.slice(0, 6000))}`,
        mode: "balanced",
        signal: AbortSignal.timeout(30_000),
      }),
    });

    if (!thinkRes.ok) throw new Error(`HTTP ${thinkRes.status}`);
    const thinkData = (await thinkRes.json()) as { answer?: string };

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
    const thinkRes = await fetch(`${ENGINE_URL}/api/think`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...ctx.headers },
      body: JSON.stringify({
        query: `Analysiere die folgenden Besprechungsnotizen und extrahiere:\n1. Aufgaben (Task) mit Assignee und Due Date falls erwähnt\n2. Entscheidungen\n3. Offene Fragen\n\nFormat als strukturierte Liste.\n\nNotizen:\n${sanitizeUserInput(params.notes.slice(0, 6000))}`,
        mode: "balanced",
        signal: AbortSignal.timeout(30_000),
      }),
    });

    if (!thinkRes.ok) throw new Error(`HTTP ${thinkRes.status}`);
    const thinkData = (await thinkRes.json()) as { answer?: string };

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
  try {
    const safeClientName = sanitizeUserInput(params.client_name);
    const safeMatterType = sanitizeUserInput(params.matter_type);
    // Step 1: Conflict check if enabled
    let conflictResult:
      | { hasConflict: boolean; matches: Array<{ name: string; slug: string; type: string }> }
      | undefined;
    if (params.conflict_check) {
      try {
        const conflictRes = await fetch(`${ENGINE_URL}/api/legal/conflict-check`, {
          method: "POST",
          headers: { "Content-Type": "application/json", ...ctx.headers },
          body: JSON.stringify({ name: safeClientName }),
          signal: AbortSignal.timeout(30_000),
        });
        if (conflictRes.ok) {
          const conflictData = (await conflictRes.json()) as {
            matches?: Array<{ name: string; slug: string; type: string }>;
          };
          conflictResult = {
            hasConflict: (conflictData.matches?.length ?? 0) > 0,
            matches: conflictData.matches ?? [],
          };
        }
      } catch {
        // Non-blocking: conflict check failure doesn't block intake
      }
    }

    // Step 2: Create case
    const slug = `cases/${safeClientName
      .toLowerCase()
      .replace(/ä/g, "ae")
      .replace(/ö/g, "oe")
      .replace(/ü/g, "ue")
      .replace(/ß/g, "ss")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")}-${Date.now().toString(36)}`;
    const body = {
      slug,
      title: `${safeClientName} — ${safeMatterType}`,
      type: "legal_case",
      content: `# ${safeClientName} — ${safeMatterType}\n\n## Mandanteninformation\n\n- **Mandant:** ${safeClientName}\n- **Aktenart:** ${safeMatterType}\n- **Jurisdiktion:** ${params.jurisdiction.toUpperCase()}\n- **Dringlichkeit:** ${params.urgency}\n- **Erstellt:** ${new Date().toISOString()}\n${conflictResult ? `\n## Konfliktprüfung\n- **Geprüft:** ja\n- **Konflikt:** ${conflictResult.hasConflict ? "⚠️ Ja" : "Nein"}\n${conflictResult.matches.length > 0 ? `- **Treffer:** ${conflictResult.matches.map((m) => m.name).join(", ")}\n` : ""}` : ""}\n`,
      frontmatter: {
        client_name: safeClientName,
        matter_type: safeMatterType,
        jurisdiction: params.jurisdiction,
        urgency: params.urgency,
        status: "intake",
        conflict_checked: params.conflict_check,
        conflict_status: conflictResult?.hasConflict ? "conflict" : "clear",
        created_at: new Date().toISOString(),
      },
    };

    const res = await fetch(`${ENGINE_URL}/api/pages`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...ctx.headers },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(30_000),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const result = (await res.json()) as { slug: string };

    return {
      success: true,
      data: { case: result, conflict: conflictResult },
      display: {
        kind: "confirmation",
        title: `Mandant aufgenommen: ${safeClientName}`,
        href: `/dashboard/cases/${result.slug.replace(/^cases\//, "")}`,
        message: `Akte erstellt: ${safeMatterType} (${params.jurisdiction.toUpperCase()})${conflictResult ? ` | Konfliktprüfung: ${conflictResult.hasConflict ? "⚠️ Konflikt erkannt" : "✓ Kein Konflikt"}` : ""}`,
        items: [
          { label: "Mandant", value: safeClientName },
          { label: "Aktenart", value: safeMatterType },
          { label: "Dringlichkeit", value: params.urgency },
          ...(conflictResult?.matches ?? []).map((m) => ({
            label: `⚠️ Konflikt: ${m.name}`,
            value: m.type,
          })),
        ],
      },
    };
  } catch (_err) {
    return {
      success: false,
      error: "Intake failed",
      display: {
        kind: "confirmation",
        title: "Mandantsaufnahme fehlgeschlagen",
        message: "Engine nicht erreichbar",
      },
    };
  }
}

async function executeRvgCalculate(
  params: z.infer<typeof rvgCalculateSchema>
): Promise<ToolResponse> {
  const result = calculateRvg(params.streitwert);
  return {
    success: true,
    data: result,
    display: {
      kind: "summary",
      title: `RVG-Kosten für ${params.streitwert.toLocaleString("de-DE")} €`,
      href: "/dashboard/cost-calculator",
      items: Object.entries(result)
        .filter(([, value]) => typeof value === "number" || typeof value === "string")
        .slice(0, 8)
        .map(([label, value]) => ({ label, value: String(value) })),
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

async function executeSendEmail(
  ctx: { headers: Record<string, string>; user: { id: string; role: string; brainId: string } },
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
    const message = await sendMailboxMessage(
      {
        id: ctx.user.id,
        role: ctx.user.role as "admin" | "lawyer" | "assistant" | "client_viewer",
        brainId: ctx.user.brainId,
      },
      draft
    );
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
        precedentSearch: true,
      },
    };
    const tools = getToolList(condCtx);
    return apiSuccess({ tools, total: tools.length });
  }
);

// ── Route Handler ─────────────────────────────────────────────────────

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
    // Agent Conditionals: check tool availability before execution
    const condCtx: ToolConditionContext = {
      role: ctx.user.role,
      features: {
        deepAnalysis: true,
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
        case "rvg_calculate": {
          const params = rvgCalculateSchema.parse(body.params);
          result = await executeRvgCalculate(params);
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
        default:
          return apiError("invalid_tool", `Unknown tool: ${body.tool}`, 400);
      }
      return Response.json(result);
    } catch (err) {
      if (err instanceof z.ZodError) {
        return apiError("invalid_params", JSON.stringify(err.issues), 400);
      }
      console.error(
        "[copilot/tools] execution failed:",
        err instanceof Error ? err.message : String(err)
      );
      return apiError("tool_execution_failed", "Tool-Ausführung fehlgeschlagen", 500);
    }
  }
);
