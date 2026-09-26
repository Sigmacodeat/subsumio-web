import { listPages, think } from "@/lib/engine-client";
import { parseIntent, processIntent, type ParsedIntent } from "@/lib/legal-chat/actions";
import type { BrainPage } from "@/lib/types";
import type { WhatsAppIdentity } from "@/lib/whatsapp/types";
import { phoneHash } from "@/lib/whatsapp/verify";
import { whatsAppEngineScope } from "@/lib/whatsapp/identity";
import { finalizeWhatsAppAiAnswer } from "@/lib/whatsapp/ai-answer";
import { expandRelativeDates, hasRelativeDates } from "@/lib/whatsapp/relative-date";
import { parseIntentWithLLM, isLLMIntentParserAvailable } from "@/lib/whatsapp/llm-intent";
import {
  getConversationState,
  saveConversationState,
  clearConversationState,
  missingFieldsForIntent,
  buildClarifyingQuestion,
  mergePartialIntent,
} from "@/lib/whatsapp/conversation-state";

interface NaturalChatContext {
  sender: WhatsAppIdentity;
  fromPhone: string;
  messageId: string;
  text: string;
}

type ChatIntent =
  | "greeting"
  | "smalltalk"
  | "dashboard_overview"
  | "daily_ops"
  | "legal_research"
  | "general";

interface ConversationMessage {
  role: "user" | "bot";
  text: string;
  timestamp: string;
}

interface DashboardContext {
  cases: Array<{
    slug: string;
    title: string;
    caseNumber: string;
    status: string;
    clientName: string;
    opponentName: string;
    nextDeadline?: string;
    openTasks: number;
  }>;
  openTasks: number;
  openDeadlines: number;
  upcomingAppointments: number;
  totalCases: number;
}

const GREETINGS = [
  /^hallo$/i,
  /^hi$/i,
  /^hey$/i,
  /^guten\s+(morgen|tag|abend|nachmittag)$/i,
  /^servus$/i,
  /^grüß\s*(?:gott|e)$/i,
  /^moin$/i,
];

const SMALLTALK = [
  /^(?:wie\s+geht|wie\s+gehts|was\s+machst|wer\s+bist|was\s+kannst)/i,
  /^(?:danke|vielen\s+dank|super|toll|ok|alles\s+klar|verstanden)$/i,
  /^(?:tschüss|bis\s+dann|auf\s+wiedersehen|cu|ciao)$/i,
];

const DASHBOARD_OVERVIEW = [
  /^(?:was\s+steht\s+an|überblick|dashboard|status|wie\s+sieht|wie\s+steht|was\s+gibt|was\s+ist\s+neu|news|tagesüberblick)/i,
];

// Daily law-firm operations: time, expenses, appointments, tasks, deadlines, clients, documents
const DAILY_OPS_KEYWORDS = [
  /\b(?:zeit|minuten|stunden|std|telefon|auslage|ausgelegt|euro|eur|€|termin|verhandlung|besprechung|aufgabe|todo|frist|deadline|mandant|kunde|klient|dokument|unterlage|akte|aktenzeichen|az|fall)\b/i,
];

// Legal research only: statutes, paragraphs, laws, substantive legal doctrine
const LEGAL_RESEARCH_KEYWORDS = [
  /\b(?:gesetz|paragraph|§|bgb|abgb|zgb|or|stgb|zpo|ao|dsgvo|recht|rechtsgrundlage|judikat|urteil|entscheidung|kommentar|literatur)\b/i,
];

function classifyIntent(text: string): ChatIntent {
  const trimmed = text.trim();
  if (GREETINGS.some((rx) => rx.test(trimmed))) return "greeting";
  if (SMALLTALK.some((rx) => rx.test(trimmed))) return "smalltalk";
  if (DASHBOARD_OVERVIEW.some((rx) => rx.test(trimmed))) return "dashboard_overview";
  if (LEGAL_RESEARCH_KEYWORDS.some((rx) => rx.test(trimmed))) return "legal_research";
  if (DAILY_OPS_KEYWORDS.some((rx) => rx.test(trimmed))) return "daily_ops";
  return "general";
}

