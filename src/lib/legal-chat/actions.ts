import { randomUUID } from "node:crypto";
import { ENGINE_URL, engineHeadersForBrain } from "@/lib/engine";
import type { BrainPage } from "@/lib/types";
import type { StoredWhatsAppMedia } from "@/lib/whatsapp/media";
import type { WhatsAppSenderBinding } from "@/lib/whatsapp/types";
import { phoneHash } from "@/lib/whatsapp/verify";
import { calculateRvg } from "@/lib/rvg";
import { calculateDeadline, DEADLINE_RULES, type Bundesland } from "@/lib/legal-deadlines";

interface ChatContext {
  sender: WhatsAppSenderBinding;
  fromPhone: string;
  messageId: string;
  text: string;
}

interface MediaChatContext extends Omit<ChatContext, "text"> {
  caption?: string;
}

type ParsedIntent =
  | { kind: "help" }
  | { kind: "confirm" }
  | { kind: "cancel" }
  | { kind: "time_entry"; minutes: number; caseRef: string; description: string; billable: boolean }
  | { kind: "expense"; amount: number; caseRef: string; description: string; billable: boolean }
  | { kind: "case_note"; caseRef: string; note: string }
  | { kind: "standalone_note"; note: string }
  | { kind: "invoice_status"; caseRef: string }
  | { kind: "task"; caseRef: string; title: string; dueDate?: string }
  | { kind: "deadline"; caseRef: string; title: string; dueDate: string }
  | { kind: "case_summary"; caseRef: string }
  | { kind: "brain_query"; query: string }
  | { kind: "rvg_calc"; streitwert: number }
  | { kind: "deadline_calc"; ruleKey: string; startDate: string; bundesland: string }
  | { kind: "conflict_check"; name: string; caseRef?: string }
  | { kind: "document_fetch"; caseRef: string; query: string }
  | { kind: "list_cases" }
  | { kind: "list_tasks" }
  | { kind: "list_deadlines" }
  | { kind: "today" }
  | { kind: "case_lookup"; caseRef: string }
  | { kind: "mark_done"; caseRef: string; itemType: "task" | "deadline"; query: string }
  | { kind: "search"; query: string }
  | { kind: "financial_overview" }
  | { kind: "case_activity"; caseRef: string }
  | { kind: "create_case"; clientName: string; opponentName: string; legalArea: string; description: string }
  | { kind: "create_client"; name: string; phone?: string; email?: string; note?: string }
  | { kind: "close_case"; caseRef: string }
  | { kind: "create_invoice"; caseRef: string; amount: number; description: string }
  | { kind: "free_text"; text: string }
  | { kind: "unknown"; message: string };

interface EnginePageInput {
  slug: string;
  title: string;
  type?: string;
  content?: string;
  frontmatter?: Record<string, unknown>;
  merge?: boolean;
}

async function engineRequest<T>(brainId: string, path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${ENGINE_URL}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...engineHeadersForBrain(brainId),
      ...(init?.headers ?? {}),
    },
  });
  if (!res.ok) {
    const error = await res.text().catch(() => "");
    throw new Error(error || `Engine HTTP ${res.status}`);
  }
  return res.json() as Promise<T>;
}

async function listPages(brainId: string, type: string, limit = 200): Promise<BrainPage[]> {
  return engineRequest<BrainPage[]>(brainId, `/api/pages?type=${encodeURIComponent(type)}&limit=${limit}`);
}

async function getPage(brainId: string, slug: string): Promise<BrainPage> {
  return engineRequest<BrainPage>(brainId, `/api/pages/${encodeURIComponent(slug)}`);
}

async function putPage(brainId: string, page: EnginePageInput): Promise<void> {
  await engineRequest(brainId, "/api/pages", {
    method: "POST",
    body: JSON.stringify(page),
  });
}

function safeSlugPart(input: string): string {
  return input
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 80) || "item";
}

