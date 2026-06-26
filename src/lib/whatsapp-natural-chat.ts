import {
  ENGINE_URL,
  engineHeadersForBrain,
  engineHeadersForBrainWithMatterScope,
} from "@/lib/engine";
import { parseIntent, processIntent } from "@/lib/legal-chat/actions";
import type { BrainPage } from "@/lib/types";
import type { WhatsAppIdentity } from "@/lib/whatsapp/types";
import { phoneHash } from "@/lib/whatsapp/verify";

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

async function engineRequest<T>(
  brainId: string,
  path: string,
  init?: RequestInit,
  matterScope?: string[] | "all"
): Promise<T> {
  const headers = matterScope
    ? engineHeadersForBrainWithMatterScope(brainId, matterScope)
    : engineHeadersForBrain(brainId);
  const res = await fetch(`${ENGINE_URL}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...headers,
      ...(init?.headers ?? {}),
    },
  });
  if (!res.ok) {
    const error = await res.text().catch(() => "");
    throw new Error(error || `Engine HTTP ${res.status}`);
  }
  const text = await res.text();
  if (!text) return undefined as unknown as T;
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new Error(`Engine returned non-JSON response: ${text.slice(0, 200)}`);
  }
}

async function listPages(brainId: string, type: string, limit = 200): Promise<BrainPage[]> {
  const result = await engineRequest<BrainPage[]>(
    brainId,
    `/api/pages?type=${encodeURIComponent(type)}&limit=${limit}`
  );
  return Array.isArray(result) ? result : [];
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

async function think(
  brainId: string,
  query: string,
  matterScope?: string[] | "all"
): Promise<string> {
  const headers = matterScope
    ? engineHeadersForBrainWithMatterScope(brainId, matterScope)
    : engineHeadersForBrain(brainId);
  const res = await fetch(`${ENGINE_URL}/api/think`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...headers,
    },
    body: JSON.stringify({ query, mode: "balanced" }),
  });
  if (!res.ok) throw new Error(`Brain-Q&A fehlgeschlagen: HTTP ${res.status}`);
  const contentType = res.headers.get("Content-Type") || "";
  if (!contentType.includes("text/event-stream")) {
    const data = (await res.json().catch(() => ({}))) as { answer?: string };
    return data.answer || "Keine Antwort erhalten.";
  }
  if (!res.body) return "Keine Antwort erhalten.";
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let answer = "";
  let buffer = "";
  const handle = (data: string) => {
    if (data === "[DONE]") return;
    try {
      const parsed = JSON.parse(data) as { chunk?: string };
      if (typeof parsed.chunk === "string") answer += parsed.chunk;
    } catch {}
  };
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() || "";
    for (const line of lines) if (line.startsWith("data: ")) handle(line.slice(6));
  }
  if (buffer.startsWith("data: ")) handle(buffer.slice(6));
  return answer.trim() || "Keine Antwort erhalten.";
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
  const roleLabel =
    sender.role === "lawyer" ? "Rechtsanwalt" : sender.role === "admin" ? "Admin" : "Kollege";

  let reply = `${timeGreeting}, ${name}. Ich bin dein Subsumio Kanzlei-Assistent. `;

  if (ctx.totalCases === 0) {
    reply +=
      "Dein Dashboard ist noch leer — du kannst hier gerne Akten, Fristen oder Aufgaben per WhatsApp anlegen.";
  } else if (ctx.openDeadlines > 0 || ctx.openTasks > 0) {
    reply += `Aktuell hast du ${ctx.totalCases} Akten, ${ctx.openTasks} offene Aufgaben und ${ctx.openDeadlines} offene Fristen. Wie kann ich dir helfen?`;
  } else {
    reply += `Alles im Griff: ${ctx.totalCases} Akten, keine offenen Fristen oder Aufgaben. Was steht an?`;
  }

  return reply;
}

function buildSmalltalkReply(sender: WhatsAppIdentity, text: string): string {
  const lower = text.toLowerCase();
  if (/danke|vielen dank|super|toll|perfekt/.test(lower)) {
    return "Gerne! Ich bin da, wenn du etwas brauchst — sei es eine Akten-Info, eine Frist oder einfach nur ein schneller Überblick.";
  }
  if (/tschüss|bis dann|auf wiedersehen|ciao|cu/.test(lower)) {
    return "Bis bald! Melde dich einfach, wenn du wieder etwas benötigst.";
  }
  if (/wie geht|wie gehts/.test(lower)) {
    return "Mir geht es gut, danke! Ich bin bereit, dir bei deinen Akten und Recherchen zu helfen. Wie läuft es bei dir?";
  }
  if (/wer bist|was machst|was kannst/.test(lower)) {
    return `Ich bin der Subsumio Kanzlei-Assistent für ${sender.name || "dich"}. Ich helfe dir bei: Akten-Überblick, Fristen, Aufgaben, Dokumenten, Rechtsrecherche, Zeit-Erfassung und mehr. Schreibe mir einfach in natürlicher Sprache.`;
  }
  return "Verstanden. Sag mir einfach, was du brauchst — ich schaue in deinem Dashboard und in den Gesetzen nach.";
}

function buildDashboardOverviewReply(sender: WhatsAppIdentity, ctx: DashboardContext): string {
  if (ctx.totalCases === 0) {
    return 'Dein Dashboard ist noch leer. Noch keine Akten, Fristen oder Termine. Du kannst mit "neue akte [Mandant] vs. [Gegner]" starten.';
  }

  const parts: string[] = [];
  parts.push(`Hier ist dein Überblick, ${sender.name || ""}:`);
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

  parts.push("\nWas möchtest du als Nächstes tun?");
  return parts.join("\n");
}

function addDisclaimer(intent: ChatIntent, text: string): string {
  if (intent === "legal_research") {
    return `${text}\n\n⚖️ Hinweis: Diese Rechts-Recherche ersetzt keine anwaltliche Prüfung. Bitte überprüfe alle Rechtsfragen eigenverantwortlich.`;
  }
  if (intent === "general" || intent === "daily_ops") {
    return `${text}\n\n🤖 Subsumio Kanzlei-Assistent — für den Alltag, nicht für Rechtsberatung.`;
  }
  return text;
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
    const structuredIntent = parseIntent(ctx.text);
    if (structuredIntent.kind !== "free_text" && structuredIntent.kind !== "unknown") {
      try {
        return await processIntent(
          {
            sender: ctx.sender,
            fromPhone: ctx.fromPhone,
            messageId: ctx.messageId,
            text: ctx.text,
          },
          structuredIntent
        );
      } catch (err) {
        console.warn("[whatsapp-natural-chat] daily ops action failed:", err);
      }
    }
    // Fallback: could not structure the daily ops request → ask clarifying question
    return [
      `Ich habe verstanden, dass es um einen Kanzlei-Alltag-Vorgang geht.`,
      `Damit ich dir helfen kann, bitte präziser formulieren, z.B.:`,
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
    "Anweisung: Du bist ein Kanzlei-Alltags-Assistent. Antworte in natürlichem, professionellem Deutsch. Hilf bei: Terminen, Mandanten-Infos, offenen Aufgaben/Fristen, Zeiterfassung und Kosten. Gib konkrete, aus dem Brain/Dashboard belegte Informationen. Vermeide technische Ausgabeformate wie `## Answer` oder `## Gaps`. Keine Rechtsberatung. Wenn Daten fehlen, sage das ehrlich.",
  ]
    .filter(Boolean)
    .join("\n\n");

  try {
    const rawAnswer = await think(ctx.sender.brainId, enrichedQuery, ctx.sender.matterScope);
    const cleaned = cleanEngineAnswer(rawAnswer);
    const withDisclaimer = addDisclaimer(intent, cleaned);
    return withDisclaimer.slice(0, 3500);
  } catch (err) {
    console.error("[whatsapp-natural-chat] think failed:", err);
    return "Entschuldigung, ich konnte deine Frage gerade nicht beantworten. Bitte versuche es später erneut oder öffne das Dashboard.";
  }
}

export { classifyIntent };
export type { NaturalChatContext, ChatIntent };