function fm(page: BrainPage): Record<string, unknown> {
  return page.frontmatter ?? {};
}

function str(value: unknown): string {
  return typeof value === "string" ? value : "";
}

async function loadConversationHistory(
  brainId: string,
  fromPhone: string,
  limit = 8
): Promise<ConversationMessage[]> {
  try {
    const senderHash = phoneHash(fromPhone);
    const [inbound, outbound] = await Promise.all([
      listPages(brainId, "chat_inbox", 50),
      listPages(brainId, "chat_outbox", 50),
    ]);
    const all = [
      ...inbound.map((page) => ({
        role: "user" as const,
        text: str(page.content).slice(0, 500),
        timestamp: str(fm(page).received_at),
        hash: str(fm(page).from_phone_hash),
      })),
      ...outbound.map((page) => ({
        role: "bot" as const,
        text: str(page.content).slice(0, 500),
        timestamp: str(fm(page).sent_at),
        hash: str(fm(page).to_phone_hash),
      })),
    ]
      .filter((entry) => entry.hash === senderHash && entry.timestamp)
      .sort((a, b) => new Date(a.timestamp || 0).getTime() - new Date(b.timestamp || 0).getTime())
      .slice(-limit)
      .map(({ role, text }) => ({ role, text, timestamp: "" }));
    return all;
  } catch (err) {
    console.warn("[whatsapp-natural-chat] history load failed:", err);
    return [];
  }
}

async function loadDashboardContext(
  brainId: string,
  matterScope?: string[] | "all"
): Promise<DashboardContext> {
  try {
    const cases = await listPages(brainId, "legal_case", 100);
    const accessible =
      matterScope && matterScope !== "all" && Array.isArray(matterScope)
        ? cases.filter((c) => matterScope.includes("all") || matterScope.includes(c.slug))
        : cases;

    const caseSummaries = accessible.slice(0, 20).map((page) => {
      const front = fm(page);
      const deadlines = Array.isArray(front.deadlines)
        ? (front.deadlines as Array<Record<string, unknown>>)
        : [];
      const tasks = Array.isArray(front.tasks)
        ? (front.tasks as Array<Record<string, unknown>>)
        : [];
      const nextDeadline = deadlines
        .filter((d) => d.status !== "done" && d.done !== true)
        .map((d) => str(d.due_date) || str(d.date))
        .filter(Boolean)
        .sort()[0];
      const openTasks = tasks.filter((t) => t.done !== true && t.status !== "done").length;
      return {
        slug: page.slug,
        title: page.title,
        caseNumber: str(front.case_number),
        status: str(front.status) || "aktiv",
        clientName: str(front.client_name),
        opponentName: str(front.opponent_name),
        nextDeadline,
        openTasks,
      };
    });

    const totalOpenTasks = caseSummaries.reduce((sum, c) => sum + c.openTasks, 0);
    const openDeadlines = caseSummaries.filter((c) => c.nextDeadline).length;

    const appointments = await listPages(brainId, "appointment", 100);
    const today = new Date().toISOString().slice(0, 10);
    const upcomingAppointments = appointments.filter((a) => {
      const front = fm(a);
      const date = str(front.date);
      return date >= today && str(front.status) !== "cancelled";
    }).length;

    return {
      cases: caseSummaries,
      openTasks: totalOpenTasks,
      openDeadlines,
      upcomingAppointments,
      totalCases: accessible.length,
    };
  } catch (err) {
    console.warn("[whatsapp-natural-chat] dashboard context failed:", err);
    return {
      cases: [],
      openTasks: 0,
      openDeadlines: 0,
      upcomingAppointments: 0,
      totalCases: 0,
    };
  }
}

function formatHistory(history: ConversationMessage[]): string {
  if (history.length === 0) return "";
  return history.map((h) => `${h.role === "user" ? "Nutzer" : "Subsumio"}: ${h.text}`).join("\n");
}