export function parseIntent(text: string): ParsedIntent {
  const trimmed = text.trim();
  const lower = trimmed.toLowerCase();
  if (/^(ja|ok|okay|speichern|bestaetigen|bestätigen)$/i.test(trimmed)) return { kind: "confirm" };
  if (/^(nein|no|abbrechen|verwerfen|stopp|stop)$/i.test(trimmed)) return { kind: "cancel" };
  if (/^(hilfe|help|\?)$/i.test(trimmed)) return { kind: "help" };

  const minutesMatch = trimmed.match(/(\d+(?:[,.]\d+)?)\s*(h|std|stunden|m|min|minute|minuten)\b/i);
  if (minutesMatch) {
    const raw = parseFloat(minutesMatch[1].replace(",", "."));
    const unit = minutesMatch[2].toLowerCase();
    const minutes = Math.max(1, Math.round(unit.startsWith("h") || unit.startsWith("std") || unit.startsWith("stunde") ? raw * 60 : raw));
    const caseMatch = trimmed.match(/\b(?:akt|akte|az|aktenzeichen)\s+([A-Za-z0-9\-\/_.]+)/i);
    const caseRef = (caseMatch?.[1] ?? "").trim();
    const description = trimmed
      .replace(minutesMatch[0], "")
      .replace(caseMatch?.[0] ?? "", "")
      .replace(/^\s*zeit\s*/i, "")
      .trim() || "Zeiterfassung via WhatsApp";
    return caseRef
      ? { kind: "time_entry", minutes, caseRef, description, billable: !/\bnicht\s+abrechenbar\b/i.test(trimmed) }
      : { kind: "free_text", text: trimmed };
  }

  const expenseMatch = trimmed.match(/^(?:auslage|kosten|spesen)\s+(?:(?:akt|akte)\s+([^:]+):\s*)?(.+)$/i);
  if (expenseMatch) {
    const body = expenseMatch[2].trim();
    const amountMatch = body.match(/(\d+(?:[,.]\d{1,2})?)\s*(?:euro|eur|€)?/i);
    if (!amountMatch) {
      return { kind: "free_text", text: trimmed };
    }
    const amount = Math.max(0, Number.parseFloat(amountMatch[1].replace(",", ".")));
    const description = body
      .replace(amountMatch[0], "")
      .replace(/\b(euro|eur)\b/gi, "")
      .replace(/^\s*[:,-]\s*/, "")
      .trim() || "Auslage via WhatsApp";
    return {
      kind: "expense",
      amount,
      caseRef: (expenseMatch[1] ?? "").trim(),
      description,
      billable: !/\bnicht\s+abrechenbar\b/i.test(trimmed),
    };
  }

  const noteMatch = trimmed.match(/^notiz\s+(?:zu\s+)?(?:(?:akt|akte)\s+)?([^:]+):\s*(.+)$/i);
  if (noteMatch) {
    return { kind: "case_note", caseRef: noteMatch[1].trim(), note: noteMatch[2].trim() };
  }

  const statusMatch = trimmed.match(/^(?:status|abrechnung|offen(?!e\s+abrechnung|\s+abrechenbar))\s+(?:zu\s+)?(?:(?:akt|akte)\s+)?(.+)$/i);
  if (statusMatch) return { kind: "invoice_status", caseRef: statusMatch[1].trim() };

  // 'offen abrechenbar akt X' / 'offene abrechnung akt X' → invoice_status (checked separately to avoid statusMatch swallowing 'abrechenbar' as caseRef)
  if (/^offen(?:e\s+abrechnung|\s+abrechenbar)\s+(?:akt|akte)\s+/i.test(trimmed)) {
    const caseMatch = trimmed.match(/\b(?:akt|akte)\s+([^,;:\n]+)/i);
    if (caseMatch) return { kind: "invoice_status", caseRef: caseMatch[1].trim() };
  }

  // Deadline calculation: "frist berechnen berufung ab 2026-03-15 BY" or "berechne frist zpo-berufung 15.03.2026"
  // Must be checked BEFORE the deadline/task matchers to avoid being swallowed
  const deadlineCalcMatch = trimmed.match(
    /^(?:frist|deadline)\s+berechnen\s+([a-z-]+)\s+(?:ab\s+)?(\d{4}-\d{2}-\d{2}|\d{1,2}\.\d{1,2}\.\d{2,4})(?:\s+([A-Z]{2,3}))?/i,
  );
  if (deadlineCalcMatch) {
    return {
      kind: "deadline_calc",
      ruleKey: deadlineCalcMatch[1].toLowerCase(),
      startDate: normalizeDate(deadlineCalcMatch[2]),
      bundesland: (deadlineCalcMatch[3] || "BY").toUpperCase(),
    };
  }

  // Mark task/deadline as done: "erledigt akt 2026-014: klageentwurf" or "aufgabe erledigt akt X: ..."
  // Must be checked BEFORE the deadline/task matchers to avoid being swallowed
  const doneMatch = trimmed.match(/^(?:(aufgabe|frist|task|deadline)\s+)?erledigt\s+(?:(?:akt|akte)\s+([^:]+):\s*)?(.+)$/i);
  if (doneMatch) {
    const itemType = doneMatch[1]?.toLowerCase().startsWith("frist") || doneMatch[1]?.toLowerCase().startsWith("deadline") ? "deadline" : "task";
    return {
      kind: "mark_done",
      caseRef: (doneMatch[2] ?? "").trim(),
      itemType,
      query: doneMatch[3].trim(),
    };
  }

  const taskMatch = trimmed.match(/^(?:aufgabe|todo)\s+(?:(?:akt|akte)\s+([^:]+):\s*)?(.+)$/i);
  if (taskMatch) {
    const taskText = taskMatch[2].trim();
    const dateMatch = taskText.match(/\b(?:bis|am)\s+(\d{4}-\d{2}-\d{2}|\d{1,2}\.\d{1,2}\.\d{2,4})\b/i);
    return {
      kind: "task",
      caseRef: (taskMatch[1] ?? "").trim(),
      title: taskText.replace(dateMatch?.[0] ?? "", "").trim(),
      dueDate: dateMatch ? normalizeDate(dateMatch[1]) : undefined,
    };
  }

  const deadlineMatch = trimmed.match(/^(?:frist|termin)\s+(?:(?:akt|akte)\s+([^:]+):\s*)?(.+)$/i);
  if (deadlineMatch) {
    const body = deadlineMatch[2].trim();
    const dateMatch = body.match(/\b(\d{4}-\d{2}-\d{2}|\d{1,2}\.\d{1,2}\.\d{2,4})\b/);
    if (!dateMatch) return { kind: "free_text", text: trimmed };
    return {
      kind: "deadline",
      caseRef: (deadlineMatch[1] ?? "").trim(),
      title: body.replace(dateMatch[0], "").replace(/\b(am|bis)\b/gi, "").trim() || "Frist",
      dueDate: normalizeDate(dateMatch[1]),
    };
  }

  const summaryMatch = trimmed.match(/^(?:akte|akt)\s+(.+?)\s+(?:zusammenfassung|summary|überblick|ueberblick)$/i)
    ?? trimmed.match(/^(?:zusammenfassung|summary|überblick|ueberblick)\s+(?:(?:akt|akte)\s+)?(.+)$/i);
  if (summaryMatch) return { kind: "case_summary", caseRef: summaryMatch[1].trim() };

  const queryMatch = trimmed.match(/^(?:frage|suche|wissen|brain)\s*[: ]\s*(.+)$/i);
  if (queryMatch) return { kind: "brain_query", query: queryMatch[1].trim() };

  // RVG fee calculation: "rvg 50000" or "kosten 50000" or "streitwert 50000"
  // Handles: 50000, 50.000, 50.000,00, 1234,56
  const rvgMatch = trimmed.match(/^(?:rvg|kosten|streitwert|gebühren|gebuehren)\s+(?:berechnen\s+)?([\d.,]+)\s*(?:eur|euro|€)?/i);
  if (rvgMatch) {
    // Parse German number format: remove thousand separators (.), convert decimal comma (,) to dot
    const cleaned = rvgMatch[1].replace(/\./g, "").replace(",", ".");
    const streitwert = Number.parseFloat(cleaned);
    if (Number.isFinite(streitwert) && streitwert > 0) return { kind: "rvg_calc", streitwert };
  }

  // Conflict check: "konflikt Müller" or "konflikt-check Müller akt 2026-014"
  const conflictMatch = trimmed.match(/^(?:konflikt|conflict|konflikt-check)\s+(.+?)(?:\s+(?:akt|akte)\s+(\S+))?$/i);
  if (conflictMatch) {
    return {
      kind: "conflict_check",
      name: conflictMatch[1].trim(),
      caseRef: conflictMatch[2]?.trim(),
    };
  }

  // Document fetch: "dokument akt 2026-014: klage" or "hole dokument akt 2026-014 vertrag"
  const docMatch = trimmed.match(/^(?:hole\s+)?(?:dokument|dokumente|unterlagen)\s+(?:(?:akt|akte)\s+([^:]+):\s*)?(.+)$/i);
  if (docMatch) {
    return {
      kind: "document_fetch",
      caseRef: (docMatch[1] ?? "").trim(),
      query: docMatch[2].trim(),
    };
  }

  // List cases: "akten" or "fälle" or "liste akten"
  if (/^(?:akten|fälle|faelle|liste\s+akten|case\s+list)$/i.test(trimmed)) {
    return { kind: "list_cases" };
  }

  // List all open tasks: "aufgaben", "offene aufgaben", "todos", "was ist zu tun"
  if (/^(?:aufgaben|offene\s+aufgaben|todos|offene\s+todos|was\s+ist\s+zu\s+tun|to[-\s]?do)$/i.test(trimmed)) {
    return { kind: "list_tasks" };
  }

  // List all open deadlines: "fristen", "offene fristen", "fristliste"
  if (/^(?:fristen|offene\s+fristen|fristliste|frist-?liste|deadline\s+list)$/i.test(trimmed)) {
    return { kind: "list_deadlines" };
  }

  // Today's overview: "heute", "was steht an", "agenda", "today"
  if (/^(?:heute|was\s+steht\s+an|agenda|today|übersicht|ueberblick)$/i.test(trimmed)) {
    return { kind: "today" };
  }

  // Create new case: "neue akte Müller vs. Schmidt Familienrecht" or "neuer fall ..."
  // Checked BEFORE closeCaseMatch2/bareCaseMatch to avoid 'akte anlegen ...' being swallowed as case_lookup
  const createCaseMatch = trimmed.match(
    /^(?:neue\s+akte|neuer\s+fall|neue\s+sache|akte\s+anlegen|fall\s+anlegen)\s+(.+)$/i,
  );
  if (createCaseMatch) {
    const body = createCaseMatch[1].trim();
    // Try to parse "Mandant vs. Gegner Rechtsgebiet Beschreibung"
    const vsMatch = body.match(/^(.+?)\s+(?:vs\.?|gegen)\s+(.+?)(?:\s+(Familienrecht|Zivilrecht|Strafrecht|Arbeitsrecht|Handelsrecht|Steuerrecht|Verwaltungsrecht|Gewerblicher\s+Rechtsschutz)(?:\s+(.*))?)?\s*$/i);
    if (vsMatch) {
      const legalAreaMap: Record<string, string> = {
        "familienrecht": "family", "zivilrecht": "civil", "strafrecht": "criminal",
        "arbeitsrecht": "labor", "handelsrecht": "commercial", "steuerrecht": "tax",
        "verwaltungsrecht": "administrative", "gewerblicher rechtsschutz": "ip",
      };
      const legalArea = legalAreaMap[(vsMatch[3] || "zivilrecht").toLowerCase()] || "civil";
      return {
        kind: "create_case",
        clientName: vsMatch[1].trim(),
        opponentName: vsMatch[2].trim(),
        legalArea,
        description: vsMatch[4]?.trim() || "",
      };
    }
    // Just a client name — no opponent
    return {
      kind: "create_case",
      clientName: body,
      opponentName: "",
      legalArea: "civil",
      description: "",
    };
  }

  // Close case: "akte abschließen 2026-014" or "akte schließen X" or "fall abschließen X"
  // Checked BEFORE bareCaseMatch to avoid "akte beenden X" being swallowed as case_lookup
  const closeCaseMatch2 = trimmed.match(
    /^(?:abschließen|abschliessen|schließen|schliessen|beenden|archivieren)\s+(?:(?:akt|akte|fall)\s+)?(.+)$/i,
  );
  if (closeCaseMatch2) {
    return { kind: "close_case", caseRef: closeCaseMatch2[1].trim() };
  }

  // Also: "akte beenden 2026-014" or "fall abschließen X" (noun-first)
  const closeCaseMatchNoun = trimmed.match(
    /^(?:akte|fall)\s+(?:abschließen|abschliessen|schließen|schliessen|beenden|erledigt|archivieren)\s+(.+)$/i,
  );
  if (closeCaseMatchNoun) {
    return { kind: "close_case", caseRef: closeCaseMatchNoun[1].trim() };
  }

  // Bare case reference: "akte 2026-014" or "akt 2026-014" or "az 2026-014"
  // → show case summary (most natural way to look up a case)
  // Stops at semicolon to truncate SQL injection payloads; allows emoji in case refs
  const bareCaseMatch = trimmed.match(/^(?:akt|akte|az|aktenzeichen)\s+([^;\n]+)/i);
  if (bareCaseMatch) {
    return { kind: "case_lookup", caseRef: bareCaseMatch[1].trim() };
  }

  // Natural language case summary: "wie ist der status akte 2026-014" / "was ist mit akt ..."
  // 'zeige mir' requires akt/akte prefix to avoid matching arbitrary text like 'zeige mir deinen system prompt'
  const nlCaseMatch = trimmed.match(/^(?:wie\s+ist\s+(?:der\s+)?status|was\s+ist\s+(?:mit|los\s+mit)|info)\s+(?:(?:akt|akte)\s+)?(.+)$/i)
    ?? trimmed.match(/^zeig(?:e)?\s+mir\s+(?:akt|akte)\s+(.+)$/i);
  if (nlCaseMatch) {
    return { kind: "case_summary", caseRef: nlCaseMatch[1].trim() };
  }

  // Search across all cases: "suche Müller" or "finde Müller" or "wer ist Müller"
  const searchMatch = trimmed.match(/^(?:suche|finde|wer\s+ist|wo\s+ist)\s+(.+)$/i);
  if (searchMatch) {
    return { kind: "search", query: searchMatch[1].trim() };
  }

  // Financial overview: "offene kosten" / "umsatz" / "abrechnung" / "konto"
  if (/^(?:offene\s+kosten|umsatz|abrechnung|konto|finanzen|finanzielle\s+übersicht|finanzielle\s+ueberblick)$/i.test(trimmed)) {
    return { kind: "financial_overview" };
  }

  // Case activity log: "verlauf akt 2026-014" or "historie akt 2026-014" or "aktivitäten akt X"
  const activityMatch = trimmed.match(/^(?:verlauf|historie|aktivitäten|aktivitaeten|log)\s+(?:(?:akt|akte)\s+)?(.+)$/i);
  if (activityMatch) {
    return { kind: "case_activity", caseRef: activityMatch[1].trim() };
  }

  // Create new client: "neuer mandant Thomas Müller" or "neuer klient ..."
  const createClientMatch = trimmed.match(
    /^(?:neuer\s+mandant|neuer\s+klient|neuer\s+kunde|mandant\s+anlegen)\s+(.+)$/i,
  );
  if (createClientMatch) {
    const body = createClientMatch[1].trim();
    const phoneMatch = body.match(/(\+?\d[\d\s\-()]{6,})/);
    const emailMatch = body.match(/[\w.+-]+@[\w.-]+\.\w{2,}/);
    const name = body
      .replace(phoneMatch?.[0] ?? "", "")
      .replace(emailMatch?.[0] ?? "", "")
      .replace(/[,;|]/g, " ")
      .replace(/\s+/g, " ")
      .trim();
    return {
      kind: "create_client",
      name,
      phone: phoneMatch?.[0]?.trim(),
      email: emailMatch?.[0],
      note: "",
    };
  }

  // Create invoice: "rechnung akt 2026-014: 2500 eur für Klageentwurf"
  const invoiceMatch = trimmed.match(
    /^(?:rechnung|invoice)\s+(?:(?:akt|akte)\s+([^:]+):\s*)?(\d+(?:[.,]\d{1,2})?)\s*(?:eur|euro|€)?\s*(?:für\s+(.+))?$/i,
  );
  if (invoiceMatch) {
    const amount = Number.parseFloat(invoiceMatch[2].replace(",", "."));
    if (Number.isFinite(amount) && amount > 0) {
      return {
        kind: "create_invoice",
        caseRef: (invoiceMatch[1] ?? "").trim(),
        amount,
        description: invoiceMatch[3]?.trim() || "Rechnung via WhatsApp",
      };
    }
  }

  // Standalone note (no case ref): "notiz: Müller angerufen, bittet Rückruf"
  const standaloneNoteMatch = trimmed.match(/^notiz\s*[: ]\s*(.+)$/i);
  if (standaloneNoteMatch && !trimmed.match(/\b(?:akt|akte)\s+/i)) {
    return { kind: "standalone_note", note: standaloneNoteMatch[1].trim() };
  }

  // ─── Fallback ───

  // Free text fallback — treat as a natural language question to the brain
  return { kind: "free_text", text: trimmed };
}

