import { z } from "zod";
import { sanitizeUserInput } from "@/lib/prompt-sanitizer";
import { ENGINE_URL } from "@/lib/engine";
import { createHandler, apiError } from "@/lib/api-handler";

// ── Tool Schemas ──────────────────────────────────────────────────────

const navigateSchema = z.object({
  route: z
    .string()
    .min(1)
    .refine((r) => r.startsWith("/dashboard"), "must start with /dashboard"),
});

const searchCasesSchema = z.object({
  query: z.string().min(1),
  limit: z.number().min(1).max(50).default(10),
});

const searchDeadlinesSchema = z.object({
  case_slug: z.string().optional(),
  status: z.enum(["open", "overdue", "all"]).default("open"),
  limit: z.number().min(1).max(50).default(10),
});

const searchKnowledgeSchema = z.object({
  query: z.string().min(1),
  limit: z.number().min(1).max(20).default(5),
});

const createCaseSchema = z.object({
  title: z.string().min(1),
  client_name: z.string().optional(),
  opponent_name: z.string().optional(),
  case_type: z.string().optional(),
});

const caseSummarySchema = z.object({
  case_slug: z.string().min(1),
});

const emailDraftSchema = z.object({
  case_slug: z.string().optional(),
  recipient: z.string().optional(),
  subject: z.string().min(1),
  tone: z.enum(["formal", "neutral", "urgent"]).default("formal"),
  key_points: z.array(z.string()).default([]),
});

const deadlineExtractSchema = z.object({
  document_slug: z.string().min(1),
});

const documentSummarySchema = z.object({
  document_slug: z.string().min(1),
  max_points: z.number().min(3).max(20).default(8),
});

const conflictCheckSchema = z.object({
  name: z.string().min(1),
});

const timeEntrySchema = z.object({
  case_slug: z.string().min(1),
  description: z.string().min(1),
  hours: z.number().min(0.1).max(24).optional(),
  activity_type: z
    .enum(["research", "drafting", "review", "meeting", "correspondence", "other"])
    .default("other"),
});

const clientUpdateSchema = z.object({
  case_slug: z.string().min(1),
  update_type: z.enum(["status", "deadline", "next_steps", "summary"]).default("status"),
});

const meetingTasksSchema = z.object({
  notes: z.string().min(1),
  case_slug: z.string().optional(),
});

const intakeCreateSchema = z.object({
  client_name: z.string().min(1),
  matter_type: z.string().min(1),
  jurisdiction: z.enum(["de", "at", "ch"]).default("de"),
  urgency: z.enum(["low", "medium", "high", "critical"]).default("medium"),
  conflict_check: z.boolean().default(true),
});

const toolSchema = z.object({
  tool: z.enum([
    "navigate",
    "search_cases",
    "search_deadlines",
    "search_knowledge",
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
  ]),
  params: z.record(z.unknown()).default({}),
});

// ── Tool Executors ────────────────────────────────────────────────────

interface ToolResponse {
  success: boolean;
  data?: unknown;
  error?: string;
  display: {
    kind: "navigation" | "list" | "summary" | "confirmation";
    title: string;
    items?: Array<{ label: string; value?: string; href?: string }>;
    href?: string;
    message?: string;
  };
}

async function executeNavigate(params: z.infer<typeof navigateSchema>): Promise<ToolResponse> {
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
  } catch (err) {
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
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const pages = (await res.json()) as Array<{
      slug: string;
      title: string;
      frontmatter?: Record<string, unknown>;
    }>;
    const now = new Date();
    const filtered = pages.filter((p) => {
      if (params.status === "all") return true;
      const dueStr = p.frontmatter?.due_date as string | undefined;
      if (!dueStr) return params.status === "open";
      const due = new Date(dueStr);
      if (params.status === "overdue") return due < now;
      return due >= now;
    });
    return {
      success: true,
      data: filtered,
      display: {
        kind: "list",
        title: `${filtered.length} Fristen (${params.status === "open" ? "offen" : params.status === "overdue" ? "überfällig" : "alle"})`,
        items: filtered.map((p) => ({
          label: p.title,
          value: (p.frontmatter?.due_date as string) ?? "Kein Datum",
          href: p.frontmatter?.case_slug
            ? `/dashboard/cases/${String(p.frontmatter.case_slug).replace(/^cases\//, "")}`
            : "/dashboard/deadlines",
        })),
      },
    };
  } catch (err) {
    return {
      success: false,
      error: "Search failed",
      display: {
        kind: "list",
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
          href: `/dashboard/brain/${r.slug}`,
        })),
      },
    };
  } catch (err) {
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
  } catch (err) {
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
  } catch (err) {
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
      const res = await fetch(`${ENGINE_URL}/api/pages/${path}`, { headers: ctx.headers });
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
  } catch (err) {
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
    const res = await fetch(`${ENGINE_URL}/api/pages/${path}`, { headers: ctx.headers });
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
        items: [{ label: "Dokument", value: page.title, href: `/dashboard/brain/${page.slug}` }],
      },
    };
  } catch (err) {
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
    const res = await fetch(`${ENGINE_URL}/api/pages/${path}`, { headers: ctx.headers });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const page = (await res.json()) as { slug: string; title: string; content: string };

    const thinkRes = await fetch(`${ENGINE_URL}/api/think`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...ctx.headers },
      body: JSON.stringify({
        query: `Fasse das folgende Dokument in ${params.max_points} Key Points zusammen. Identifiziere kritische Klauseln, Risiken und Handlungsbedarf:\n\n${sanitizeUserInput(page.content.slice(0, 10000))}`,
        mode: "balanced",
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
        items: [{ label: "Dokument", value: page.title, href: `/dashboard/brain/${page.slug}` }],
      },
    };
  } catch (err) {
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
          ? `${matches.length} Treffer gefunden. Prüfen Sie vor Mandatsannahme.`
          : "Keine Konflikte in der Datenbank gefunden.",
        items: matches.map((m) => ({
          label: m.name,
          value: m.type,
          href: m.slug ? `/dashboard/cases/${m.slug.replace(/^cases\//, "")}` : undefined,
        })),
      },
    };
  } catch (err) {
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
    const caseRes = await fetch(`${ENGINE_URL}/api/pages/${path}`, { headers: ctx.headers });
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
  } catch (err) {
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
    const res = await fetch(`${ENGINE_URL}/api/pages/${path}`, { headers: ctx.headers });
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
  } catch (err) {
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
  } catch (err) {
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
  } catch (err) {
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