function formatDashboardContext(ctx: DashboardContext): string {
  if (ctx.totalCases === 0) {
    return "Dashboard: Noch keine Akten angelegt.";
  }
  const parts = [
    `Dashboard-Überblick: ${ctx.totalCases} Akten, ${ctx.openTasks} offene Aufgaben, ${ctx.openDeadlines} offene Fristen, ${ctx.upcomingAppointments} anstehende Termine.`,
  ];
  const activeCases = ctx.cases.filter((c) => c.status !== "closed" && c.status !== "archived");
  if (activeCases.length > 0) {
    parts.push("Aktive Akten:");
    for (const c of activeCases.slice(0, 10)) {
      const line = `• ${c.caseNumber || c.title}: ${c.title}${c.nextDeadline ? ` — nächste Frist ${c.nextDeadline}` : ""}${c.openTasks > 0 ? ` (${c.openTasks} offene Aufgaben)` : ""}`;
      parts.push(line);
    }
  }
  return parts.join("\n");
}

function cleanEngineAnswer(raw: string): string {
  // Remove JSON structure markers if present
  let text = raw.replace(/^\{[\s\S]*?"answer":\s*"/, "").replace(/"\s*,\s*"[\s\S]*\}\s*$/, "");
  // Unescape JSON sequences
  text = text
    .replace(/\\n/g, "\n")
    .replace(/\\"/g, '"')
    .replace(/\\t/g, "\t")
    .replace(/\\\\/g, "\\");
  // Remove markdown headers that the engine emits
  text = text.replace(/^\s*##\s+Answer\s*\n?/gim, "");
  text = text.replace(/^\s*##\s+Gaps?\s*\n?/gim, "");
  text = text.replace(/^\s*##\s+Conflicts?\s*\n?/gim, "");
  text = text.replace(/^\s*---\s*\n?/g, "");
  // Normalize multiple newlines
  text = text.replace(/\n{3,}/g, "\n\n");
  return text.trim();
}

function buildGreeting(sender: WhatsAppIdentity, ctx: DashboardContext): string {
  const hour = new Date().getHours();
  let timeGreeting = "Guten Tag";
  if (hour < 11) timeGreeting = "Guten Morgen";
  else if (hour >= 18) timeGreeting = "Guten Abend";

  const name = sender.name || "Sie";

  let reply = `${timeGreeting}, ${name}. Ich bin Ihr Subsumio-Kanzleiassistent. `;

  if (ctx.totalCases === 0) {
    reply +=
      "Ihre Kanzleiübersicht ist noch leer. Sie können hier Akten, Fristen oder Aufgaben per WhatsApp anlegen.";
  } else if (ctx.openDeadlines > 0 || ctx.openTasks > 0) {
    reply += `Aktuell haben Sie ${ctx.totalCases} Akten, ${ctx.openTasks} offene Aufgaben und ${ctx.openDeadlines} offene Fristen. Wie kann ich Ihnen helfen?`;
  } else {
    reply += `${ctx.totalCases} Akten, keine offenen Fristen oder Aufgaben. Was steht an?`;
  }

  return reply;
}

function buildSmalltalkReply(sender: WhatsAppIdentity, text: string): string {
  const lower = text.toLowerCase();
  if (/danke|vielen dank|super|toll|perfekt/.test(lower)) {
    return "Gerne. Schreiben Sie mir, wenn Sie eine Akteninfo, eine Frist oder einen schnellen Überblick brauchen.";
  }
  if (/tschüss|bis dann|auf wiedersehen|ciao|cu/.test(lower)) {
    return "Auf Wiedersehen. Schreiben Sie mir, wenn Sie wieder etwas benötigen.";
  }
  if (/wie geht|wie gehts/.test(lower)) {
    return "Danke der Nachfrage. Ich helfe Ihnen gern bei Ihren Akten und Recherchen. Womit darf ich beginnen?";
  }
  if (/wer bist|was machst|was kannst/.test(lower)) {
    return `Ich bin der Subsumio-Kanzleiassistent${sender.name ? ` für ${sender.name}` : ""}. Ich helfe Ihnen bei Aktenüberblick, Fristen, Aufgaben, Dokumenten, Rechtsrecherche und Zeiterfassung. Schreiben Sie mir einfach in normaler Sprache.`;
  }
  return "Verstanden. Schreiben Sie mir, was Sie brauchen. Ich sehe in Ihren Akten und in den Gesetzen nach.";
}

function buildDashboardOverviewReply(sender: WhatsAppIdentity, ctx: DashboardContext): string {
  if (ctx.totalCases === 0) {
    return 'Ihre Kanzleiübersicht ist noch leer: keine Akten, Fristen oder Termine. Beginnen Sie mit "neue akte [Mandant] gg. [Gegner]".';
  }

  const parts: string[] = [];
  parts.push(`Ihr Überblick${sender.name ? `, ${sender.name}` : ""}:`);
  parts.push(`\n📁 ${ctx.totalCases} Akten`);
  parts.push(`📋 ${ctx.openTasks} offene Aufgaben`);
  parts.push(`⚖️ ${ctx.openDeadlines} offene Fristen`);
  parts.push(`📅 ${ctx.upcomingAppointments} anstehende Termine\n`);

  const urgent = ctx.cases
    .filter((c) => c.nextDeadline && c.status !== "closed" && c.status !== "archived")
    .sort((a, b) => (a.nextDeadline || "9999").localeCompare(b.nextDeadline || "9999"))
    .slice(0, 5);

  if (urgent.length > 0) {
    parts.push("Nächste Fristen:");
    for (const c of urgent) {
      parts.push(`• ${c.nextDeadline} — ${c.caseNumber || c.title}`);
    }
  }

  parts.push("\nWas möchten Sie als Nächstes tun?");
  return parts.join("\n");
}

/** Extra note for legal research answers; the KI label itself comes from finalizeWhatsAppAiAnswer. */
export function disclaimerNote(intent: ChatIntent): string | undefined {
  if (intent === "legal_research") {
    return "⚖️ Hinweis: Diese Rechts-Recherche ersetzt keine anwaltliche Prüfung. Bitte prüfen Sie alle Rechtsfragen eigenverantwortlich.";
  }
  return undefined;
}

export async function naturalWhatsAppReply(ctx: NaturalChatContext): Promise<string> {
  const intent = classifyIntent(ctx.text);
  const [history, dashboard] = await Promise.all([
    loadConversationHistory(ctx.sender.brainId, ctx.fromPhone),
    loadDashboardContext(ctx.sender.brainId, ctx.sender.matterScope),
  ]);

  // Fast path for pure greetings / smalltalk
  if (intent === "greeting") {
    return buildGreeting(ctx.sender, dashboard);
  }
  if (intent === "smalltalk") {
    return buildSmalltalkReply(ctx.sender, ctx.text);
  }
  if (intent === "dashboard_overview") {
    return buildDashboardOverviewReply(ctx.sender, dashboard);
  }

  // Natural command router: turn everyday language into structured actions and execute them
  if (intent === "daily_ops") {
    const chatCtx = {
      sender: ctx.sender,
      fromPhone: ctx.fromPhone,
      messageId: ctx.messageId,
      text: ctx.text,
    };

    // Step 1: Expand relative dates ("morgen" → "2026-07-14", "freitag" → "2026-07-17")
    const expandedText = hasRelativeDates(ctx.text) ? expandRelativeDates(ctx.text) : ctx.text;

    // Step 2: Check for existing conversation state (multi-step interaction)
    const existingState = await getConversationState(ctx.sender, ctx.fromPhone).catch(() => null);
    if (existingState) {
      // If user sends a clear command (cancel/help/confirm), abort the conversation state
      const trimmed = ctx.text.trim().toLowerCase();
      if (/^(?:nein|no|abbrechen|verwerfen|stopp|stop|abbruch)$/i.test(trimmed)) {
        await clearConversationState(ctx.sender, ctx.fromPhone).catch(() => {});
        return "Verstanden, die Eingabe wurde abgebrochen. Was kann ich sonst für Sie tun?";
      }
      if (/^(?:hilfe|help)$/i.test(trimmed)) {
        await clearConversationState(ctx.sender, ctx.fromPhone).catch(() => {});
        // Fall through to normal help processing
      } else {
        // Try to complete the pending conversation
        const followUpIntent = parseIntent(expandedText);
        const llmIntent =
          followUpIntent.kind === "free_text" && isLLMIntentParserAvailable()
            ? await parseIntentWithLLM(expandedText, ctx.sender.brainId).catch(() => null)
            : null;
        const effectiveIntent = llmIntent ?? followUpIntent;

        const { merged, stillMissing } = mergePartialIntent(existingState, effectiveIntent);

        if (stillMissing.length === 0) {
          // All fields collected — build the complete intent and execute
          await clearConversationState(ctx.sender, ctx.fromPhone).catch(() => {});
          const completeIntent = buildCompleteIntent(existingState.expectedKind, merged);
          if (completeIntent) {
            try {
              return await processIntent(chatCtx, completeIntent);
            } catch (err) {
              console.warn("[whatsapp-natural-chat] multi-step action failed:", err);
            }
          }
        } else {
          // Still missing some fields — ask again and update state
          await saveConversationState(ctx.sender, ctx.fromPhone, {
            ...existingState,
            partial: merged,
            missingFields: stillMissing,
            createdAt: existingState.createdAt,
          }).catch(() => {});
          return buildClarifyingQuestion(existingState.expectedKind, stillMissing);
        }
      }
    }

    // Step 3: Try regex-based parseIntent first (fast path)
    let structuredIntent: ParsedIntent = parseIntent(expandedText);

    // Step 4: If regex returns free_text, try LLM-based intent parsing
    if (structuredIntent.kind === "free_text" && isLLMIntentParserAvailable()) {
      const llmIntent = await parseIntentWithLLM(expandedText, ctx.sender.brainId).catch(
        () => null
      );
      if (llmIntent && llmIntent.kind !== "free_text") {
        structuredIntent = llmIntent;
      }
    }

    // Step 5: Execute the structured intent if it's actionable
    if (structuredIntent.kind !== "free_text" && structuredIntent.kind !== "unknown") {
      // Check if the intent has all required fields
      const missing = missingFieldsForIntent(structuredIntent);
      if (missing.length > 0) {
        // Save conversation state and ask clarifying question
        await saveConversationState(ctx.sender, ctx.fromPhone, {
          expectedKind: structuredIntent.kind,
          missingFields: missing,
          partial: intentToPartial(structuredIntent),
          createdAt: new Date().toISOString(),
          originalText: ctx.text,
        }).catch(() => {});
        return buildClarifyingQuestion(structuredIntent.kind, missing);
      }

      try {
        return await processIntent(chatCtx, structuredIntent);
      } catch (err) {
        console.warn("[whatsapp-natural-chat] daily ops action failed:", err);
      }
    }

    // Step 6: Final fallback — could not structure the request → ask clarifying question
    return [
      `Ich habe verstanden, dass es um einen Kanzlei-Alltag-Vorgang geht.`,
      `Bitte formulieren Sie genauer, damit ich helfen kann, zum Beispiel:`,
      `• "30 Minuten für Müller telefoniert"`,
      `• "12,50 Euro für Kopien ausgelegt"`,
      `• "Morgen 10 Uhr Termin mit Müller"`,
      `• "Frist Berufung bis 15.07.2026"`,
      `• "Aufgabe Klageentwurf prüfen bis 2026-07-01"`,
      `• "Dokument Klageentwurf.pdf an akt 2026-014"`,
    ].join("\n");
  }

  // Build rich context for the brain query
  const historyText = formatHistory(history);
  const dashboardText = formatDashboardContext(dashboard);
  const identityText = `Nutzer: ${ctx.sender.name || ""}, Rolle: ${ctx.sender.role || ""}, Kanzlei: ${ctx.sender.orgId || ""}.`;

  const enrichedQuery = [
    identityText,
    dashboardText,
    historyText ? `Letzte Nachrichten:\n${historyText}` : "",
    `Aktuelle Nutzer-Nachricht: ${ctx.text}`,
    "",
    "Anweisung: Du bist ein Kanzlei-Alltags-Assistent. Antworte in natürlichem, professionellem Deutsch und sprich die Person immer mit „Sie“ an. Hilf bei: Terminen, Mandanten-Infos, offenen Aufgaben/Fristen, Zeiterfassung und Kosten. Gib konkrete, aus dem Brain/Dashboard belegte Informationen. Vermeide technische Ausgabeformate wie `## Answer` oder `## Gaps`. Keine Rechtsberatung. Wenn Daten fehlen, sage das ehrlich.",
  ]
    .filter(Boolean)
    .join("\n\n");

  try {
    const { answer: rawAnswer, warnings } = await think(
      ctx.sender.brainId,
      enrichedQuery,
      whatsAppEngineScope(ctx.sender),
      "balanced"
    );
    const cleaned = cleanEngineAnswer(rawAnswer);
    // Grounding, search-failure note and KI label (KI5-02).
    return await finalizeWhatsAppAiAnswer(cleaned, {
      warnings,
      extraNote: disclaimerNote(intent),
    });
  } catch (err) {
    console.error("[whatsapp-natural-chat] think failed:", err);
    return "Ich konnte Ihre Frage gerade nicht beantworten. Bitte versuchen Sie es später erneut oder öffnen Sie Subsumio im Browser.";
  }
}

export { classifyIntent };
export type { NaturalChatContext, ChatIntent };

/**
 * Convert a ParsedIntent into a partial record for conversation state storage.
 */
function intentToPartial(intent: ParsedIntent): Record<string, unknown> {
  switch (intent.kind) {
    case "appointment":
      return {
        caseRef: intent.caseRef,
        title: intent.title,
        date: intent.date,
        time: intent.time,
        location: intent.location,
        reminderHours: intent.reminderHours,
      };
    case "deadline":
      return {
        caseRef: intent.caseRef,
        title: intent.title,
        dueDate: intent.dueDate,
      };
    case "task":
      return {
        caseRef: intent.caseRef,
        title: intent.title,
        dueDate: intent.dueDate,
      };
    case "time_entry":
      return {
        minutes: intent.minutes,
        caseRef: intent.caseRef,
        description: intent.description,
        billable: intent.billable,
      };
    case "expense":
      return {
        amount: intent.amount,
        caseRef: intent.caseRef,
        description: intent.description,
        billable: intent.billable,
      };
    case "case_note":
      return {
        caseRef: intent.caseRef,
        note: intent.note,
      };
    default:
      return {};
  }
}

/**
 * Build a complete ParsedIntent from a merged partial state.
 * Returns null if the kind is not supported or required fields are still missing.
 */
function buildCompleteIntent(kind: string, partial: Record<string, unknown>): ParsedIntent | null {
  const str = (v: unknown): string => (typeof v === "string" ? v : v != null ? String(v) : "");
  const num = (v: unknown): number => {
    const n = typeof v === "number" ? v : parseFloat(String(v).replace(",", "."));
    return Number.isFinite(n) ? n : 0;
  };
  const bool = (v: unknown): boolean => (typeof v === "boolean" ? v : true);

  switch (kind) {
    case "appointment":
      return {
        kind: "appointment",
        caseRef: str(partial.caseRef),
        title: str(partial.title) || "Termin",
        date: str(partial.date),
        time: str(partial.time),
        location: partial.location ? str(partial.location) : undefined,
        reminderHours: num(partial.reminderHours) || 24,
      };
    case "deadline":
      return {
        kind: "deadline",
        caseRef: str(partial.caseRef),
        title: str(partial.title) || "Frist",
        dueDate: str(partial.dueDate),
      };
    case "task":
      return {
        kind: "task",
        caseRef: str(partial.caseRef),
        title: str(partial.title),
        dueDate: partial.dueDate ? str(partial.dueDate) : undefined,
      };
    case "time_entry":
      return {
        kind: "time_entry",
        minutes: Math.max(1, Math.round(num(partial.minutes))),
        caseRef: str(partial.caseRef),
        description: str(partial.description) || "Zeiterfassung via WhatsApp",
        billable: bool(partial.billable),
      };
    case "expense":
      return {
        kind: "expense",
        amount: Math.max(0, num(partial.amount)),
        caseRef: str(partial.caseRef),
        description: str(partial.description) || "Auslage via WhatsApp",
        billable: bool(partial.billable),
      };
    case "case_note":
      return {
        kind: "case_note",
        caseRef: str(partial.caseRef),
        note: str(partial.note),
      };
    default:
      return null;
  }
}