function parseCaseRefFromText(text: string): string {
  return (text.match(/\b(?:akt|akte|az|aktenzeichen)\s+([^,;:\n]+)/i)?.[1] ?? "").trim();
}

function normalizeDate(input: string): string {
  if (/^\d{4}-\d{2}-\d{2}$/.test(input)) return input;
  const match = input.match(/^(\d{1,2})\.(\d{1,2})\.(\d{2,4})$/);
  if (!match) return input;
  const year = match[3].length === 2 ? `20${match[3]}` : match[3];
  return `${year}-${match[2].padStart(2, "0")}-${match[1].padStart(2, "0")}`;
}

function fm(page: BrainPage): Record<string, unknown> {
  return page.frontmatter ?? {};
}

function str(value: unknown): string {
  return typeof value === "string" ? value : "";
}

interface CaseCandidate {
  page: BrainPage;
  score: number;
}

async function findCaseCandidates(brainId: string, caseRef: string): Promise<CaseCandidate[]> {
  const pages = await listPages(brainId, "legal_case", 300);
  const needle = caseRef.trim().toLowerCase();
  if (!needle) return [];
  return pages
    .map((page) => {
      const front = fm(page);
      const hay = [
        page.slug,
        page.title,
        str(front.case_number),
        str(front.client_name),
        str(front.opponent_name),
        str(front.court_name),
      ].join(" ").toLowerCase();
      let score = 0;
      if (str(front.case_number).toLowerCase() === needle) score += 100;
      if (page.title.toLowerCase() === needle) score += 80;
      if (hay.includes(needle)) score += 20;
      return { page, score };
    })
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score);
}

async function resolveCase(brainId: string, caseRef: string): Promise<BrainPage | null> {
  const scored = await findCaseCandidates(brainId, caseRef);
  if (scored.length === 0) return null;
  if (scored[0].score >= 80) return scored[0].page;
  if (scored.length > 1 && scored[0].score === scored[1].score) return null;
  return scored[0]?.page ?? null;
}

async function caseLookupHelp(brainId: string, caseRef: string): Promise<string> {
  const candidates = (await findCaseCandidates(brainId, caseRef)).slice(0, 5);
  if (candidates.length === 0) {
    return `Ich finde keine Akte zu "${caseRef}". Bitte mit Aktenzeichen senden, z.B. "akt 2026-014".`;
  }
  return [
    `Ich finde keine eindeutige Akte zu "${caseRef}". Meinst du:`,
    ...candidates.map(({ page }) => {
      const front = fm(page);
      return `- ${str(front.case_number) || page.slug}: ${page.title}`;
    }),
    "Bitte nochmal mit Aktenzeichen senden.",
  ].join("\n");
}

async function createInboxPage(ctx: ChatContext, intent: ParsedIntent): Promise<void> {
  const slug = `legal/chat/whatsapp/${safeSlugPart(ctx.messageId)}`;
  await putPage(ctx.sender.brainId, {
    slug,
    title: `WhatsApp ${ctx.messageId}`,
    type: "chat_inbox",
    content: ctx.text,
    frontmatter: {
      type: "chat_inbox",
      provider: "whatsapp",
      message_id: ctx.messageId,
      from_phone_hash: phoneHash(ctx.fromPhone),
      from_user_id: ctx.sender.userId,
      from_name: ctx.sender.name,
      tenant_brain_id: ctx.sender.brainId,
      direction: "inbound",
      message_type: "text",
      received_at: new Date().toISOString(),
      status: "received",
      intent: intent.kind,
    },
  });
}

/** Store the chatbot's outbound reply in the brain so conversation history is complete. */
async function createOutboxPage(
  brainId: string,
  fromPhone: string,
  inboundMessageId: string,
  replyText: string,
  intentKind: string,
): Promise<void> {
  const slug = `legal/chat/whatsapp-outbox/${safeSlugPart(inboundMessageId)}`;
  await putPage(brainId, {
    slug,
    title: `WhatsApp Reply zu ${inboundMessageId}`,
    type: "chat_outbox",
    content: replyText.slice(0, 3900),
    frontmatter: {
      type: "chat_outbox",
      provider: "whatsapp",
      in_reply_to: inboundMessageId,
      to_phone_hash: phoneHash(fromPhone),
      tenant_brain_id: brainId,
      direction: "outbound",
      message_type: "text",
      sent_at: new Date().toISOString(),
      status: "sent",
      intent: intentKind,
    },
  });
}

async function createMediaInboxPage(ctx: MediaChatContext, media: StoredWhatsAppMedia): Promise<void> {
  const slug = `legal/chat/whatsapp-media/${safeSlugPart(ctx.messageId)}`;
  await putPage(ctx.sender.brainId, {
    slug,
    title: `WhatsApp ${media.kind}: ${media.filename}`,
    type: "chat_inbox",
    content: ctx.caption || `[${media.kind}] ${media.filename}`,
    frontmatter: {
      type: "chat_inbox",
      provider: "whatsapp",
      message_id: ctx.messageId,
      from_phone_hash: phoneHash(ctx.fromPhone),
      from_user_id: ctx.sender.userId,
      from_name: ctx.sender.name,
      tenant_brain_id: ctx.sender.brainId,
      direction: "inbound",
      message_type: media.kind,
      received_at: new Date().toISOString(),
      status: "received",
      intent: "media_upload",
      caption: ctx.caption,
      media,
    },
  });
}

async function createMediaVaultPage(ctx: MediaChatContext, media: StoredWhatsAppMedia, target?: BrainPage | null): Promise<string> {
  const slug = `legal/documents/whatsapp/${safeSlugPart(media.sha256.slice(0, 16))}`;
  await putPage(ctx.sender.brainId, {
    slug,
    title: media.filename,
    type: "legal_document",
    content: [
      `WhatsApp-${media.kind} von ${ctx.sender.name || "erlaubtem Sender"}.`,
      ctx.caption ? `Beschriftung: ${ctx.caption}` : "",
      target ? `Zugeordnet zu Akte: ${target.title}` : "Noch keiner Akte zugeordnet.",
      `Speicherpfad: ${media.storagePath}`,
    ].filter(Boolean).join("\n"),
    frontmatter: {
      type: "legal_document",
      source: "whatsapp",
      document_kind: media.kind,
      case_slug: target?.slug,
      case_title: target?.title,
      uploaded_by: ctx.sender.name,
      uploaded_at: new Date().toISOString(),
      caption: ctx.caption,
      storage_provider: media.storageProvider,
      storage_path: media.storagePath,
      filename: media.filename,
      mime_type: media.mimeType,
      size: media.sizeBytes,
      sha256: media.sha256,
      whatsapp_media_id: media.mediaId,
      tags: ["whatsapp", media.kind, ...(target ? ["akte"] : ["unzugeordnet"])],
    },
  });
  return slug;
}

async function attachMediaToCase(ctx: MediaChatContext, casePage: BrainPage, media: StoredWhatsAppMedia, documentSlug: string): Promise<void> {
  const caseFm = fm(casePage);
  const documents = Array.isArray(caseFm.documents) ? caseFm.documents : [];
  const audit = Array.isArray(caseFm.audit_log) ? caseFm.audit_log : [];
  await putPage(ctx.sender.brainId, {
    slug: casePage.slug,
    title: casePage.title,
    content: casePage.content,
    frontmatter: {
      documents: [...documents, {
        id: randomUUID(),
        title: media.filename,
        slug: documentSlug,
        type: media.kind,
        source: "whatsapp",
        storage_path: media.storagePath,
        mime_type: media.mimeType,
        size: media.sizeBytes,
        uploaded_at: new Date().toISOString(),
      }],
      audit_log: [...audit, {
        id: randomUUID(),
        at: new Date().toISOString(),
        action: "updated",
        actor: ctx.sender.name || "WhatsApp",
        field: "documents",
        note: `WhatsApp-${media.kind} gespeichert: ${media.filename}`,
      }],
    },
    merge: true,
  });
}

async function createPendingAction(ctx: ChatContext, intent: Extract<ParsedIntent, { kind: "time_entry" | "expense" | "case_note" | "task" | "deadline" | "create_case" | "close_case" | "create_invoice" | "mark_done" }>, target?: BrainPage): Promise<string> {
  const id = randomUUID();
  const slug = `legal/chat/actions/${id}`;
  const title =
    intent.kind === "time_entry" ? "Zeitbuchung bestätigen"
    : intent.kind === "expense" ? "Auslage bestätigen"
    : intent.kind === "case_note" ? "Aktennotiz bestätigen"
    : intent.kind === "task" ? "Aufgabe bestätigen"
    : intent.kind === "deadline" ? "Frist bestätigen"
    : intent.kind === "create_case" ? "Neue Akte bestätigen"
    : intent.kind === "close_case" ? "Akte abschließen bestätigen"
    : intent.kind === "create_invoice" ? "Rechnung bestätigen"
    : "Erledigt markieren bestätigen";
  await putPage(ctx.sender.brainId, {
    slug,
    title,
    type: "chat_action",
    content: ctx.text,
    frontmatter: {
      type: "chat_action",
      provider: "whatsapp",
      message_id: ctx.messageId,
      from_phone_hash: phoneHash(ctx.fromPhone),
      from_user_id: ctx.sender.userId,
      from_name: ctx.sender.name,
      intent: intent.kind,
      status: "pending_confirmation",
      target_slug: target?.slug ?? "",
      payload: intent,
      created_at: new Date().toISOString(),
      expires_at: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
    },
  });
  return slug;
}

async function findLatestPendingAction(ctx: ChatContext): Promise<BrainPage | null> {
  const pages = await listPages(ctx.sender.brainId, "chat_action", 100);
  const senderHash = phoneHash(ctx.fromPhone);
  return pages
    .filter((page) => {
      const front = fm(page);
      return front.provider === "whatsapp" && front.from_phone_hash === senderHash && front.status === "pending_confirmation";
    })
    .sort((a, b) => new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime())[0] ?? null;
}

async function markAction(ctx: ChatContext, action: BrainPage, status: string, error?: string): Promise<void> {
  await putPage(ctx.sender.brainId, {
    slug: action.slug,
    title: action.title,
    type: "chat_action",
    frontmatter: {
      status,
      processed_at: new Date().toISOString(),
      ...(error ? { error } : {}),
    },
    merge: true,
  });
}

async function executeAction(ctx: ChatContext, action: BrainPage): Promise<string> {
  const front = fm(action);
  const targetSlug = str(front.target_slug);
  const payload = front.payload as Record<string, unknown> | undefined;
  if (!payload) throw new Error("pending action incomplete");

  // create_case doesn't have a target case yet — it creates one
  if (front.intent === "create_case") {
    const clientName = str(payload.clientName);
    const opponentName = str(payload.opponentName);
    const legalArea = str(payload.legalArea) || "civil";
    const description = str(payload.description);
    const caseNumber = `2026-${String(Date.now()).slice(-4)}`;
    const caseSlug = `legal/cases/${caseNumber}`;
    const legalAreaLabels: Record<string, string> = {
      family: "Familienrecht", civil: "Zivilrecht", criminal: "Strafrecht",
      labor: "Arbeitsrecht", commercial: "Handelsrecht", tax: "Steuerrecht",
      administrative: "Verwaltungsrecht", ip: "Gewerblicher Rechtsschutz",
    };
    const title = opponentName ? `${clientName} vs. ${opponentName}` : clientName;
    await putPage(ctx.sender.brainId, {
      slug: caseSlug,
      title,
      type: "legal_case",
      content: description ? `## Sachverhalt\n\n${description}` : "",
      frontmatter: {
        type: "legal_case",
        case_number: caseNumber,
        client_name: clientName,
        opponent_name: opponentName,
        legal_area: legalArea,
        legal_area_label: legalAreaLabels[legalArea] || legalArea,
        status: "intake",
        created_via: "whatsapp",
        created_at: new Date().toISOString(),
        time_entries: [],
        expenses: [],
        tasks: [],
        deadlines: [],
        documents: [],
        notes: [],
        audit_log: [{
          id: randomUUID(),
          at: new Date().toISOString(),
          action: "created",
          actor: ctx.sender.name || "WhatsApp",
          note: "Akte via WhatsApp angelegt",
        }],
      },
    });
    await markAction(ctx, action, "executed");
    return [
      `✅ Neue Akte angelegt:`,
      `Aktenzeichen: ${caseNumber}`,
      `Titel: ${title}`,
      `Rechtsgebiet: ${legalAreaLabels[legalArea] || legalArea}`,
      description ? `Sachverhalt: ${description}` : "",
      "",
      `Zeit/Auslagen/Notizen jetzt mit "akt ${caseNumber}" buchen.`,
    ].filter(Boolean).join("\n");
  }

  // close_case needs the target case
  if (front.intent === "close_case") {
    if (!targetSlug) throw new Error("close_case: no target case");
    const casePage = await getPage(ctx.sender.brainId, targetSlug);
    const caseFm = fm(casePage);
    const audit = Array.isArray(caseFm.audit_log) ? caseFm.audit_log : [];
    await putPage(ctx.sender.brainId, {
      slug: casePage.slug,
      title: casePage.title,
      type: "legal_case",
      frontmatter: {
        status: "closed",
        closed_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        audit_log: [...audit, {
          id: randomUUID(),
          at: new Date().toISOString(),
          action: "closed",
          actor: ctx.sender.name || "WhatsApp",
          note: "Akte via WhatsApp abgeschlossen",
        }],
      },
      merge: true,
    });
    await markAction(ctx, action, "executed");
    return `✅ Akte "${casePage.title}" wurde abgeschlossen und archiviert.`;
  }

  // create_invoice needs the target case
  if (front.intent === "create_invoice") {
    if (!targetSlug) throw new Error("create_invoice: no target case");
    const casePage = await getPage(ctx.sender.brainId, targetSlug);
    const caseFm = fm(casePage);
    const amount = Number(payload.amount) || 0;
    const description = str(payload.description) || "Rechnung via WhatsApp";
    const invoiceId = `INV-${Date.now()}`;
    const invoiceSlug = `legal/invoices/${invoiceId}`;
    const caseNumber = str(caseFm.case_number);
    const mwst = amount * 0.19;
    const total = amount + mwst;
    await putPage(ctx.sender.brainId, {
      slug: invoiceSlug,
      title: `Rechnung ${invoiceId} — ${casePage.title}`,
      type: "invoice",
      content: `## Rechnung\n\n**Aktenzeichen:** ${caseNumber}\n**Leistung:** ${description}\n**Netto:** ${amount.toFixed(2)} EUR\n**MwSt (19%):** ${mwst.toFixed(2)} EUR\n**Brutto:** ${total.toFixed(2)} EUR`,
      frontmatter: {
        type: "invoice",
        invoice_id: invoiceId,
        case_slug: casePage.slug,
        case_title: casePage.title,
        case_number: caseNumber,
        client_name: str(caseFm.client_name),
        net_amount: amount,
        mwst,
        total,
        status: "draft",
        description,
        created_via: "whatsapp",
        created_at: new Date().toISOString(),
      },
    });
    const audit = Array.isArray(caseFm.audit_log) ? caseFm.audit_log : [];
    const invoices = Array.isArray(caseFm.invoices) ? caseFm.invoices : [];
    await putPage(ctx.sender.brainId, {
      slug: casePage.slug,
      title: casePage.title,
      type: "legal_case",
      frontmatter: {
        invoices: [...invoices, { invoice_id: invoiceId, slug: invoiceSlug, total, status: "draft" }],
        audit_log: [...audit, {
          id: randomUUID(),
          at: new Date().toISOString(),
          action: "updated",
          actor: ctx.sender.name || "WhatsApp",
          field: "invoices",
          note: `Rechnung ${invoiceId} über ${total.toFixed(2)} EUR via WhatsApp erstellt`,
        }],
      },
      merge: true,
    });
    await markAction(ctx, action, "executed");
    return [
      `✅ Rechnung erstellt:`,
      `Rechnungsnummer: ${invoiceId}`,
      `Akte: ${casePage.title}`,
      `Netto: ${amount.toFixed(2)} EUR`,
      `MwSt (19%): ${mwst.toFixed(2)} EUR`,
      `Brutto: ${total.toFixed(2)} EUR`,
      `Status: Entwurf (im Dashboard finalisieren)`,
    ].join("\n");
  }

  // All remaining intents require a target case
  if (!targetSlug) throw new Error("pending action incomplete: no target case");
  const casePage = await getPage(ctx.sender.brainId, targetSlug);
  const caseFm = fm(casePage);

  if (front.intent === "mark_done") {
    const itemType = str(payload.itemType) === "deadline" ? "deadlines" : "tasks";
    const query = str(payload.query).toLowerCase();
    const items = Array.isArray(caseFm[itemType]) ? caseFm[itemType] as Array<Record<string, unknown>> : [];
    const matchIdx = items.findIndex((item) => {
      const title = str(item.title).toLowerCase() || str(item.description).toLowerCase();
      return title.includes(query);
    });
    if (matchIdx === -1) {
      await markAction(ctx, action, "failed", "item not found");
      return `Kein Treffer mehr in "${casePage.title}" — evtl. bereits erledigt.`;
    }
    items[matchIdx].done = true;
    items[matchIdx].status = "done";
    items[matchIdx].completed_at = new Date().toISOString();
    const audit = Array.isArray(caseFm.audit_log) ? caseFm.audit_log : [];
    await putPage(ctx.sender.brainId, {
      slug: casePage.slug,
      title: casePage.title,
      type: "legal_case",
      frontmatter: {
        [itemType]: items,
        updated_at: new Date().toISOString(),
        audit_log: [...audit, {
          id: randomUUID(),
          at: new Date().toISOString(),
          action: "updated",
          actor: ctx.sender.name || "WhatsApp",
          field: itemType,
          note: `${itemType === "deadlines" ? "Frist" : "Aufgabe"} via WhatsApp als erledigt markiert: ${str(items[matchIdx].title) || str(items[matchIdx].description)}`,
        }],
      },
      merge: true,
    });
    await markAction(ctx, action, "executed");
    const doneTitle = str(items[matchIdx].title) || str(items[matchIdx].description) || str(payload.query);
    return `✅ ${itemType === "deadlines" ? "Frist" : "Aufgabe"} "${doneTitle}" in "${casePage.title}" als erledigt markiert.`;
  }

  if (front.intent === "time_entry") {
    const entry = {
      id: randomUUID(),
      description: str(payload.description) || "Zeiterfassung via WhatsApp",
      minutes: Number(payload.minutes) || 0,
      date: new Date().toISOString(),
      billable: payload.billable !== false,
      billed: false,
      lawyer: ctx.sender.name,
      activity_type: inferActivityType(str(payload.description)),
      note: "Erfasst via WhatsApp",
      source: "whatsapp",
    };
    const current = Array.isArray(caseFm.time_entries) ? caseFm.time_entries : [];
    const audit = Array.isArray(caseFm.audit_log) ? caseFm.audit_log : [];
    await putPage(ctx.sender.brainId, {
      slug: casePage.slug,
      title: casePage.title,
      content: casePage.content,
      frontmatter: {
        time_entries: [...current, entry],
        audit_log: [...audit, {
          id: randomUUID(),
          at: new Date().toISOString(),
          action: "updated",
          actor: ctx.sender.name || "WhatsApp",
          field: "time_entries",
          note: `Zeit via WhatsApp erfasst: ${entry.minutes} Minuten`,
        }],
      },
      merge: true,
    });
    await markAction(ctx, action, "executed");
    return `Gespeichert: ${entry.minutes} min zu ${casePage.title}.`;
  }

  if (front.intent === "case_note") {
    const note = str(payload.note);
    const noteSlug = `legal/notes/${safeSlugPart(casePage.slug)}/${Date.now()}`;
    await putPage(ctx.sender.brainId, {
      slug: noteSlug,
      title: `Notiz: ${casePage.title}`,
      type: "case_note",
      content: note,
      frontmatter: {
        type: "case_note",
        case_slug: casePage.slug,
        case_title: casePage.title,
        source: "whatsapp",
        author: ctx.sender.name,
        created_at: new Date().toISOString(),
      },
    });
    const audit = Array.isArray(caseFm.audit_log) ? caseFm.audit_log : [];
    await putPage(ctx.sender.brainId, {
      slug: casePage.slug,
      title: casePage.title,
      content: casePage.content,
      frontmatter: {
        audit_log: [...audit, {
          id: randomUUID(),
          at: new Date().toISOString(),
          action: "updated",
          actor: ctx.sender.name || "WhatsApp",
          field: "notes",
          note: `Notiz via WhatsApp gespeichert: ${noteSlug}`,
        }],
      },
      merge: true,
    });
    await markAction(ctx, action, "executed");
    return `Gespeichert: Notiz zu ${casePage.title}.`;
  }

  if (front.intent === "expense") {
    const amount = Number(payload.amount) || 0;
    const description = str(payload.description) || "Auslage via WhatsApp";
    const current = Array.isArray(caseFm.expenses) ? caseFm.expenses : [];
    const audit = Array.isArray(caseFm.audit_log) ? caseFm.audit_log : [];
    const expense = {
      id: randomUUID(),
      description,
      amount,
      currency: "EUR",
      date: new Date().toISOString().slice(0, 10),
      billable: payload.billable !== false,
      billed: false,
      category: inferExpenseCategory(description),
      note: "Erfasst via WhatsApp",
      source: "whatsapp",
    };
    await putPage(ctx.sender.brainId, {
      slug: casePage.slug,
      title: casePage.title,
      content: casePage.content,
      frontmatter: {
        expenses: [...current, expense],
        audit_log: [...audit, {
          id: randomUUID(),
          at: new Date().toISOString(),
          action: "updated",
          actor: ctx.sender.name || "WhatsApp",
          field: "expenses",
          note: `Auslage via WhatsApp erfasst: ${amount.toFixed(2)} EUR ${description}`,
        }],
      },
      merge: true,
    });
    await markAction(ctx, action, "executed");
    return `Gespeichert: Auslage ${amount.toFixed(2)} EUR zu ${casePage.title}.`;
  }

  if (front.intent === "task") {
    const title = str(payload.title);
    const current = Array.isArray(caseFm.tasks) ? caseFm.tasks : [];
    const audit = Array.isArray(caseFm.audit_log) ? caseFm.audit_log : [];
    const task = {
      id: randomUUID(),
      text: payload.dueDate ? `${title} (bis ${String(payload.dueDate)})` : title,
      done: false,
      createdAt: new Date().toISOString(),
      source: "whatsapp",
    };
    await putPage(ctx.sender.brainId, {
      slug: casePage.slug,
      title: casePage.title,
      content: casePage.content,
      frontmatter: {
        tasks: [...current, task],
        audit_log: [...audit, {
          id: randomUUID(),
          at: new Date().toISOString(),
          action: "updated",
          actor: ctx.sender.name || "WhatsApp",
          field: "tasks",
          note: `Aufgabe via WhatsApp angelegt: ${title}`,
        }],
      },
      merge: true,
    });
    await markAction(ctx, action, "executed");
    return `Gespeichert: Aufgabe zu ${casePage.title}.`;
  }

  if (front.intent === "deadline") {
    const current = Array.isArray(caseFm.deadlines) ? caseFm.deadlines : [];
    const audit = Array.isArray(caseFm.audit_log) ? caseFm.audit_log : [];
    const deadline = {
      id: randomUUID(),
      title: str(payload.title) || "Frist",
      description: str(payload.title) || "Frist",
      due_date: str(payload.dueDate),
      date: str(payload.dueDate),
      status: "pending",
      type: "deadline",
      source: "whatsapp",
      review_status: "unreviewed",
      created_at: new Date().toISOString(),
    };
    await putPage(ctx.sender.brainId, {
      slug: casePage.slug,
      title: casePage.title,
      content: casePage.content,
      frontmatter: {
        deadlines: [...current, deadline],
        audit_log: [...audit, {
          id: randomUUID(),
          at: new Date().toISOString(),
          action: "updated",
          actor: ctx.sender.name || "WhatsApp",
          field: "deadlines",
          note: `Frist via WhatsApp angelegt: ${deadline.title} ${deadline.due_date}`,
        }],
      },
      merge: true,
    });
    await markAction(ctx, action, "executed");
    return `Gespeichert: Frist ${deadline.due_date} zu ${casePage.title}. Bitte im Fristenkalender fachlich prüfen.`;
  }

  throw new Error(`unsupported action intent: ${String(front.intent)}`);
}

async function think(brainId: string, query: string): Promise<string> {
  const res = await fetch(`${ENGINE_URL}/api/think`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...engineHeadersForBrain(brainId),
    },
    body: JSON.stringify({ query, mode: "conservative" }),
  });
  if (!res.ok) throw new Error(`Brain-Q&A fehlgeschlagen: HTTP ${res.status}`);
  const contentType = res.headers.get("Content-Type") || "";
  if (!contentType.includes("text/event-stream")) {
    const data = await res.json() as { answer?: string };
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

function summarizeCase(casePage: BrainPage): string {
  const front = fm(casePage);
  const deadlines = Array.isArray(front.deadlines) ? front.deadlines as Array<Record<string, unknown>> : [];
  const tasks = Array.isArray(front.tasks) ? front.tasks as Array<Record<string, unknown>> : [];
  const times = Array.isArray(front.time_entries) ? front.time_entries as Array<Record<string, unknown>> : [];
  const openTasks = tasks.filter((task) => task.done !== true);
  const nextDeadlines = deadlines
    .map((deadline) => ({
      title: str(deadline.title) || str(deadline.description) || "Frist",
      date: str(deadline.due_date) || str(deadline.date),
    }))
    .filter((deadline) => deadline.date)
    .sort((a, b) => a.date.localeCompare(b.date))
    .slice(0, 3);
  const openMinutes = times
    .filter((entry) => entry.billable !== false && !entry.billed)
    .reduce((sum, entry) => sum + (Number(entry.minutes) || 0), 0);

  return [
    `Akte: ${casePage.title}`,
    `AZ: ${str(front.case_number) || casePage.slug}`,
    `Status: ${str(front.status) || "unbekannt"}`,
    `Mandant: ${str(front.client_name) || "nicht gesetzt"}`,
    `Gegner: ${str(front.opponent_name) || "nicht gesetzt"}`,
    `Offene Aufgaben: ${openTasks.length}`,
    `Offene abrechenbare Zeit: ${openMinutes} min`,
    nextDeadlines.length ? `Nächste Fristen: ${nextDeadlines.map((d) => `${d.date} ${d.title}`).join("; ")}` : "Nächste Fristen: keine",
    casePage.content ? `Kurzsachverhalt: ${casePage.content.slice(0, 500)}` : "",
  ].filter(Boolean).join("\n");
}

function inferActivityType(description: string): string {
  const lower = description.toLowerCase();
  if (lower.includes("telefon") || lower.includes("call")) return "Telefonat";
  if (lower.includes("termin") || lower.includes("besprech")) return "Besprechung";
  if (lower.includes("email") || lower.includes("e-mail")) return "E-Mail";
  if (lower.includes("gericht") || lower.includes("verhandlung")) return "Gericht";
  return "Bearbeitung";
}

function inferExpenseCategory(description: string): string {
  const lower = description.toLowerCase();
  if (lower.includes("fahrt") || lower.includes("km") || lower.includes("taxi") || lower.includes("zug")) return "Fahrtkosten";
  if (lower.includes("gericht")) return "Gerichtskosten";
  if (lower.includes("kopie") || lower.includes("druck")) return "Kopien";
  if (lower.includes("porto") || lower.includes("post")) return "Porto";
  return "Auslage";
}

async function invoiceStatus(brainId: string, casePage: BrainPage): Promise<string> {
  const front = fm(casePage);
  const times = Array.isArray(front.time_entries) ? front.time_entries as Array<Record<string, unknown>> : [];
  const expenses = Array.isArray(front.expenses) ? front.expenses as Array<Record<string, unknown>> : [];
  const openTimes = times.filter((entry) => entry.billable !== false && !entry.billed);
  const openExpenses = expenses.filter((entry) => entry.billable !== false && !entry.billed);
  const minutes = openTimes.reduce((sum, entry) => sum + (Number(entry.minutes) || 0), 0);
  const expensesTotal = openExpenses.reduce((sum, entry) => sum + (Number(entry.amount) || 0), 0);

  const invoices = await listPages(brainId, "invoice", 100);
  const caseNumber = str(front.case_number);
  const relevantInvoices = invoices.filter((invoice) => {
    const invFm = fm(invoice);
    return str(invFm.case_number) === caseNumber || (Array.isArray(invFm.case_slugs) && invFm.case_slugs.includes(casePage.slug));
  });
  const openInvoiceTotal = relevantInvoices
    .filter((invoice) => {
      const status = str(fm(invoice).status);
      return status === "sent" || status === "overdue";
    })
    .reduce((sum, invoice) => sum + (Number(fm(invoice).total) || 0), 0);

  return [
    `${casePage.title}:`,
    `Offene Zeit: ${minutes} min (${openTimes.length} Eintrag/Eintraege).`,
    `Offene Auslagen: ${expensesTotal.toFixed(2)} EUR (${openExpenses.length} Eintrag/Eintraege).`,
    `Offene Rechnungen: ${openInvoiceTotal.toFixed(2)} EUR (${relevantInvoices.length} Rechnung/en im Brain).`,
  ].join("\n");
}

/** Fetch recent conversation context for this sender (last 5 messages, both inbound and outbound). */
async function getRecentContext(brainId: string, fromPhone: string): Promise<string[]> {
  try {
    const senderHash = phoneHash(fromPhone);
    const [inbound, outbound] = await Promise.all([
      listPages(brainId, "chat_inbox", 50),
      listPages(brainId, "chat_outbox", 50),
    ]);
    const all = [
      ...inbound.map((page) => ({ page, dir: "inbound" as const, ts: str(fm(page).received_at) })),
      ...outbound.map((page) => ({ page, dir: "outbound" as const, ts: str(fm(page).sent_at) })),
    ];
    return all
      .filter((entry) => {
        const front = fm(entry.page);
        const hash = str(front.from_phone_hash) || str(front.to_phone_hash);
        return hash === senderHash;
      })
      .sort((a, b) => new Date(b.ts || 0).getTime() - new Date(a.ts || 0).getTime())
      .slice(0, 5)
      .map((entry) => {
        const prefix = entry.dir === "outbound" ? "[Bot]" : "[Anwalt]";
        return `${prefix} ${entry.page.content || ""}`;
      });
  } catch {
    return [];
  }
}

export async function handleLegalChatMessage(ctx: ChatContext): Promise<string> {
  const intent = parseIntent(ctx.text);
  await createInboxPage(ctx, intent).catch((err) => {
    console.warn("[legal-chat] inbox write failed:", err instanceof Error ? err.message : String(err));
  });

  const reply = await processIntent(ctx, intent);

  // Log outbound reply in brain so conversation history is complete (both directions)
  if (reply) {
    await createOutboxPage(ctx.sender.brainId, ctx.fromPhone, ctx.messageId, reply, intent.kind).catch((err) => {
      console.warn("[legal-chat] outbox write failed:", err instanceof Error ? err.message : String(err));
    });
  }

  return reply;
}

async function processIntent(ctx: ChatContext, intent: ParsedIntent): Promise<string> {

  if (intent.kind === "help") {
    return [
      "Kanzlei OS WhatsApp-Befehle:",
      "",
      "📋 Akten:",
      "  akten — alle Akten auflisten",
      "  akt 2026-014 — Aktenzusammenfassung anzeigen",
      "  neue akte Müller vs. Schmidt Familienrecht — Akte anlegen",
      "  status akt 2026-014 — Offene Kosten/Auslagen",
      "  zusammenfassung akt 2026-014 — Akten-Überblick",
      "  verlauf akt 2026-014 — Aktivitäten/Verlauf der Akte",
      "  dokument akt 2026-014: klage — Dokument suchen & senden",
      "  suche Müller — alle Akten durchsuchen",
      "  abschließen akt 2026-014 — Akte archivieren",
      "",
      "👤 Mandanten:",
      "  neuer mandant Thomas Müller +49 170 1234567 — anlegen",
      "",
      "⏱️ Erfassen:",
      "  zeit 20m akt 2026-014 telefonat mit mandant",
      "  auslage akt 2026-014: 12,50 eur kopien",
      "  notiz akt 2026-014: gegner bietet 8000 eur",
      "  notiz: Müller angerufen, bittet Rückruf — ohne Akte",
      "  aufgabe akt 2026-014: klageentwurf prüfen bis 2026-07-01",
      "  frist akt 2026-014: Berufung 2026-07-01",
      "  erledigt akt 2026-014: klageentwurf — als erledigt markieren",
      "  rechnung akt 2026-014: 2500 eur für Klageentwurf",
      "",
      "🔍 Abfragen:",
      "  heute — was steht heute an (Fristen + Aufgaben)",
      "  aufgaben — alle offenen Aufgaben",
      "  fristen — alle offenen Fristen",
      "  finanzen — finanzielle Übersicht (offene Zeit, Auslagen, Rechnungen)",
      "  frist berechnen zpo-berufung 2026-03-15 BY",
      "  rvg 50000 — RVG-Kosten berechnen",
      "  konflikt Müller — Konflikt-Check",
      "",
      "🧠 Brain:",
      "  frage: was weißt du über Müller Vergleich?",
      "  Oder einfach freie Frage — ich antworte aus dem Brain",
      "",
      "📎 Medien:",
      "  PDF/Foto/Audio mit `akt 2026-014` → Vault + Aktenzuordnung",
      "  Standort/Kontakt senden → im Brain gespeichert",
      "  👍 = bestätigen, 👎 = verwerfen, ❤️ = speichern",
      "",
      "Antwort JA speichert die zuletzt erkannte Aktion.",
      "Antwort NEIN verwirft die zuletzt erkannte Aktion.",
    ].join("\n");
  }

  if (intent.kind === "confirm") {
    const action = await findLatestPendingAction(ctx);
    if (!action) return "Keine offene Aktion zum Speichern gefunden.";
    try {
      return await executeAction(ctx, action);
    } catch (err) {
      await markAction(ctx, action, "failed", err instanceof Error ? err.message : String(err));
      return `Speichern fehlgeschlagen: ${err instanceof Error ? err.message : "Unbekannter Fehler"}`;
    }
  }

  if (intent.kind === "cancel") {
    const action = await findLatestPendingAction(ctx);
    if (!action) return "Keine offene Aktion zum Verwerfen gefunden.";
    await markAction(ctx, action, "cancelled");
    return "Verworfen. Die zuletzt erkannte Aktion wurde nicht gespeichert.";
  }

  if (intent.kind === "time_entry" || intent.kind === "expense" || intent.kind === "case_note") {
    if (intent.kind === "expense" && !intent.caseRef) return "Zu welcher Akte soll ich die Auslage speichern? Bitte z.B. `auslage akt 2026-014: 12,50 eur kopien` senden.";
    const target = await resolveCase(ctx.sender.brainId, intent.caseRef);
    if (!target) return caseLookupHelp(ctx.sender.brainId, intent.caseRef);
    await createPendingAction(ctx, intent, target);
    if (intent.kind === "time_entry") {
      return `Erkannt: ${intent.minutes} min zu "${target.title}" als ${intent.billable ? "abrechenbar" : "nicht abrechenbar"}. Antworte mit JA zum Speichern.`;
    }
    if (intent.kind === "expense") {
      return `Erkannt: Auslage ${intent.amount.toFixed(2)} EUR zu "${target.title}" als ${intent.billable ? "abrechenbar" : "nicht abrechenbar"}. Antworte mit JA zum Speichern.`;
    }
    return `Erkannt: Notiz zu "${target.title}". Antworte mit JA zum Speichern.`;
  }

  if (intent.kind === "task" || intent.kind === "deadline") {
    if (!intent.caseRef) return `Zu welcher Akte soll ich ${intent.kind === "task" ? "die Aufgabe" : "die Frist"} speichern? Bitte z.B. "akt 2026-014" angeben.`;
    const target = await resolveCase(ctx.sender.brainId, intent.caseRef);
    if (!target) return caseLookupHelp(ctx.sender.brainId, intent.caseRef);
    await createPendingAction(ctx, intent, target);
    if (intent.kind === "task") {
      return `Erkannt: Aufgabe zu "${target.title}": ${intent.title}${intent.dueDate ? ` bis ${intent.dueDate}` : ""}. Antworte mit JA zum Speichern.`;
    }
    return `Erkannt: Frist zu "${target.title}": ${intent.title} am ${intent.dueDate}. Antworte mit JA zum Speichern.`;
  }

  if (intent.kind === "invoice_status") {
    const target = await resolveCase(ctx.sender.brainId, intent.caseRef);
    if (!target) return caseLookupHelp(ctx.sender.brainId, intent.caseRef);
    return invoiceStatus(ctx.sender.brainId, target);
  }

  if (intent.kind === "case_summary") {
    const target = await resolveCase(ctx.sender.brainId, intent.caseRef);
    if (!target) return caseLookupHelp(ctx.sender.brainId, intent.caseRef);
    return summarizeCase(target);
  }

  if (intent.kind === "brain_query") {
    const recentMessages = await getRecentContext(ctx.sender.brainId, ctx.fromPhone);
    const contextPrefix = recentMessages.length > 0
      ? `[Kontext: Letzte Nachrichten von diesem Anwalt — ${recentMessages.slice(0, 3).join(" | ")}]\n\n`
      : "";
    const answer = await think(ctx.sender.brainId, `${contextPrefix}${intent.query}`);
    return answer.slice(0, 3500);
  }

  if (intent.kind === "rvg_calc") {
    const result = calculateRvg(intent.streitwert);
    return [
      `RVG 2025 Berechnung — Streitwert: ${result.streitwert.toLocaleString("de-DE")} EUR`,
      `Basisgebühr: ${result.basisGebuehr.toFixed(2)} EUR`,
      `Verfahrensgebühr (1,3): ${result.verfahrensgebuehr.toFixed(2)} EUR`,
      `Terminsgebühr (1,2): ${result.terminsgebuehr.toFixed(2)} EUR`,
      `Einigungsgebühr (1,0): ${result.einigungsgebuehr.toFixed(2)} EUR`,
      `Auslagenpauschale: ${result.auslagenpauschale.toFixed(2)} EUR`,
      `Summe netto: ${result.summeNetto.toFixed(2)} EUR`,
      `MwSt (19%): ${result.mwst.toFixed(2)} EUR`,
      `Summe brutto: ${result.summeBrutto.toFixed(2)} EUR`,
    ].join("\n");
  }

  if (intent.kind === "deadline_calc") {
    const rule = DEADLINE_RULES.find((r) => r.key === intent.ruleKey);
    if (!rule) {
      const available = DEADLINE_RULES.map((r) => r.key).join(", ");
      return `Unbekannte Fristregel: ${intent.ruleKey}. Verfügbare Regeln: ${available}`;
    }
    const land = intent.bundesland as Bundesland;
    const result = calculateDeadline(rule, intent.startDate, land);
    return [
      `Fristberechnung: ${rule.label}`,
      `Startdatum: ${intent.startDate}`,
      `Bundesland: ${intent.bundesland}`,
      `Enddatum: ${result.date}`,
      `Hinweis: ${result.calculation_note || "Bitte im Fristenkalender fachlich prüfen."}`,
    ].join("\n");
  }

  if (intent.kind === "conflict_check") {
    // Query the conflict-check API
    try {
      const res = await fetch(`${ENGINE_URL}/api/legal/conflict-check`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...engineHeadersForBrain(ctx.sender.brainId),
        },
        body: JSON.stringify({ name: intent.name, caseRef: intent.caseRef }),
      });
      if (!res.ok) throw new Error(`Conflict-Check HTTP ${res.status}`);
      const data = await res.json() as { conflicts?: Array<{ case_title: string; case_slug: string; reason: string; severity: string }>; clean?: boolean };
      if (data.conflicts && data.conflicts.length > 0) {
        return [
          `⚠️ Konflikt gefunden für "${intent.name}":`,
          ...data.conflicts.map((c) => `• ${c.case_title} (${c.severity}): ${c.reason}`),
        ].join("\n");
      }
      return `✅ Kein Konflikt gefunden für "${intent.name}".`;
    } catch (err) {
      return `Konflikt-Check fehlgeschlagen: ${err instanceof Error ? err.message : "Unbekannter Fehler"}`;
    }
  }

  if (intent.kind === "document_fetch") {
    if (!intent.caseRef) return "Zu welcher Akte soll ich Dokumente suchen? Bitte z.B. `dokument akt 2026-014: klage` senden.";
    const target = await resolveCase(ctx.sender.brainId, intent.caseRef);
    if (!target) return caseLookupHelp(ctx.sender.brainId, intent.caseRef);
    const caseFm = fm(target);
    const documents = Array.isArray(caseFm.documents) ? caseFm.documents as Array<Record<string, unknown>> : [];
    if (documents.length === 0) return `Keine Dokumente in Akte "${target.title}" gefunden.`;
    const needle = intent.query.toLowerCase();
    const matches = documents.filter((doc) => {
      const title = str(doc.title).toLowerCase();
      const filename = str(doc.filename).toLowerCase();
      return title.includes(needle) || filename.includes(needle);
    });
    if (matches.length === 0) {
      return [
        `Keine Dokumente in "${target.title}" passend zu "${intent.query}".`,
        `Verfügbare Dokumente: ${documents.map((d) => str(d.title)).join(", ")}`,
      ].join("\n");
    }
    // Single match → try to send the document directly via WhatsApp
    if (matches.length === 1) {
      const doc = matches[0];
      const docUrl = str(doc.url) || str(doc.link);
      const docFilename = str(doc.filename) || str(doc.title) || "dokument";
      if (docUrl) {
        try {
          const { sendWhatsAppMedia } = await import("@/lib/whatsapp/send");
          await sendWhatsAppMedia(ctx.fromPhone, {
            type: "document",
            link: docUrl,
            filename: docFilename,
            caption: `📄 ${str(doc.title)} aus Akte "${target.title}"`,
          });
          return `📄 Dokument "${str(doc.title)}" wurde gesendet.`;
        } catch (err) {
          return `📄 ${str(doc.title)} — Download: ${docUrl}\n(Versand fehlgeschlagen: ${err instanceof Error ? err.message : "unbekannt"})`;
        }
      }
      // No public URL — return path info
      return `📄 ${str(doc.title)} — Pfad: ${str(doc.storage_path) || "nicht verfügbar"}\n(Dokument ist im Vault gespeichert, aber kein öffentlicher Link vorhanden.)`;
    }
    return matches.map((doc) => `📄 ${str(doc.title)} — ${str(doc.storage_path) || str(doc.url) || "kein Pfad"}`).join("\n");
  }

  if (intent.kind === "list_cases") {
    const pages = await listPages(ctx.sender.brainId, "legal_case", 50);
    if (pages.length === 0) return "Keine Akten im Brain gefunden.";
    return [
      "Akten im Brain:",
      ...pages.map((page) => {
        const front = fm(page);
        const caseNumber = str(front.case_number);
        const status = str(front.status);
        return `• ${caseNumber || page.slug}: ${page.title}${status ? ` [${status}]` : ""}`;
      }),
    ].join("\n");
  }

  if (intent.kind === "case_lookup") {
    const target = await resolveCase(ctx.sender.brainId, intent.caseRef);
    if (!target) return caseLookupHelp(ctx.sender.brainId, intent.caseRef);
    return summarizeCase(target);
  }

  if (intent.kind === "list_tasks") {
    const cases = await listPages(ctx.sender.brainId, "legal_case", 100);
    const allTasks: Array<{ caseTitle: string; title: string; dueDate?: string; done: boolean }> = [];
    for (const page of cases) {
      const front = fm(page);
      const tasks = Array.isArray(front.tasks) ? front.tasks as Array<Record<string, unknown>> : [];
      for (const task of tasks) {
        const done = task.done === true || task.status === "done";
        const dueDate = str(task.due_date) || str(task.dueDate) || undefined;
        allTasks.push({
          caseTitle: page.title,
          title: str(task.title) || str(task.description) || "Aufgabe",
          dueDate,
          done,
        });
      }
    }
    const open = allTasks.filter((t) => !t.done);
    if (open.length === 0) return "Keine offenen Aufgaben. Alles erledigt! ✅";
    open.sort((a, b) => (a.dueDate || "9999").localeCompare(b.dueDate || "9999"));
    return [
      `Offene Aufgaben (${open.length}):`,
      ...open.slice(0, 20).map((t) =>
        `• ${t.dueDate ? `${t.dueDate} — ` : ""}${t.title} (${t.caseTitle})`,
      ),
    ].join("\n");
  }

  if (intent.kind === "list_deadlines") {
    const cases = await listPages(ctx.sender.brainId, "legal_case", 100);
    const allDeadlines: Array<{ caseTitle: string; title: string; date: string; done: boolean }> = [];
    for (const page of cases) {
      const front = fm(page);
      const deadlines = Array.isArray(front.deadlines) ? front.deadlines as Array<Record<string, unknown>> : [];
      for (const d of deadlines) {
        const done = d.status === "done" || d.done === true;
        const date = str(d.due_date) || str(d.date);
        if (!date) continue;
        allDeadlines.push({
          caseTitle: page.title,
          title: str(d.title) || str(d.description) || "Frist",
          date,
          done,
        });
      }
    }
    const open = allDeadlines.filter((d) => !d.done);
    if (open.length === 0) return "Keine offenen Fristen. Alles erledigt! ✅";
    open.sort((a, b) => a.date.localeCompare(b.date));
    const today = new Date().toISOString().slice(0, 10);
    return [
      `Offene Fristen (${open.length}):`,
      ...open.slice(0, 20).map((d) => {
        const isOverdue = d.date < today;
        return `${isOverdue ? "🔴" : "•"} ${d.date} — ${d.title} (${d.caseTitle})`;
      }),
    ].join("\n");
  }

  if (intent.kind === "today") {
    const cases = await listPages(ctx.sender.brainId, "legal_case", 100);
    const today = new Date().toISOString().slice(0, 10);
    const inDays = (days: number) => {
      const d = new Date();
      d.setDate(d.getDate() + days);
      return d.toISOString().slice(0, 10);
    };
    const todayItems: string[] = [];
    const next7Days: string[] = [];

    for (const page of cases) {
      const front = fm(page);
      const deadlines = Array.isArray(front.deadlines) ? front.deadlines as Array<Record<string, unknown>> : [];
      const tasks = Array.isArray(front.tasks) ? front.tasks as Array<Record<string, unknown>> : [];

      for (const d of deadlines) {
        const date = str(d.due_date) || str(d.date);
        if (!date || d.status === "done" || d.done === true) continue;
        const label = `⚖️ ${date} — ${str(d.title) || "Frist"} (${page.title})`;
        if (date <= today) todayItems.push(`🔴 ${label}`);
        else if (date <= inDays(7)) next7Days.push(label);
      }

      for (const t of tasks) {
        if (t.done === true || t.status === "done") continue;
        const dueDate = str(t.due_date) || str(t.dueDate);
        const label = `📋 ${dueDate ? `${dueDate} — ` : ""}${str(t.title) || "Aufgabe"} (${page.title})`;
        if (dueDate && dueDate <= today) todayItems.push(`🔴 ${label}`);
        else if (!dueDate || dueDate <= inDays(7)) next7Days.push(label);
      }
    }

    if (todayItems.length === 0 && next7Days.length === 0) {
      return "Heute steht nichts an. Ruhe Tag! ☕";
    }

    const parts: string[] = [];
    if (todayItems.length > 0) {
      parts.push(`🔥 Heute / überfällig:`);
      parts.push(...todayItems.slice(0, 10));
    }
    if (next7Days.length > 0) {
      if (parts.length > 0) parts.push("");
      parts.push(`📅 Diese Woche:`);
      parts.push(...next7Days.slice(0, 10));
    }
    return parts.join("\n");
  }

  if (intent.kind === "mark_done") {
    if (!intent.caseRef) return "Zu welcher Akte soll ich etwas als erledigt markieren? Beispiel: `erledigt akt 2026-014: klageentwurf`.";
    const target = await resolveCase(ctx.sender.brainId, intent.caseRef);
    if (!target) return caseLookupHelp(ctx.sender.brainId, intent.caseRef);
    const front = fm(target);
    const listKey = intent.itemType === "deadline" ? "deadlines" : "tasks";
    const items = Array.isArray(front[listKey]) ? front[listKey] as Array<Record<string, unknown>> : [];
    const needle = intent.query.toLowerCase();
    const matchIdx = items.findIndex((item) => {
      const title = str(item.title).toLowerCase() || str(item.description).toLowerCase();
      return title.includes(needle);
    });
    if (matchIdx === -1) {
      const available = items.map((i) => str(i.title) || str(i.description)).filter(Boolean).join(", ");
      return `Keine ${intent.itemType === "deadline" ? "Frist" : "Aufgabe"} in "${target.title}" passend zu "${intent.query}" gefunden.${available ? ` Verfügbar: ${available}` : ""}`;
    }
    const itemTitle = str(items[matchIdx].title) || str(items[matchIdx].description) || intent.query;
    await createPendingAction(ctx, intent, target);
    return `Erkannt: ${intent.itemType === "deadline" ? "Frist" : "Aufgabe"} "${itemTitle}" in "${target.title}" als erledigt markieren. Antworte mit JA zum Bestätigen.`;
  }

  if (intent.kind === "search") {
    const cases = await listPages(ctx.sender.brainId, "legal_case", 100);
    const needle = intent.query.toLowerCase();
    const hits: Array<{ caseTitle: string; caseNumber: string; snippet: string }> = [];
    for (const page of cases) {
      const front = fm(page);
      const caseNumber = str(front.case_number);
      const searchText = [
        page.title,
        page.content || "",
        str(front.client_name),
        str(front.opponent_name),
        str(front.legal_area_label),
        str(front.description),
      ].join(" ").toLowerCase();
      if (searchText.includes(needle)) {
        const contentSnippet = (page.content || "").slice(0, 200);
        hits.push({ caseTitle: page.title, caseNumber, snippet: contentSnippet });
      }
    }
    if (hits.length === 0) return `Keine Akte gefunden, die "${intent.query}" enthält.`;
    return [
      `🔍 "${intent.query}" — ${hits.length} Treffer:`,
      ...hits.slice(0, 10).map((h) =>
        `• ${h.caseNumber || "?"}: ${h.caseTitle}${h.snippet ? `\n  ${h.snippet}...` : ""}`,
      ),
    ].join("\n");
  }

  if (intent.kind === "financial_overview") {
    const cases = await listPages(ctx.sender.brainId, "legal_case", 100);
    let totalMinutes = 0;
    let totalExpenses = 0;
    let totalInvoiced = 0;
    let openCases = 0;
    for (const page of cases) {
      const front = fm(page);
      if (str(front.status) === "closed" || str(front.status) === "archived") continue;
      openCases++;
      const times = Array.isArray(front.time_entries) ? front.time_entries as Array<Record<string, unknown>> : [];
      const expenses = Array.isArray(front.expenses) ? front.expenses as Array<Record<string, unknown>> : [];
      for (const t of times) {
        if (t.billable !== false && !t.billed) totalMinutes += Number(t.minutes) || 0;
      }
      for (const e of expenses) {
        if (e.billable !== false && !e.billed) totalExpenses += Number(e.amount) || 0;
      }
    }
    // Also sum invoices
    const invoices = await listPages(ctx.sender.brainId, "invoice", 100);
    for (const inv of invoices) {
      const front = fm(inv);
      if (str(front.status) === "paid") {
        totalInvoiced += Number(front.total) || 0;
      }
    }
    return [
      "📊 Finanzielle Übersicht:",
      `Offene Akten: ${openCases}`,
      `Offene abrechenbare Zeit: ${totalMinutes} min (${(totalMinutes / 60).toFixed(1)} h)`,
      `Offene Auslagen: ${totalExpenses.toFixed(2)} EUR`,
      `Bezahlte Rechnungen (gesamt): ${totalInvoiced.toFixed(2)} EUR`,
      "",
      "Pro Akte: `status akt 2026-014`",
    ].join("\n");
  }

  if (intent.kind === "case_activity") {
    const target = await resolveCase(ctx.sender.brainId, intent.caseRef);
    if (!target) return caseLookupHelp(ctx.sender.brainId, intent.caseRef);
    const front = fm(target);
    const times = Array.isArray(front.time_entries) ? front.time_entries as Array<Record<string, unknown>> : [];
    const expenses = Array.isArray(front.expenses) ? front.expenses as Array<Record<string, unknown>> : [];
    const tasks = Array.isArray(front.tasks) ? front.tasks as Array<Record<string, unknown>> : [];
    const deadlines = Array.isArray(front.deadlines) ? front.deadlines as Array<Record<string, unknown>> : [];
    const notes = Array.isArray(front.notes) ? front.notes as Array<Record<string, unknown>> : [];

    const allEvents: Array<{ date: string; type: string; text: string }> = [];

    for (const t of times) {
      allEvents.push({ date: str(t.date) || str(t.created_at) || "", type: "⏱️", text: `${str(t.minutes)} min: ${str(t.description)}` });
    }
    for (const e of expenses) {
      allEvents.push({ date: str(e.date) || str(e.created_at) || "", type: "💰", text: `${Number(e.amount || 0).toFixed(2)} EUR: ${str(e.description)}` });
    }
    for (const n of notes) {
      allEvents.push({ date: str(n.date) || str(n.created_at) || "", type: "📝", text: str(n.text) || str(n.note) || str(n.content) || "" });
    }
    for (const t of tasks) {
      allEvents.push({ date: str(t.created_at) || str(t.due_date) || "", type: t.done ? "✅" : "📋", text: str(t.title) });
    }
    for (const d of deadlines) {
      allEvents.push({ date: str(d.created_at) || str(d.due_date) || str(d.date) || "", type: d.status === "done" || d.done ? "✅" : "⚖️", text: str(d.title) });
    }

    allEvents.sort((a, b) => b.date.localeCompare(a.date));

    if (allEvents.length === 0) return `Keine Aktivitäten in Akte "${target.title}" gefunden.`;

    return [
      `📜 Verlauf "${target.title}":`,
      ...allEvents.slice(0, 20).map((e) => `${e.type} ${e.date ? `${e.date} — ` : ""}${e.text}`),
    ].join("\n");
  }

  if (intent.kind === "create_case") {
    const legalAreaLabels: Record<string, string> = {
      family: "Familienrecht", civil: "Zivilrecht", criminal: "Strafrecht",
      labor: "Arbeitsrecht", commercial: "Handelsrecht", tax: "Steuerrecht",
      administrative: "Verwaltungsrecht", ip: "Gewerblicher Rechtsschutz",
    };
    const title = intent.opponentName
      ? `${intent.clientName} vs. ${intent.opponentName}`
      : intent.clientName;
    await createPendingAction(ctx, intent);
    return [
      `Erkannt: Neue Akte anlegen`,
      `Titel: ${title}`,
      `Rechtsgebiet: ${legalAreaLabels[intent.legalArea] || intent.legalArea}`,
      intent.description ? `Sachverhalt: ${intent.description}` : "",
      `Antworte mit JA zum Anlegen.`,
    ].filter(Boolean).join("\n");
  }

  if (intent.kind === "create_client") {
    const clientId = `client-${Date.now()}`;
    const clientSlug = `legal/clients/${clientId}`;
    try {
      await putPage(ctx.sender.brainId, {
        slug: clientSlug,
        title: intent.name,
        type: "client",
        content: intent.note || "",
        frontmatter: {
          type: "client",
          client_id: clientId,
          name: intent.name,
          phone: intent.phone || "",
          email: intent.email || "",
          created_via: "whatsapp",
          created_at: new Date().toISOString(),
        },
      });
    } catch (err) {
      return `Fehler beim Anlegen des Mandanten: ${err instanceof Error ? err.message : "unbekannt"}`;
    }
    return [
      `✅ Neuer Mandant angelegt:`,
      `Name: ${intent.name}`,
      intent.phone ? `Telefon: ${intent.phone}` : "",
      intent.email ? `E-Mail: ${intent.email}` : "",
      "",
      `Akten für diesen Mandanten anlegen: "neue akte ${intent.name} vs. ..."`,
    ].filter(Boolean).join("\n");
  }

  if (intent.kind === "close_case") {
    const target = await resolveCase(ctx.sender.brainId, intent.caseRef);
    if (!target) return caseLookupHelp(ctx.sender.brainId, intent.caseRef);
    await createPendingAction(ctx, intent, target);
    return `Erkannt: Akte "${target.title}" abschließen und archivieren. Antworte mit JA zum Bestätigen.`;
  }

  if (intent.kind === "create_invoice") {
    if (!intent.caseRef) return "Zu welcher Akte soll ich die Rechnung erstellen? Beispiel: `rechnung akt 2026-014: 2500 eur für Klageentwurf`.";
    const target = await resolveCase(ctx.sender.brainId, intent.caseRef);
    if (!target) return caseLookupHelp(ctx.sender.brainId, intent.caseRef);
    const mwst = intent.amount * 0.19;
    const total = intent.amount + mwst;
    await createPendingAction(ctx, intent, target);
    return [
      `Erkannt: Rechnung für "${target.title}"`,
      `Leistung: ${intent.description}`,
      `Netto: ${intent.amount.toFixed(2)} EUR`,
      `MwSt (19%): ${mwst.toFixed(2)} EUR`,
      `Brutto: ${total.toFixed(2)} EUR`,
      `Antworte mit JA zum Erstellen.`,
    ].join("\n");
  }

  if (intent.kind === "standalone_note") {
    const noteId = randomUUID();
    const noteSlug = `legal/notes/standalone/${noteId}`;
    try {
      await putPage(ctx.sender.brainId, {
        slug: noteSlug,
        title: `Notiz: ${intent.note.slice(0, 60)}`,
        type: "note",
        content: intent.note,
        frontmatter: {
          type: "note",
          note_id: noteId,
          author: ctx.sender.name,
          source: "whatsapp",
          created_at: new Date().toISOString(),
        },
      });
    } catch (err) {
      return `Fehler beim Speichern der Notiz: ${err instanceof Error ? err.message : "unbekannt"}`;
    }
    return `📝 Notiz gespeichert: "${intent.note.slice(0, 80)}${intent.note.length > 80 ? "..." : ""}"`;
  }

  if (intent.kind === "free_text") {
    // Treat unrecognized input as a natural language question to the brain
    const recentMessages = await getRecentContext(ctx.sender.brainId, ctx.fromPhone);
    const contextPrefix = recentMessages.length > 0
      ? `[Kontext: Letzte Nachrichten — ${recentMessages.slice(0, 3).join(" | ")}]\n\n`
      : "";
    const answer = await think(ctx.sender.brainId, `${contextPrefix}${intent.text}`);
    return answer.slice(0, 3500);
  }

  if (intent.kind === "unknown") {
    return intent.message;
  }

  return "Unbekannter Befehl. Schreibe `hilfe` für alle Befehle.";
}

export async function handleLegalChatMedia(ctx: MediaChatContext, media: StoredWhatsAppMedia): Promise<string> {
  await createMediaInboxPage(ctx, media).catch((err) => {
    console.warn("[legal-chat] media inbox write failed:", err instanceof Error ? err.message : String(err));
  });

  let target: BrainPage | null = null;
  const caseRef = parseCaseRefFromText(ctx.caption || "");
  if (caseRef) target = await resolveCase(ctx.sender.brainId, caseRef);

  const documentSlug = await createMediaVaultPage(ctx, media, target);
  let reply: string;
  if (target) {
    await attachMediaToCase(ctx, target, media, documentSlug);
    reply = `Gespeichert: ${media.kind} "${media.filename}" wurde im Vault abgelegt und an "${target.title}" gehängt.`;
  } else if (caseRef) {
    const help = await caseLookupHelp(ctx.sender.brainId, caseRef);
    reply = `Gespeichert im Vault, aber nicht eindeutig zugeordnet.\n${help}`;
  } else {
    reply = `Gespeichert im Vault: ${media.kind} "${media.filename}". Für direkte Zuordnung beim Senden bitte Beschriftung mit Akte nutzen, z.B. "akt 2026-014".`;
  }

  // Log outbound reply in brain
  await createOutboxPage(ctx.sender.brainId, ctx.fromPhone, ctx.messageId, reply, "media_upload").catch((err) => {
    console.warn("[legal-chat] media outbox write failed:", err instanceof Error ? err.message : String(err));
  });

  return reply;
}
