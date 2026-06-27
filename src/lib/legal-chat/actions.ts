import { randomUUID } from "node:crypto";
import {
  ENGINE_URL,
  engineHeadersForBrain,
  engineHeadersForBrainWithMatterScope,
} from "@/lib/engine";
import type { BrainPage } from "@/lib/types";
import type { StoredWhatsAppMedia } from "@/lib/whatsapp/media";
import type { WhatsAppIdentity } from "@/lib/whatsapp/types";
import { phoneHash } from "@/lib/whatsapp/verify";
import { identityCanAccessMatter } from "@/lib/whatsapp/identity";
import { logAudit } from "@/lib/audit";
import { naturalWhatsAppReply } from "@/lib/whatsapp-natural-chat";
import { calculateRvg } from "@/lib/rvg";
import { calculateDeadline, DEADLINE_RULES, type Bundesland } from "@/lib/legal-deadlines";
import { collectSSEChunks } from "@/lib/sse-stream";

interface ChatContext {
  sender: WhatsAppIdentity;
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
  | { kind: "update_task"; caseRef: string; query: string; dueDate: string }
  | { kind: "delegate_task"; caseRef: string; query: string; assignee: string }
  | { kind: "update_deadline"; caseRef: string; query: string; dueDate: string }
  | { kind: "cancel_deadline"; caseRef: string; query: string }
  | { kind: "update_appointment"; caseRef: string; query: string; date: string; time: string }
  | { kind: "cancel_appointment"; caseRef: string; query: string }
  | { kind: "document_status"; caseRef: string }
  | { kind: "review_document"; caseRef: string; query: string; status: "confirmed" | "rejected" }
  | { kind: "bea_status" }
  | { kind: "datev_status" }
  | { kind: "search"; query: string }
  | { kind: "financial_overview" }
  | { kind: "case_activity"; caseRef: string }
  | {
      kind: "create_case";
      clientName: string;
      opponentName: string;
      legalArea: string;
      description: string;
    }
  | { kind: "create_client"; name: string; phone?: string; email?: string; note?: string }
  | { kind: "close_case"; caseRef: string }
  | { kind: "create_invoice"; caseRef: string; amount: number; description: string }
  | {
      kind: "appointment";
      caseRef: string;
      title: string;
      date: string;
      time: string;
      location?: string;
      reminderHours: number;
    }
  | { kind: "list_appointments" }
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
    signal: init?.signal ?? AbortSignal.timeout(30_000),
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

async function batchListPages(
  brainId: string,
  types: string[],
  limit = 200
): Promise<Record<string, BrainPage[]>> {
  const entries = await Promise.all(
    types.map(async (type) => [
      type,
      await listPages(brainId, type, limit).catch(() => [] as BrainPage[]),
    ] as const)
  );
  return Object.fromEntries(entries);
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
  return (
    input
      .toLowerCase()
      .normalize("NFKD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 80) || "item"
  );
}

export function parseIntent(text: string): ParsedIntent {
  const trimmed = text.trim();
  if (/^(ja|ok|okay|speichern|bestaetigen|bestätigen)$/i.test(trimmed)) return { kind: "confirm" };
  if (/^(nein|no|abbrechen|verwerfen|stopp|stop)$/i.test(trimmed)) return { kind: "cancel" };
  if (/^(hilfe|help|\?)$/i.test(trimmed)) return { kind: "help" };

  // Natural-language time entry: "30 Minuten für Müller telefoniert", "1,5h akt 2026-014 Recherche"
  const minutesMatch = trimmed.match(/(\d+(?:[,.]\d+)?)\s*(h|std|stunden|m|min|minute|minuten)\b/i);
  if (minutesMatch) {
    const raw = parseFloat(minutesMatch[1].replace(",", "."));
    const unit = minutesMatch[2].toLowerCase();
    const minutes = Math.max(
      1,
      Math.round(
        unit.startsWith("h") || unit.startsWith("std") || unit.startsWith("stunde") ? raw * 60 : raw
      )
    );
    const caseMatch = trimmed.match(/\b(?:akt|akte|az|aktenzeichen)\s+([A-Za-z0-9\-\/_.]+)/i);
    const caseRef = (caseMatch?.[1] ?? "").trim();
    const description =
      trimmed
        .replace(minutesMatch[0], "")
        .replace(caseMatch?.[0] ?? "", "")
        .replace(/^\s*zeit\s*/i, "")
        .replace(/\bfür\b/gi, "")
        .replace(/\bhabe\s+(?:ich\s+)?/gi, "")
        .replace(/\bgearbeitet\b/gi, "")
        .replace(/\btelefoniert\b/gi, "Telefonat")
        .replace(/\bgemailt\b/gi, "E-Mail")
        .replace(/\bgeschrieben\b/gi, "Schriftsatz")
        .replace(/\brecherchiert\b/gi, "Recherche")
        .trim() || "Zeiterfassung via WhatsApp";
    return caseRef
      ? {
          kind: "time_entry",
          minutes,
          caseRef,
          description,
          billable: !/\bnicht\s+abrechenbar\b/i.test(trimmed),
        }
      : { kind: "free_text", text: trimmed };
  }

  // Natural-language expense: "12,50 Euro für Kopien ausgelegt", "Auslage akt 2026-014: 45 EUR Fahrtkosten", "spesen akt 2026-014: 25,00", "kosten akt 2026-014: 50€ gerichtskosten", "kosten 50000"
  // Triggers on explicit expense keywords (auslage/spesen/kosten) or the word "ausgelegt".
  const expenseKeywordMatch = trimmed.match(
    /^(?:auslage|kosten|spesen)\s+(?:(?:akt|akte)\s+([^:]+):\s*)?(.+)$/i
  );
  const naturalExpenseMatch = /\bausgelegt\b/i.test(trimmed);
  if (expenseKeywordMatch || naturalExpenseMatch) {
    // With an explicit keyword (auslage/spesen/kosten), a plain number is enough.
    // Search inside the body (after the case ref) so the case number itself is not mistaken for the amount.
    // Natural-language "ausgelegt" still requires a currency marker to avoid matching random numbers.
    const searchSpace = expenseKeywordMatch ? expenseKeywordMatch[2] : trimmed;
    const amountRegex = expenseKeywordMatch
      ? /(\d+(?:[,.]\d{1,2})?)\s*(?:euro|eur|€)?/i
      : /(\d+(?:[,.]\d{1,2})?)\s*(?:euro|eur|€)/i;
    const amountMatch = searchSpace.match(amountRegex);
    if (!amountMatch) {
      return { kind: "free_text", text: trimmed };
    }
    const amount = Math.max(0, Number.parseFloat(amountMatch[1].replace(",", ".")));
    const body = expenseKeywordMatch ? expenseKeywordMatch[2].trim() : trimmed;
    const description =
      body
        .replace(amountMatch[0], "")
        .replace(/\b(euro|eur|€)\b/gi, "")
        .replace(/\bausgelegt\b/gi, "")
        .replace(/\bfür\b/gi, "")
        .replace(/\bhabe\s+(?:ich\s+)?/gi, "")
        .replace(/^\s*[:,-]\s*/, "")
        .trim() || "Auslage via WhatsApp";
    return {
      kind: "expense",
      amount,
      caseRef: (expenseKeywordMatch?.[1] ?? "").trim(),
      description,
      billable: !/\bnicht\s+abrechenbar\b/i.test(trimmed),
    };
  }

  const noteMatch = trimmed.match(/^notiz\s+(?:zu\s+)?(?:(?:akt|akte)\s+)?([^:]+):\s*(.+)$/i);
  if (noteMatch) {
    return { kind: "case_note", caseRef: noteMatch[1].trim(), note: noteMatch[2].trim() };
  }

  const statusMatch = trimmed.match(
    /^(?:status|abrechnung|offen(?!e\s+abrechnung|\s+abrechenbar))\s+(?:zu\s+)?(?:(?:akt|akte)\s+)?(.+)$/i
  );
  if (statusMatch) return { kind: "invoice_status", caseRef: statusMatch[1].trim() };

  // 'offen abrechenbar akt X' / 'offene abrechnung akt X' → invoice_status (checked separately to avoid statusMatch swallowing 'abrechenbar' as caseRef)
  if (/^offen(?:e\s+abrechnung|\s+abrechenbar)\s+(?:akt|akte)\s+/i.test(trimmed)) {
    const caseMatch = trimmed.match(/\b(?:akt|akte)\s+([^,;:\n]+)/i);
    if (caseMatch) return { kind: "invoice_status", caseRef: caseMatch[1].trim() };
  }

  // Deadline calculation: "frist berechnen berufung ab 2026-03-15 BY" or "berechne frist zpo-berufung 15.03.2026"
  // Must be checked BEFORE the deadline/task matchers to avoid being swallowed
  const deadlineCalcMatch = trimmed.match(
    /^(?:frist|deadline)\s+berechnen\s+([a-z-]+)\s+(?:ab\s+)?(\d{4}-\d{2}-\d{2}|\d{1,2}\.\d{1,2}\.\d{2,4})(?:\s+([A-Z]{2,3}))?/i
  );
  if (deadlineCalcMatch) {
    return {
      kind: "deadline_calc",
      ruleKey: deadlineCalcMatch[1].toLowerCase(),
      startDate: normalizeDate(deadlineCalcMatch[2]),
      bundesland: (deadlineCalcMatch[3] || "BY").toUpperCase(),
    };
  }

  const updateTaskMatch = trimmed.match(
    /^(?:aufgabe|task)\s+(?:verschieben|ändern|aendern)\s+(?:(?:akt|akte)\s+([^:]+):\s*)?(.+?)\s+(?:auf|bis|am)\s+(\d{4}-\d{2}-\d{2}|\d{1,2}\.\d{1,2}\.\d{2,4})$/i
  );
  if (updateTaskMatch) {
    return {
      kind: "update_task",
      caseRef: (updateTaskMatch[1] ?? "").trim(),
      query: updateTaskMatch[2].trim(),
      dueDate: normalizeDate(updateTaskMatch[3]),
    };
  }

  const delegateTaskMatch = trimmed.match(
    /^(?:aufgabe|task)\s+(?:delegieren|zuweisen)\s+(?:(?:akt|akte)\s+([^:]+):\s*)?(.+?)\s+(?:an|zu)\s+(.+)$/i
  );
  if (delegateTaskMatch) {
    return {
      kind: "delegate_task",
      caseRef: (delegateTaskMatch[1] ?? "").trim(),
      query: delegateTaskMatch[2].trim(),
      assignee: delegateTaskMatch[3].trim(),
    };
  }

  const updateDeadlineMatch = trimmed.match(
    /^(?:frist|deadline)\s+(?:verschieben|ändern|aendern)\s+(?:(?:akt|akte)\s+([^:]+):\s*)?(.+?)\s+(?:auf|bis|am)\s+(\d{4}-\d{2}-\d{2}|\d{1,2}\.\d{1,2}\.\d{2,4})$/i
  );
  if (updateDeadlineMatch) {
    return {
      kind: "update_deadline",
      caseRef: (updateDeadlineMatch[1] ?? "").trim(),
      query: updateDeadlineMatch[2].trim(),
      dueDate: normalizeDate(updateDeadlineMatch[3]),
    };
  }

  const cancelDeadlineMatch = trimmed.match(
    /^(?:frist|deadline)\s+(?:streichen|stornieren|löschen|loeschen|absagen)\s+(?:(?:akt|akte)\s+([^:]+):\s*)?(.+)$/i
  );
  if (cancelDeadlineMatch) {
    return {
      kind: "cancel_deadline",
      caseRef: (cancelDeadlineMatch[1] ?? "").trim(),
      query: cancelDeadlineMatch[2].trim(),
    };
  }

  const updateAppointmentMatch = trimmed.match(
    /^(?:termin|gerichtstermin|verhandlung|besprechung)\s+(?:verschieben|ändern|aendern)\s+(?:(?:akt|akte)\s+([^:]+):\s*)?(.+?)\s+(?:auf|am)\s+(\d{4}-\d{2}-\d{2}|\d{1,2}\.\d{1,2}\.\d{2,4})\s+(\d{1,2}[:.]\d{2})$/i
  );
  if (updateAppointmentMatch) {
    const timeRaw = updateAppointmentMatch[4].replace(".", ":");
    return {
      kind: "update_appointment",
      caseRef: (updateAppointmentMatch[1] ?? "").trim(),
      query: updateAppointmentMatch[2].trim(),
      date: normalizeDate(updateAppointmentMatch[3]),
      time: timeRaw.length === 4 ? `0${timeRaw}` : timeRaw,
    };
  }

  const cancelAppointmentMatch = trimmed.match(
    /^(?:termin|gerichtstermin|verhandlung|besprechung)\s+(?:absagen|stornieren|löschen|loeschen)\s+(?:(?:akt|akte)\s+([^:]+):\s*)?(.+)$/i
  );
  if (cancelAppointmentMatch) {
    return {
      kind: "cancel_appointment",
      caseRef: (cancelAppointmentMatch[1] ?? "").trim(),
      query: cancelAppointmentMatch[2].trim(),
    };
  }

  const documentStatusMatch = trimmed.match(
    /^(?:unterlagen|dokumente?|document)\s+(?:status|stand)\s+(?:(?:akt|akte)\s+)?(.+)$/i
  );
  if (documentStatusMatch) {
    return { kind: "document_status", caseRef: documentStatusMatch[1].trim() };
  }

  if (/^(?:bea|beA|bea\s+eingang|bea\s+status|posteingang)$/i.test(trimmed)) {
    return { kind: "bea_status" };
  }

  if (/^(?:datev|datev\s+status|datev\s+export|steuerberater)$/i.test(trimmed)) {
    return { kind: "datev_status" };
  }

  const reviewDocumentMatch = trimmed.match(
    /^(?:dokument|unterlage)\s+(?:geprüft|geprueft|freigeben|ablehnen)\s+(?:(?:akt|akte)\s+([^:]+):\s*)?(.+)$/i
  );
  if (reviewDocumentMatch) {
    const negative = /(?:ablehnen|abgelehnt)/i.test(trimmed);
    return {
      kind: "review_document",
      caseRef: (reviewDocumentMatch[1] ?? "").trim(),
      query: reviewDocumentMatch[2].trim(),
      status: negative ? "rejected" : "confirmed",
    };
  }

  // Mark task/deadline as done: "erledigt akt 2026-014: klageentwurf" or "aufgabe erledigt akt X: ..."
  // Must be checked BEFORE the deadline/task matchers to avoid being swallowed
  const doneMatch = trimmed.match(
    /^(?:(aufgabe|frist|task|deadline)\s+)?erledigt\s+(?:(?:akt|akte)\s+([^:]+):\s*)?(.+)$/i
  );
  if (doneMatch) {
    const itemType =
      doneMatch[1]?.toLowerCase().startsWith("frist") ||
      doneMatch[1]?.toLowerCase().startsWith("deadline")
        ? "deadline"
        : "task";
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
    const dateMatch = taskText.match(
      /\b(?:bis|am)\s+(\d{4}-\d{2}-\d{2}|\d{1,2}\.\d{1,2}\.\d{2,4})\b/i
    );
    return {
      kind: "task",
      caseRef: (taskMatch[1] ?? "").trim(),
      title: taskText.replace(dateMatch?.[0] ?? "", "").trim(),
      dueDate: dateMatch ? normalizeDate(dateMatch[1]) : undefined,
    };
  }

  // Appointment: "termin akt 2026-014: 15.07.2026 14:00 LG München Verhandlung"
  // Must be checked before the generic deadline matcher, which also accepts "termin".
  const appointmentMatch = trimmed.match(
    /^(?:termin|gerichtstermin|verhandlung|besprechung)\s+(?:(?:akt|akte)\s+([^:]+):\s*)?(\d{1,2}\.\d{1,2}\.\d{2,4})\s+(\d{1,2}[:.]\d{2})\s*(.*)$/i
  );
  if (appointmentMatch) {
    const caseRef = (appointmentMatch[1] ?? "").trim();
    const dateStr = normalizeDate(appointmentMatch[2]);
    const timeRaw = appointmentMatch[3].replace(".", ":");
    const time = timeRaw.length === 4 ? `0${timeRaw}` : timeRaw;
    const rest = (appointmentMatch[4] ?? "").trim();
    return {
      kind: "appointment",
      caseRef,
      title: rest || "Termin",
      date: dateStr,
      time,
      location: undefined,
      reminderHours: 24,
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
      title:
        body
          .replace(dateMatch[0], "")
          .replace(/\b(am|bis)\b/gi, "")
          .trim() || "Frist",
      dueDate: normalizeDate(dateMatch[1]),
    };
  }

  const summaryMatch =
    trimmed.match(/^(?:akte|akt)\s+(.+?)\s+(?:zusammenfassung|summary|überblick|ueberblick)$/i) ??
    trimmed.match(/^(?:zusammenfassung|summary|überblick|ueberblick)\s+(?:(?:akt|akte)\s+)?(.+)$/i);
  if (summaryMatch) return { kind: "case_summary", caseRef: summaryMatch[1].trim() };

  const queryMatch = trimmed.match(/^(?:frage|suche|wissen|brain)\s*[: ]\s*(.+)$/i);
  if (queryMatch) return { kind: "brain_query", query: queryMatch[1].trim() };

  // RVG fee calculation: "rvg 50000" or "kosten 50000" or "streitwert 50000"
  // Handles: 50000, 50.000, 50.000,00, 1234,56
  const rvgMatch = trimmed.match(
    /^(?:rvg|kosten|streitwert|gebühren|gebuehren)\s+(?:berechnen\s+)?([\d.,]+)\s*(?:eur|euro|€)?/i
  );
  if (rvgMatch) {
    // Parse German number format: remove thousand separators (.), convert decimal comma (,) to dot
    const cleaned = rvgMatch[1].replace(/\./g, "").replace(",", ".");
    const streitwert = Number.parseFloat(cleaned);
    if (Number.isFinite(streitwert) && streitwert > 0) return { kind: "rvg_calc", streitwert };
  }

  // Conflict check: "konflikt Müller" or "konflikt-check Müller akt 2026-014"
  const conflictMatch = trimmed.match(
    /^(?:konflikt|conflict|konflikt-check)\s+(.+?)(?:\s+(?:akt|akte)\s+(\S+))?$/i
  );
  if (conflictMatch) {
    return {
      kind: "conflict_check",
      name: conflictMatch[1].trim(),
      caseRef: conflictMatch[2]?.trim(),
    };
  }

  // Document fetch: "dokument akt 2026-014: klage" or "hole dokument akt 2026-014 vertrag"
  const docMatch = trimmed.match(
    /^(?:hole\s+)?(?:dokument|dokumente|unterlagen)\s+(?:(?:akt|akte)\s+([^:]+):\s*)?(.+)$/i
  );
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
  if (
    /^(?:aufgaben|offene\s+aufgaben|todos|offene\s+todos|was\s+ist\s+zu\s+tun|to[-\s]?do)$/i.test(
      trimmed
    )
  ) {
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
    /^(?:neue\s+akte|neuer\s+fall|neue\s+sache|akte\s+anlegen|fall\s+anlegen)\s+(.+)$/i
  );
  if (createCaseMatch) {
    const body = createCaseMatch[1].trim();
    // Try to parse "Mandant vs. Gegner Rechtsgebiet Beschreibung"
    const vsMatch = body.match(
      /^(.+?)\s+(?:vs\.?|gegen)\s+(.+?)(?:\s+(Familienrecht|Zivilrecht|Strafrecht|Arbeitsrecht|Handelsrecht|Steuerrecht|Verwaltungsrecht|Gewerblicher\s+Rechtsschutz)(?:\s+(.*))?)?\s*$/i
    );
    if (vsMatch) {
      const legalAreaMap: Record<string, string> = {
        familienrecht: "family",
        zivilrecht: "civil",
        strafrecht: "criminal",
        arbeitsrecht: "labor",
        handelsrecht: "commercial",
        steuerrecht: "tax",
        verwaltungsrecht: "administrative",
        "gewerblicher rechtsschutz": "ip",
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
    /^(?:abschließen|abschliessen|schließen|schliessen|beenden|archivieren)\s+(?:(?:akt|akte|fall)\s+)?(.+)$/i
  );
  if (closeCaseMatch2) {
    return { kind: "close_case", caseRef: closeCaseMatch2[1].trim() };
  }

  // Also: "akte beenden 2026-014" or "fall abschließen X" (noun-first)
  const closeCaseMatchNoun = trimmed.match(
    /^(?:akte|fall)\s+(?:abschließen|abschliessen|schließen|schliessen|beenden|erledigt|archivieren)\s+(.+)$/i
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
  const nlCaseMatch =
    trimmed.match(
      /^(?:wie\s+ist\s+(?:der\s+)?status|was\s+ist\s+(?:mit|los\s+mit)|info)\s+(?:(?:akt|akte)\s+)?(.+)$/i
    ) ?? trimmed.match(/^zeig(?:e)?\s+mir\s+(?:akt|akte)\s+(.+)$/i);
  if (nlCaseMatch) {
    return { kind: "case_summary", caseRef: nlCaseMatch[1].trim() };
  }

  // Search across all cases: "suche Müller" or "finde Müller" or "wer ist Müller"
  const searchMatch = trimmed.match(/^(?:suche|finde|wer\s+ist|wo\s+ist)\s+(.+)$/i);
  if (searchMatch) {
    return { kind: "search", query: searchMatch[1].trim() };
  }

  // Financial overview: "offene kosten" / "umsatz" / "abrechnung" / "konto"
  if (
    /^(?:offene\s+kosten|umsatz|abrechnung|konto|finanzen|finanzielle\s+übersicht|finanzielle\s+ueberblick)$/i.test(
      trimmed
    )
  ) {
    return { kind: "financial_overview" };
  }

  // Case activity log: "verlauf akt 2026-014" or "historie akt 2026-014" or "aktivitäten akt X"
  const activityMatch = trimmed.match(
    /^(?:verlauf|historie|aktivitäten|aktivitaeten|log)\s+(?:(?:akt|akte)\s+)?(.+)$/i
  );
  if (activityMatch) {
    return { kind: "case_activity", caseRef: activityMatch[1].trim() };
  }

  // Create new client: "neuer mandant Thomas Müller" or "neuer klient ..."
  const createClientMatch = trimmed.match(
    /^(?:neuer\s+mandant|neuer\s+klient|neuer\s+kunde|mandant\s+anlegen)\s+(.+)$/i
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
    /^(?:rechnung|invoice)\s+(?:(?:akt|akte)\s+([^:]+):\s*)?(\d+(?:[.,]\d{1,2})?)\s*(?:eur|euro|€)?\s*(?:für\s+(.+))?$/i
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

  // List appointments: "termine" or "anstehende termine"
  if (/^(?:termine|anstehende\s+termine|kalender|terminkalender)$/i.test(trimmed)) {
    return { kind: "list_appointments" };
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

function itemLabel(item: Record<string, unknown>): string {
  return (
    str(item.title) ||
    str(item.description) ||
    str(item.text) ||
    str(item.filename) ||
    str(item.name) ||
    "Eintrag"
  );
}

function findItemIndex(items: Array<Record<string, unknown>>, query: string): number {
  const needle = query.toLowerCase();
  return items.findIndex((item) => itemLabel(item).toLowerCase().includes(needle));
}

function appendAudit(
  frontmatter: Record<string, unknown>,
  ctx: ChatContext,
  field: string,
  note: string
): Array<Record<string, unknown>> {
  const current = Array.isArray(frontmatter.audit_log)
    ? (frontmatter.audit_log as Array<Record<string, unknown>>)
    : [];
  return [
    ...current,
    {
      id: randomUUID(),
      at: new Date().toISOString(),
      action: "updated",
      actor: ctx.sender.name || "WhatsApp",
      field,
      note,
    },
  ];
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
      ]
        .join(" ")
        .toLowerCase();
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

/**
 * Same ambiguous-match helper as before, but candidates outside the sender's
 * `matterScope` are filtered out first (Paket 31 permission enforcement). This is
 * what keeps the leak guard from degrading: a sender must never learn that an
 * out-of-scope matter exists via the "did you mean…" disambiguation list either.
 */
async function caseLookupHelp(
  ctx: Pick<ChatContext, "sender" | "fromPhone">,
  caseRef: string
): Promise<string> {
  const all = await findCaseCandidates(ctx.sender.brainId, caseRef);
  const candidates = all
    .filter((c) => identityCanAccessMatter(ctx.sender, c.page.slug))
    .slice(0, 5);
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

/**
 * The single choke point for matter access from WhatsApp (P0-SECR-002 /
 * Paket 31 enforcement). Resolves a case reference AND enforces the sender's
 * `matterScope` in one step — callers never see `resolveCase` directly, so no
 * code path can read or write a matter the sender isn't scoped to.
 *
 * Deliberately indistinguishable from "not found": an out-of-scope match falls
 * through to the same `caseLookupHelp` (which itself filters by scope), so a
 * denied sender cannot tell whether the matter exists at all.
 */
async function resolveAuthorizedCase(
  ctx: Pick<ChatContext, "sender" | "fromPhone">,
  caseRef: string
): Promise<{ ok: true; page: BrainPage } | { ok: false; message: string }> {
  const target = await resolveCase(ctx.sender.brainId, caseRef);
  if (target && identityCanAccessMatter(ctx.sender, target.slug)) {
    return { ok: true, page: target };
  }
  if (target) {
    await logAudit("whatsapp.sender_denied", "whatsapp_identity", {
      brainId: ctx.sender.brainId,
      details: {
        phoneHash: phoneHash(ctx.fromPhone),
        caseSlug: target.slug,
        reason: "matter_scope",
      },
    });
  }
  return { ok: false, message: await caseLookupHelp(ctx, caseRef) };
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
  intentKind: string
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

async function createMediaInboxPage(
  ctx: MediaChatContext,
  media: StoredWhatsAppMedia
): Promise<void> {
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

async function createMediaVaultPage(
  ctx: MediaChatContext,
  media: StoredWhatsAppMedia,
  target?: BrainPage | null
): Promise<string> {
  const slug = `legal/documents/whatsapp/${safeSlugPart(media.sha256.slice(0, 16))}`;
  const hasCase = !!target;
  await putPage(ctx.sender.brainId, {
    slug,
    title: media.filename,
    type: "legal_document",
    content: [
      `WhatsApp-${media.kind} von ${ctx.sender.name || "erlaubtem Sender"}.`,
      ctx.caption ? `Beschriftung: ${ctx.caption}` : "",
      hasCase
        ? `Zugeordnet zu Akte: ${target!.title}`
        : "Wartet auf Akten-Zuordnung — Dokument ist gesperrt bis eine Akte zugewiesen wird.",
      `Speicherpfad: ${media.storagePath}`,
    ]
      .filter(Boolean)
      .join("\n"),
    frontmatter: {
      type: "legal_document",
      source: "whatsapp",
      document_kind: media.kind,
      case_slug: target?.slug,
      case_title: target?.title,
      assignment_status: hasCase ? "assigned" : "pending_assignment",
      analysis_status: hasCase ? "pending" : "blocked_until_assignment",
      extraction_status: "pending",
      review_status: "needs_review",
      review_required: true,
      analysis_source: "whatsapp_media",
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
      tags: ["whatsapp", media.kind, ...(hasCase ? ["akte"] : ["pending_assignment"])],
    },
  });
  return slug;
}

async function queueWhatsAppDocumentAnalysis(brainId: string, documentSlug: string): Promise<void> {
  const internalSecret = process.env.SUBSUMIO_INTERNAL_SECRET;
  const appUrlRaw = process.env.NEXT_PUBLIC_APP_URL || process.env.SUBSUMIO_APP_URL;
  if (!internalSecret || !appUrlRaw) return;

  const appUrl = appUrlRaw.startsWith("http") ? appUrlRaw : `https://${appUrlRaw}`;
  try {
    const currentPage = await getPage(brainId, documentSlug).catch(() => null);
    const title = currentPage?.title || "WhatsApp-Dokument";
    const res = await fetch(`${appUrl.replace(/\/$/, "")}/api/legal/analyze`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-internal-secret": internalSecret,
      },
      body: JSON.stringify({ document_slug: documentSlug, brain_id: brainId }),
    });
    await putPage(brainId, {
      slug: documentSlug,
      title,
      frontmatter: {
        analysis_status: res.ok ? "analyzed" : "failed",
        analyzed_at: res.ok ? new Date().toISOString() : undefined,
        analysis_failed_at: res.ok ? undefined : new Date().toISOString(),
        analysis_error: res.ok ? undefined : `HTTP ${res.status}`,
      },
      merge: true,
    });
  } catch (err) {
    const currentPage = await getPage(brainId, documentSlug).catch(() => null);
    await putPage(brainId, {
      slug: documentSlug,
      title: currentPage?.title || "WhatsApp-Dokument",
      frontmatter: {
        analysis_status: "failed",
        analysis_failed_at: new Date().toISOString(),
        analysis_error: err instanceof Error ? err.message : "analysis_request_failed",
      },
      merge: true,
    }).catch(() => {});
  }
}

async function attachMediaToCase(
  ctx: MediaChatContext,
  casePage: BrainPage,
  media: StoredWhatsAppMedia,
  documentSlug: string
): Promise<void> {
  const caseFm = fm(casePage);
  const documents = Array.isArray(caseFm.documents) ? caseFm.documents : [];
  const audit = Array.isArray(caseFm.audit_log) ? caseFm.audit_log : [];
  await putPage(ctx.sender.brainId, {
    slug: casePage.slug,
    title: casePage.title,
    content: casePage.content,
    frontmatter: {
      documents: [
        ...documents,
        {
          id: randomUUID(),
          title: media.filename,
          slug: documentSlug,
          type: media.kind,
          source: "whatsapp",
          storage_path: media.storagePath,
          mime_type: media.mimeType,
          size: media.sizeBytes,
          uploaded_at: new Date().toISOString(),
        },
      ],
      audit_log: [
        ...audit,
        {
          id: randomUUID(),
          at: new Date().toISOString(),
          action: "updated",
          actor: ctx.sender.name || "WhatsApp",
          field: "documents",
          note: `WhatsApp-${media.kind} gespeichert: ${media.filename}`,
        },
      ],
    },
    merge: true,
  });
}

async function createPendingAction(
  ctx: ChatContext,
  intent: Extract<
    ParsedIntent,
    {
      kind:
        | "time_entry"
        | "expense"
        | "case_note"
        | "task"
        | "deadline"
        | "create_case"
        | "close_case"
        | "create_invoice"
        | "mark_done"
        | "appointment"
        | "update_task"
        | "delegate_task"
        | "update_deadline"
        | "cancel_deadline"
        | "update_appointment"
        | "cancel_appointment"
        | "review_document";
    }
  >,
  target?: BrainPage
): Promise<string> {
  const id = randomUUID();
  const slug = `legal/chat/actions/${id}`;
  const title =
    intent.kind === "time_entry"
      ? "Zeitbuchung bestätigen"
      : intent.kind === "expense"
        ? "Auslage bestätigen"
        : intent.kind === "case_note"
          ? "Aktennotiz bestätigen"
          : intent.kind === "task"
            ? "Aufgabe bestätigen"
            : intent.kind === "deadline"
              ? "Frist bestätigen"
              : intent.kind === "create_case"
                ? "Neue Akte bestätigen"
                : intent.kind === "close_case"
                  ? "Akte abschließen bestätigen"
                  : intent.kind === "create_invoice"
                    ? "Rechnung bestätigen"
                    : intent.kind === "appointment"
                      ? "Termin bestätigen"
                      : intent.kind === "mark_done"
                        ? "Erledigt markieren bestätigen"
                        : intent.kind === "update_task"
                          ? "Aufgabe verschieben bestätigen"
                          : intent.kind === "delegate_task"
                            ? "Aufgabe delegieren bestätigen"
                            : intent.kind === "update_deadline"
                              ? "Frist verschieben bestätigen"
                              : intent.kind === "cancel_deadline"
                                ? "Frist streichen bestätigen"
                                : intent.kind === "update_appointment"
                                  ? "Termin verschieben bestätigen"
                                  : intent.kind === "cancel_appointment"
                                    ? "Termin absagen bestätigen"
                                    : "Dokument-Review bestätigen";
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
  return (
    pages
      .filter((page) => {
        const front = fm(page);
        return (
          front.provider === "whatsapp" &&
          front.from_phone_hash === senderHash &&
          front.status === "pending_confirmation"
        );
      })
      .sort(
        (a, b) => new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime()
      )[0] ?? null
  );
}

async function markAction(
  ctx: ChatContext,
  action: BrainPage,
  status: string,
  error?: string
): Promise<void> {
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
      family: "Familienrecht",
      civil: "Zivilrecht",
      criminal: "Strafrecht",
      labor: "Arbeitsrecht",
      commercial: "Handelsrecht",
      tax: "Steuerrecht",
      administrative: "Verwaltungsrecht",
      ip: "Gewerblicher Rechtsschutz",
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
        audit_log: [
          {
            id: randomUUID(),
            at: new Date().toISOString(),
            action: "created",
            actor: ctx.sender.name || "WhatsApp",
            note: "Akte via WhatsApp angelegt",
          },
        ],
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
    ]
      .filter(Boolean)
      .join("\n");
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
        audit_log: [
          ...audit,
          {
            id: randomUUID(),
            at: new Date().toISOString(),
            action: "closed",
            actor: ctx.sender.name || "WhatsApp",
            note: "Akte via WhatsApp abgeschlossen",
          },
        ],
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
        invoices: [
          ...invoices,
          { invoice_id: invoiceId, slug: invoiceSlug, total, status: "draft" },
        ],
        audit_log: [
          ...audit,
          {
            id: randomUUID(),
            at: new Date().toISOString(),
            action: "updated",
            actor: ctx.sender.name || "WhatsApp",
            field: "invoices",
            note: `Rechnung ${invoiceId} über ${total.toFixed(2)} EUR via WhatsApp erstellt`,
          },
        ],
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
    const items = Array.isArray(caseFm[itemType])
      ? (caseFm[itemType] as Array<Record<string, unknown>>)
      : [];
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
        audit_log: [
          ...audit,
          {
            id: randomUUID(),
            at: new Date().toISOString(),
            action: "updated",
            actor: ctx.sender.name || "WhatsApp",
            field: itemType,
            note: `${itemType === "deadlines" ? "Frist" : "Aufgabe"} via WhatsApp als erledigt markiert: ${str(items[matchIdx].title) || str(items[matchIdx].description)}`,
          },
        ],
      },
      merge: true,
    });
    await markAction(ctx, action, "executed");
    const doneTitle =
      str(items[matchIdx].title) || str(items[matchIdx].description) || str(payload.query);
    return `✅ ${itemType === "deadlines" ? "Frist" : "Aufgabe"} "${doneTitle}" in "${casePage.title}" als erledigt markiert.`;
  }

  if (front.intent === "update_task" || front.intent === "delegate_task") {
    const tasks = Array.isArray(caseFm.tasks)
      ? [...(caseFm.tasks as Array<Record<string, unknown>>)]
      : [];
    const matchIdx = findItemIndex(tasks, str(payload.query));
    if (matchIdx === -1) {
      await markAction(ctx, action, "failed", "task not found");
      return `Keine Aufgabe in "${casePage.title}" passend zu "${str(payload.query)}" gefunden.`;
    }
    const title = itemLabel(tasks[matchIdx]);
    if (front.intent === "update_task") {
      const dueDate = str(payload.dueDate);
      tasks[matchIdx].due_date = dueDate;
      tasks[matchIdx].dueDate = dueDate;
      tasks[matchIdx].updated_at = new Date().toISOString();
    } else {
      tasks[matchIdx].assignee = str(payload.assignee);
      tasks[matchIdx].assigned_to = str(payload.assignee);
      tasks[matchIdx].updated_at = new Date().toISOString();
    }
    await putPage(ctx.sender.brainId, {
      slug: casePage.slug,
      title: casePage.title,
      type: "legal_case",
      frontmatter: {
        tasks,
        updated_at: new Date().toISOString(),
        audit_log: appendAudit(
          caseFm,
          ctx,
          "tasks",
          front.intent === "update_task"
            ? `Aufgabe via WhatsApp verschoben: ${title} -> ${str(payload.dueDate)}`
            : `Aufgabe via WhatsApp delegiert: ${title} -> ${str(payload.assignee)}`
        ),
      },
      merge: true,
    });
    await markAction(ctx, action, "executed");
    return front.intent === "update_task"
      ? `✅ Aufgabe "${title}" in "${casePage.title}" auf ${str(payload.dueDate)} verschoben.`
      : `✅ Aufgabe "${title}" in "${casePage.title}" an ${str(payload.assignee)} delegiert.`;
  }

  if (front.intent === "update_deadline" || front.intent === "cancel_deadline") {
    const deadlines = Array.isArray(caseFm.deadlines)
      ? [...(caseFm.deadlines as Array<Record<string, unknown>>)]
      : [];
    const matchIdx = findItemIndex(deadlines, str(payload.query));
    if (matchIdx === -1) {
      await markAction(ctx, action, "failed", "deadline not found");
      return `Keine Frist in "${casePage.title}" passend zu "${str(payload.query)}" gefunden.`;
    }
    const title = itemLabel(deadlines[matchIdx]);
    if (front.intent === "update_deadline") {
      const dueDate = str(payload.dueDate);
      deadlines[matchIdx].due_date = dueDate;
      deadlines[matchIdx].date = dueDate;
      deadlines[matchIdx].review_status = "unreviewed";
      deadlines[matchIdx].updated_at = new Date().toISOString();
    } else {
      deadlines[matchIdx].status = "cancelled";
      deadlines[matchIdx].cancelled_at = new Date().toISOString();
    }
    await putPage(ctx.sender.brainId, {
      slug: casePage.slug,
      title: casePage.title,
      type: "legal_case",
      frontmatter: {
        deadlines,
        updated_at: new Date().toISOString(),
        audit_log: appendAudit(
          caseFm,
          ctx,
          "deadlines",
          front.intent === "update_deadline"
            ? `Frist via WhatsApp verschoben: ${title} -> ${str(payload.dueDate)}`
            : `Frist via WhatsApp gestrichen: ${title}`
        ),
      },
      merge: true,
    });
    await markAction(ctx, action, "executed");
    return front.intent === "update_deadline"
      ? `✅ Frist "${title}" in "${casePage.title}" auf ${str(payload.dueDate)} verschoben. Bitte fachlich prüfen.`
      : `✅ Frist "${title}" in "${casePage.title}" gestrichen.`;
  }

  if (front.intent === "update_appointment" || front.intent === "cancel_appointment") {
    const appointments = Array.isArray(caseFm.appointments)
      ? [...(caseFm.appointments as Array<Record<string, unknown>>)]
      : [];
    const matchIdx = findItemIndex(appointments, str(payload.query));
    if (matchIdx === -1) {
      await markAction(ctx, action, "failed", "appointment not found");
      return `Kein Termin in "${casePage.title}" passend zu "${str(payload.query)}" gefunden.`;
    }
    const title = itemLabel(appointments[matchIdx]);
    const appointmentSlug = str(appointments[matchIdx].slug);
    if (front.intent === "update_appointment") {
      const date = str(payload.date);
      const time = str(payload.time);
      appointments[matchIdx].date = date;
      appointments[matchIdx].time = time;
      appointments[matchIdx].reminder_sent = false;
      appointments[matchIdx].updated_at = new Date().toISOString();
      if (appointmentSlug) {
        await putPage(ctx.sender.brainId, {
          slug: appointmentSlug,
          title: `Termin: ${date} ${time} — ${title}`,
          type: "appointment",
          frontmatter: {
            date,
            time,
            reminder_sent: false,
            updated_at: new Date().toISOString(),
          },
          merge: true,
        });
      }
    } else {
      appointments[matchIdx].status = "cancelled";
      appointments[matchIdx].cancelled_at = new Date().toISOString();
      if (appointmentSlug) {
        await putPage(ctx.sender.brainId, {
          slug: appointmentSlug,
          title: `Termin abgesagt: ${title}`,
          type: "appointment",
          frontmatter: {
            status: "cancelled",
            cancelled_at: new Date().toISOString(),
          },
          merge: true,
        });
      }
    }
    await putPage(ctx.sender.brainId, {
      slug: casePage.slug,
      title: casePage.title,
      type: "legal_case",
      frontmatter: {
        appointments,
        updated_at: new Date().toISOString(),
        audit_log: appendAudit(
          caseFm,
          ctx,
          "appointments",
          front.intent === "update_appointment"
            ? `Termin via WhatsApp verschoben: ${title} -> ${str(payload.date)} ${str(payload.time)}`
            : `Termin via WhatsApp abgesagt: ${title}`
        ),
      },
      merge: true,
    });
    await markAction(ctx, action, "executed");
    return front.intent === "update_appointment"
      ? `✅ Termin "${title}" in "${casePage.title}" auf ${str(payload.date)} ${str(payload.time)} verschoben.`
      : `✅ Termin "${title}" in "${casePage.title}" abgesagt.`;
  }

  if (front.intent === "review_document") {
    const documents = Array.isArray(caseFm.documents)
      ? [...(caseFm.documents as Array<Record<string, unknown>>)]
      : [];
    const matchIdx = findItemIndex(documents, str(payload.query));
    if (matchIdx === -1) {
      await markAction(ctx, action, "failed", "document not found");
      return `Kein Dokument in "${casePage.title}" passend zu "${str(payload.query)}" gefunden.`;
    }
    const title = itemLabel(documents[matchIdx]);
    documents[matchIdx].review_status = str(payload.status) || "confirmed";
    documents[matchIdx].reviewed_at = new Date().toISOString();
    documents[matchIdx].reviewed_by = ctx.sender.name || "WhatsApp";
    await putPage(ctx.sender.brainId, {
      slug: casePage.slug,
      title: casePage.title,
      type: "legal_case",
      frontmatter: {
        documents,
        updated_at: new Date().toISOString(),
        audit_log: appendAudit(
          caseFm,
          ctx,
          "documents",
          `Dokument via WhatsApp ${str(payload.status) === "rejected" ? "abgelehnt" : "geprüft"}: ${title}`
        ),
      },
      merge: true,
    });
    await markAction(ctx, action, "executed");
    return `✅ Dokument "${title}" in "${casePage.title}" wurde als ${str(payload.status) === "rejected" ? "abgelehnt" : "geprüft"} markiert.`;
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
        audit_log: [
          ...audit,
          {
            id: randomUUID(),
            at: new Date().toISOString(),
            action: "updated",
            actor: ctx.sender.name || "WhatsApp",
            field: "time_entries",
            note: `Zeit via WhatsApp erfasst: ${entry.minutes} Minuten`,
          },
        ],
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
        audit_log: [
          ...audit,
          {
            id: randomUUID(),
            at: new Date().toISOString(),
            action: "updated",
            actor: ctx.sender.name || "WhatsApp",
            field: "notes",
            note: `Notiz via WhatsApp gespeichert: ${noteSlug}`,
          },
        ],
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
        audit_log: [
          ...audit,
          {
            id: randomUUID(),
            at: new Date().toISOString(),
            action: "updated",
            actor: ctx.sender.name || "WhatsApp",
            field: "expenses",
            note: `Auslage via WhatsApp erfasst: ${amount.toFixed(2)} EUR ${description}`,
          },
        ],
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
        audit_log: [
          ...audit,
          {
            id: randomUUID(),
            at: new Date().toISOString(),
            action: "updated",
            actor: ctx.sender.name || "WhatsApp",
            field: "tasks",
            note: `Aufgabe via WhatsApp angelegt: ${title}`,
          },
        ],
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
        audit_log: [
          ...audit,
          {
            id: randomUUID(),
            at: new Date().toISOString(),
            action: "updated",
            actor: ctx.sender.name || "WhatsApp",
            field: "deadlines",
            note: `Frist via WhatsApp angelegt: ${deadline.title} ${deadline.due_date}`,
          },
        ],
      },
      merge: true,
    });
    await markAction(ctx, action, "executed");
    return `Gespeichert: Frist ${deadline.due_date} zu ${casePage.title}. Bitte im Fristenkalender fachlich prüfen.`;
  }

  if (front.intent === "appointment") {
    const payload = front.payload as Record<string, unknown> | undefined;
    if (!payload) throw new Error("appointment: missing payload");
    const appointmentId = randomUUID();
    const appointmentSlug = `legal/appointments/${appointmentId}`;
    const date = str(payload.date);
    const time = str(payload.time);
    const title = str(payload.title) || "Termin";
    const location = str(payload.location);
    const reminderHours = Number(payload.reminderHours) || 24;
    const reminderAt = new Date(`${date}T${time}:00`);
    reminderAt.setHours(reminderAt.getHours() - reminderHours);
    const hasCase = !!targetSlug;
    const casePage = hasCase ? await getPage(ctx.sender.brainId, targetSlug!) : null;
    const caseFm = casePage ? fm(casePage) : {};
    const audit = Array.isArray(caseFm.audit_log) ? caseFm.audit_log : [];
    const appointments = Array.isArray(caseFm.appointments) ? caseFm.appointments : [];

    await putPage(ctx.sender.brainId, {
      slug: appointmentSlug,
      title: `Termin: ${date} ${time} — ${title}`,
      type: "appointment",
      content: [
        `## Termin`,
        ``,
        `**Datum:** ${date}`,
        `**Uhrzeit:** ${time}`,
        `**Thema:** ${title}`,
        location ? `**Ort:** ${location}` : "",
        hasCase ? `**Akte:** ${casePage!.title}` : "",
        `**Quelle:** WhatsApp`,
        ``,
        `### Erinnerung`,
        `${reminderHours}h vor dem Termin wird eine WhatsApp-Erinnerung gesendet.`,
      ]
        .filter(Boolean)
        .join("\n"),
      frontmatter: {
        type: "appointment",
        appointment_id: appointmentId,
        date,
        time,
        title,
        location: location || undefined,
        case_slug: targetSlug || undefined,
        case_title: casePage?.title,
        status: "confirmed",
        reminder_hours: reminderHours,
        reminder_at: reminderAt.toISOString(),
        reminder_sent: false,
        created_via: "whatsapp",
        created_at: new Date().toISOString(),
      },
    });

    if (hasCase && casePage) {
      await putPage(ctx.sender.brainId, {
        slug: casePage.slug,
        title: casePage.title,
        content: casePage.content,
        frontmatter: {
          appointments: [
            ...appointments,
            {
              id: appointmentId,
              slug: appointmentSlug,
              date,
              time,
              title,
              location: location || undefined,
              status: "confirmed",
              reminder_hours: reminderHours,
              created_via: "whatsapp",
            },
          ],
          audit_log: [
            ...audit,
            {
              id: randomUUID(),
              at: new Date().toISOString(),
              action: "updated",
              actor: ctx.sender.name || "WhatsApp",
              field: "appointments",
              note: `Termin via WhatsApp angelegt: ${date} ${time} ${title}`,
            },
          ],
        },
        merge: true,
      });
    }

    await markAction(ctx, action, "executed");
    return [
      `✅ Termin bestätigt:`,
      `Datum: ${date}`,
      `Uhrzeit: ${time}`,
      `Thema: ${title}`,
      location ? `Ort: ${location}` : "",
      hasCase ? `Akte: ${casePage!.title}` : "",
      `Erinnerung: ${reminderHours}h vorher via WhatsApp`,
    ]
      .filter(Boolean)
      .join("\n");
  }

  throw new Error(`unsupported action intent: ${String(front.intent)}`);
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
    body: JSON.stringify({ query, mode: "conservative" }),
    signal: AbortSignal.timeout(60_000),
  });
  if (!res.ok) throw new Error(`Brain-Q&A fehlgeschlagen: HTTP ${res.status}`);
  const contentType = res.headers.get("Content-Type") || "";
  if (!contentType.includes("text/event-stream")) {
    const data = (await res.json().catch(() => ({}))) as { answer?: string };
    return data.answer || "Keine Antwort erhalten.";
  }
  if (!res.body) return "Keine Antwort erhalten.";
  const answer = await collectSSEChunks(res.body);
  return answer.trim() || "Keine Antwort erhalten.";
}

function summarizeCase(casePage: BrainPage): string {
  const front = fm(casePage);
  const deadlines = Array.isArray(front.deadlines)
    ? (front.deadlines as Array<Record<string, unknown>>)
    : [];
  const tasks = Array.isArray(front.tasks) ? (front.tasks as Array<Record<string, unknown>>) : [];
  const times = Array.isArray(front.time_entries)
    ? (front.time_entries as Array<Record<string, unknown>>)
    : [];
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
    nextDeadlines.length
      ? `Nächste Fristen: ${nextDeadlines.map((d) => `${d.date} ${d.title}`).join("; ")}`
      : "Nächste Fristen: keine",
    casePage.content ? `Kurzsachverhalt: ${casePage.content.slice(0, 500)}` : "",
  ]
    .filter(Boolean)
    .join("\n");
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
  if (
    lower.includes("fahrt") ||
    lower.includes("km") ||
    lower.includes("taxi") ||
    lower.includes("zug")
  )
    return "Fahrtkosten";
  if (lower.includes("gericht")) return "Gerichtskosten";
  if (lower.includes("kopie") || lower.includes("druck")) return "Kopien";
  if (lower.includes("porto") || lower.includes("post")) return "Porto";
  return "Auslage";
}

async function invoiceStatus(brainId: string, casePage: BrainPage): Promise<string> {
  const front = fm(casePage);
  const times = Array.isArray(front.time_entries)
    ? (front.time_entries as Array<Record<string, unknown>>)
    : [];
  const expenses = Array.isArray(front.expenses)
    ? (front.expenses as Array<Record<string, unknown>>)
    : [];
  const openTimes = times.filter((entry) => entry.billable !== false && !entry.billed);
  const openExpenses = expenses.filter((entry) => entry.billable !== false && !entry.billed);
  const minutes = openTimes.reduce((sum, entry) => sum + (Number(entry.minutes) || 0), 0);
  const expensesTotal = openExpenses.reduce((sum, entry) => sum + (Number(entry.amount) || 0), 0);

  const invoices = await listPages(brainId, "invoice", 100);
  const caseNumber = str(front.case_number);
  const relevantInvoices = invoices.filter((invoice) => {
    const invFm = fm(invoice);
    return (
      str(invFm.case_number) === caseNumber ||
      (Array.isArray(invFm.case_slugs) && invFm.case_slugs.includes(casePage.slug))
    );
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
    console.warn(
      "[legal-chat] inbox write failed:",
      err instanceof Error ? err.message : String(err)
    );
  });

  const reply = await processIntent(ctx, intent);

  // Log outbound reply in brain so conversation history is complete (both directions)
  if (reply) {
    await createOutboxPage(
      ctx.sender.brainId,
      ctx.fromPhone,
      ctx.messageId,
      reply,
      intent.kind
    ).catch((err) => {
      console.warn(
        "[legal-chat] outbox write failed:",
        err instanceof Error ? err.message : String(err)
      );
    });
  }

  return reply;
}

export async function processIntent(ctx: ChatContext, intent: ParsedIntent): Promise<string> {
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
      "  aufgabe verschieben akt 2026-014: klageentwurf auf 2026-07-03",
      "  aufgabe delegieren akt 2026-014: klageentwurf an Anna",
      "  frist akt 2026-014: Berufung 2026-07-01",
      "  frist verschieben akt 2026-014: Berufung auf 2026-07-08",
      "  frist streichen akt 2026-014: Berufung",
      "  erledigt akt 2026-014: klageentwurf — als erledigt markieren",
      "  rechnung akt 2026-014: 2500 eur für Klageentwurf",
      "  termin akt 2026-014: 15.07.2026 14:00 LG München Verhandlung",
      "  termin verschieben akt 2026-014: Verhandlung auf 16.07.2026 09:30",
      "  termin absagen akt 2026-014: Verhandlung",
      "  termine — alle anstehenden Termine auflisten",
      "  dokumente status akt 2026-014 — Unterlagen-/Review-Status",
      "  dokument geprüft akt 2026-014: Klageentwurf",
      "  bea — beA-Eingänge/Entwürfe/Filing-Status",
      "  datev — DATEV-fähige Buchungen/Rechnungsstatus",
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
    if (intent.kind === "expense" && !intent.caseRef)
      return "Zu welcher Akte soll ich die Auslage speichern? Bitte z.B. `auslage akt 2026-014: 12,50 eur kopien` senden.";
    const resolved = await resolveAuthorizedCase(ctx, intent.caseRef);
    if (!resolved.ok) return resolved.message;
    const target = resolved.page;
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
    if (!intent.caseRef)
      return `Zu welcher Akte soll ich ${intent.kind === "task" ? "die Aufgabe" : "die Frist"} speichern? Bitte z.B. "akt 2026-014" angeben.`;
    const resolved = await resolveAuthorizedCase(ctx, intent.caseRef);
    if (!resolved.ok) return resolved.message;
    const target = resolved.page;
    await createPendingAction(ctx, intent, target);
    if (intent.kind === "task") {
      return `Erkannt: Aufgabe zu "${target.title}": ${intent.title}${intent.dueDate ? ` bis ${intent.dueDate}` : ""}. Antworte mit JA zum Speichern.`;
    }
    return `Erkannt: Frist zu "${target.title}": ${intent.title} am ${intent.dueDate}. Antworte mit JA zum Speichern.`;
  }

  if (intent.kind === "invoice_status") {
    const resolved = await resolveAuthorizedCase(ctx, intent.caseRef);
    if (!resolved.ok) return resolved.message;
    const target = resolved.page;
    return invoiceStatus(ctx.sender.brainId, target);
  }

  if (intent.kind === "case_summary") {
    const resolved = await resolveAuthorizedCase(ctx, intent.caseRef);
    if (!resolved.ok) return resolved.message;
    const target = resolved.page;
    return summarizeCase(target);
  }

  if (intent.kind === "brain_query") {
    const recentMessages = await getRecentContext(ctx.sender.brainId, ctx.fromPhone);
    const contextPrefix =
      recentMessages.length > 0
        ? `[Kontext: Letzte Nachrichten von diesem Anwalt — ${recentMessages.slice(0, 3).join(" | ")}]\n\n`
        : "";
    const answer = await think(
      ctx.sender.brainId,
      `${contextPrefix}${intent.query}`,
      ctx.sender.matterScope
    );
    return answer.slice(0, 3500);
  }

  if (intent.kind === "rvg_calc") {
    const result = calculateRvg(intent.streitwert);
    // Followup D.14: a deterministic calculation, but still rechtsrelevant —
    // every WhatsApp legal answer should carry its statutory basis so the
    // lawyer can verify it without re-deriving the VV-RVG numbers themselves.
    // These three Nr.-references are standard, stable VV-RVG line items for
    // exactly the three fee types computed above (not generated, not at risk
    // of drifting/hallucinating).
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
      ``,
      `Rechtsgrundlage: § 13 RVG (Gebührentabelle); Verfahrensgebühr Nr. 3100 VV RVG, Terminsgebühr Nr. 3104 VV RVG, Einigungsgebühr Nr. 1000 VV RVG.`,
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
      // Followup D.14: rule.law already carries the precise statutory basis
      // (calculateDeadline returns it too, as result.law) — was computed but
      // never surfaced in the WhatsApp reply text.
      `Rechtsgrundlage: ${result.law}`,
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
          ...engineHeadersForBrainWithMatterScope(ctx.sender.brainId, ctx.sender.matterScope),
        },
        body: JSON.stringify({ name: intent.name, caseRef: intent.caseRef }),
        signal: AbortSignal.timeout(15_000),
      });
      if (!res.ok) throw new Error(`Conflict-Check HTTP ${res.status}`);
      const data = (await res.json().catch(() => ({}))) as {
        conflicts?: Array<{
          case_title: string;
          case_slug: string;
          reason: string;
          severity: string;
        }>;
        clean?: boolean;
      };
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
    if (!intent.caseRef)
      return "Zu welcher Akte soll ich Dokumente suchen? Bitte z.B. `dokument akt 2026-014: klage` senden.";
    const resolved = await resolveAuthorizedCase(ctx, intent.caseRef);
    if (!resolved.ok) return resolved.message;
    const target = resolved.page;
    const caseFm = fm(target);
    const documents = Array.isArray(caseFm.documents)
      ? (caseFm.documents as Array<Record<string, unknown>>)
      : [];
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
    return matches
      .map(
        (doc) => `📄 ${str(doc.title)} — ${str(doc.storage_path) || str(doc.url) || "kein Pfad"}`
      )
      .join("\n");
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
    const resolved = await resolveAuthorizedCase(ctx, intent.caseRef);
    if (!resolved.ok) return resolved.message;
    const target = resolved.page;
    return summarizeCase(target);
  }

  if (intent.kind === "list_tasks") {
    const cases = await listPages(ctx.sender.brainId, "legal_case", 100);
    const allTasks: Array<{ caseTitle: string; title: string; dueDate?: string; done: boolean }> =
      [];
    for (const page of cases) {
      const front = fm(page);
      const tasks = Array.isArray(front.tasks)
        ? (front.tasks as Array<Record<string, unknown>>)
        : [];
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
      ...open
        .slice(0, 20)
        .map((t) => `• ${t.dueDate ? `${t.dueDate} — ` : ""}${t.title} (${t.caseTitle})`),
    ].join("\n");
  }

  if (intent.kind === "list_deadlines") {
    const cases = await listPages(ctx.sender.brainId, "legal_case", 100);
    const allDeadlines: Array<{ caseTitle: string; title: string; date: string; done: boolean }> =
      [];
    for (const page of cases) {
      const front = fm(page);
      const deadlines = Array.isArray(front.deadlines)
        ? (front.deadlines as Array<Record<string, unknown>>)
        : [];
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
      const deadlines = Array.isArray(front.deadlines)
        ? (front.deadlines as Array<Record<string, unknown>>)
        : [];
      const tasks = Array.isArray(front.tasks)
        ? (front.tasks as Array<Record<string, unknown>>)
        : [];

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
    if (!intent.caseRef)
      return "Zu welcher Akte soll ich etwas als erledigt markieren? Beispiel: `erledigt akt 2026-014: klageentwurf`.";
    const resolved = await resolveAuthorizedCase(ctx, intent.caseRef);
    if (!resolved.ok) return resolved.message;
    const target = resolved.page;
    const front = fm(target);
    const listKey = intent.itemType === "deadline" ? "deadlines" : "tasks";
    const items = Array.isArray(front[listKey])
      ? (front[listKey] as Array<Record<string, unknown>>)
      : [];
    const needle = intent.query.toLowerCase();
    const matchIdx = items.findIndex((item) => {
      const title = str(item.title).toLowerCase() || str(item.description).toLowerCase();
      return title.includes(needle);
    });
    if (matchIdx === -1) {
      const available = items
        .map((i) => str(i.title) || str(i.description))
        .filter(Boolean)
        .join(", ");
      return `Keine ${intent.itemType === "deadline" ? "Frist" : "Aufgabe"} in "${target.title}" passend zu "${intent.query}" gefunden.${available ? ` Verfügbar: ${available}` : ""}`;
    }
    const itemTitle =
      str(items[matchIdx].title) || str(items[matchIdx].description) || intent.query;
    await createPendingAction(ctx, intent, target);
    return `Erkannt: ${intent.itemType === "deadline" ? "Frist" : "Aufgabe"} "${itemTitle}" in "${target.title}" als erledigt markieren. Antworte mit JA zum Bestätigen.`;
  }

  if (intent.kind === "update_task" || intent.kind === "delegate_task") {
    if (!intent.caseRef)
      return "Zu welcher Akte soll ich die Aufgabe ändern? Beispiel: `aufgabe verschieben akt 2026-014: klageentwurf auf 2026-07-03`.";
    const resolved = await resolveAuthorizedCase(ctx, intent.caseRef);
    if (!resolved.ok) return resolved.message;
    const target = resolved.page;
    const tasks = Array.isArray(fm(target).tasks)
      ? (fm(target).tasks as Array<Record<string, unknown>>)
      : [];
    const matchIdx = findItemIndex(tasks, intent.query);
    if (matchIdx === -1)
      return `Keine Aufgabe in "${target.title}" passend zu "${intent.query}" gefunden.`;
    await createPendingAction(ctx, intent, target);
    return intent.kind === "update_task"
      ? `Erkannt: Aufgabe "${itemLabel(tasks[matchIdx])}" in "${target.title}" auf ${intent.dueDate} verschieben. Antworte mit JA.`
      : `Erkannt: Aufgabe "${itemLabel(tasks[matchIdx])}" in "${target.title}" an ${intent.assignee} delegieren. Antworte mit JA.`;
  }

  if (intent.kind === "update_deadline" || intent.kind === "cancel_deadline") {
    if (!intent.caseRef)
      return "Zu welcher Akte soll ich die Frist ändern? Beispiel: `frist verschieben akt 2026-014: Berufung auf 2026-07-08`.";
    const resolved = await resolveAuthorizedCase(ctx, intent.caseRef);
    if (!resolved.ok) return resolved.message;
    const target = resolved.page;
    const deadlines = Array.isArray(fm(target).deadlines)
      ? (fm(target).deadlines as Array<Record<string, unknown>>)
      : [];
    const matchIdx = findItemIndex(deadlines, intent.query);
    if (matchIdx === -1)
      return `Keine Frist in "${target.title}" passend zu "${intent.query}" gefunden.`;
    await createPendingAction(ctx, intent, target);
    return intent.kind === "update_deadline"
      ? `Erkannt: Frist "${itemLabel(deadlines[matchIdx])}" in "${target.title}" auf ${intent.dueDate} verschieben. Antworte mit JA.`
      : `Erkannt: Frist "${itemLabel(deadlines[matchIdx])}" in "${target.title}" streichen. Antworte mit JA.`;
  }

  if (intent.kind === "update_appointment" || intent.kind === "cancel_appointment") {
    if (!intent.caseRef)
      return "Zu welcher Akte soll ich den Termin ändern? Beispiel: `termin verschieben akt 2026-014: Verhandlung auf 2026-07-16 09:30`.";
    const resolved = await resolveAuthorizedCase(ctx, intent.caseRef);
    if (!resolved.ok) return resolved.message;
    const target = resolved.page;
    const appointments = Array.isArray(fm(target).appointments)
      ? (fm(target).appointments as Array<Record<string, unknown>>)
      : [];
    const matchIdx = findItemIndex(appointments, intent.query);
    if (matchIdx === -1)
      return `Kein Termin in "${target.title}" passend zu "${intent.query}" gefunden.`;
    await createPendingAction(ctx, intent, target);
    return intent.kind === "update_appointment"
      ? `Erkannt: Termin "${itemLabel(appointments[matchIdx])}" in "${target.title}" auf ${intent.date} ${intent.time} verschieben. Antworte mit JA.`
      : `Erkannt: Termin "${itemLabel(appointments[matchIdx])}" in "${target.title}" absagen. Antworte mit JA.`;
  }

  if (intent.kind === "bea_status") {
    const batch = await batchListPages(ctx.sender.brainId, ["bea_draft", "bea_message", "filing_package"], 20);
    const drafts = batch["bea_draft"] ?? [];
    const messages = batch["bea_message"] ?? [];
    const filings = batch["filing_package"] ?? [];
    const draftRows = drafts.slice(0, 5).map((page) => {
      const front = fm(page);
      return `• Entwurf: ${str(front.subject) || page.title} -> ${str(front.recipient) || "Empfänger offen"} [${str(front.status) || "draft"}]`;
    });
    const inboxRows = messages.slice(0, 5).map((page) => {
      const front = fm(page);
      return `• Eingang: ${str(front.subject) || page.title} von ${str(front.sender) || "unbekannt"} ${str(front.sent_date) ? `(${str(front.sent_date).split("T")[0]})` : ""}`;
    });
    const filingRows = filings.slice(0, 5).map((page) => {
      const front = fm(page);
      const pkg =
        front.package && typeof front.package === "object"
          ? (front.package as Record<string, unknown>)
          : {};
      return `• Filing: ${page.title} [${str(pkg.status) || str(front.status) || "offen"}]`;
    });
    if (draftRows.length + inboxRows.length + filingRows.length === 0) {
      return "Keine beA-Eingänge, Entwürfe oder Filing-Pakete im Brain gefunden.";
    }
    return [
      "📬 beA-Status:",
      ...inboxRows,
      ...draftRows,
      ...filingRows,
      "",
      "Hinweis: Versand/Freigabe bitte im beA-Dashboard final prüfen.",
    ].join("\n");
  }

  if (intent.kind === "datev_status") {
    const batch = await batchListPages(ctx.sender.brainId, ["legal_case", "invoice"], 200);
    const cases = batch["legal_case"] ?? [];
    const invoices = batch["invoice"] ?? [];
    let exportEntries = 0;
    let exportAmount = 0;
    for (const page of cases) {
      const front = fm(page);
      const timeEntries = Array.isArray(front.time_entries)
        ? (front.time_entries as Array<Record<string, unknown>>)
        : [];
      const expenses = Array.isArray(front.expenses)
        ? (front.expenses as Array<Record<string, unknown>>)
        : [];
      for (const entry of timeEntries) {
        if (entry.billable === false || entry.billed !== true) continue;
        const minutes = Number(entry.minutes) || 0;
        const rate = Number(entry.rate) || 200;
        exportEntries++;
        exportAmount += (minutes / 60) * rate;
      }
      for (const expense of expenses) {
        if (expense.billable === false || expense.billed !== true) continue;
        exportEntries++;
        exportAmount += Number(expense.amount) || 0;
      }
    }
    const invoiceStats = invoices.reduce(
      (acc, page) => {
        const status = str(fm(page).status) || "draft";
        acc[status] = (acc[status] || 0) + 1;
        return acc;
      },
      {} as Record<string, number>
    );
    const invoiceLine =
      Object.entries(invoiceStats)
        .map(([status, count]) => `${status}: ${count}`)
        .join(", ") || "keine Rechnungen";
    return [
      "🧾 DATEV-/Rechnungsstatus:",
      `DATEV-fähige Buchungen: ${exportEntries}`,
      `Geschätzter Netto-Betrag: ${exportAmount.toFixed(2)} EUR`,
      `Rechnungen: ${invoiceLine}`,
      "",
      "Export im Dashboard: /dashboard/datev-export",
    ].join("\n");
  }

  if (intent.kind === "document_status") {
    const resolved = await resolveAuthorizedCase(ctx, intent.caseRef);
    if (!resolved.ok) return resolved.message;
    const target = resolved.page;
    const front = fm(target);
    const documents = Array.isArray(front.documents)
      ? (front.documents as Array<Record<string, unknown>>)
      : [];
    if (documents.length === 0) return `Keine Dokumente in "${target.title}" gefunden.`;
    const rows = documents.slice(0, 20).map((doc) => {
      const status =
        str(doc.review_status) || str(doc.extraction_status) || str(doc.ocr_status) || "offen";
      return `• ${itemLabel(doc)} — ${status}`;
    });
    return [`📎 Dokumentstatus "${target.title}":`, ...rows].join("\n");
  }

  if (intent.kind === "review_document") {
    if (!intent.caseRef)
      return "Zu welcher Akte soll ich das Dokument prüfen? Beispiel: `dokument geprüft akt 2026-014: Klageentwurf`.";
    const resolved = await resolveAuthorizedCase(ctx, intent.caseRef);
    if (!resolved.ok) return resolved.message;
    const target = resolved.page;
    const documents = Array.isArray(fm(target).documents)
      ? (fm(target).documents as Array<Record<string, unknown>>)
      : [];
    const matchIdx = findItemIndex(documents, intent.query);
    if (matchIdx === -1)
      return `Kein Dokument in "${target.title}" passend zu "${intent.query}" gefunden.`;
    await createPendingAction(ctx, intent, target);
    return `Erkannt: Dokument "${itemLabel(documents[matchIdx])}" in "${target.title}" als ${intent.status === "rejected" ? "abgelehnt" : "geprüft"} markieren. Antworte mit JA.`;
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
      ]
        .join(" ")
        .toLowerCase();
      if (searchText.includes(needle)) {
        const contentSnippet = (page.content || "").slice(0, 200);
        hits.push({ caseTitle: page.title, caseNumber, snippet: contentSnippet });
      }
    }
    if (hits.length === 0) return `Keine Akte gefunden, die "${intent.query}" enthält.`;
    return [
      `🔍 "${intent.query}" — ${hits.length} Treffer:`,
      ...hits
        .slice(0, 10)
        .map(
          (h) => `• ${h.caseNumber || "?"}: ${h.caseTitle}${h.snippet ? `\n  ${h.snippet}...` : ""}`
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
      const times = Array.isArray(front.time_entries)
        ? (front.time_entries as Array<Record<string, unknown>>)
        : [];
      const expenses = Array.isArray(front.expenses)
        ? (front.expenses as Array<Record<string, unknown>>)
        : [];
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
    const resolved = await resolveAuthorizedCase(ctx, intent.caseRef);
    if (!resolved.ok) return resolved.message;
    const target = resolved.page;
    const front = fm(target);
    const times = Array.isArray(front.time_entries)
      ? (front.time_entries as Array<Record<string, unknown>>)
      : [];
    const expenses = Array.isArray(front.expenses)
      ? (front.expenses as Array<Record<string, unknown>>)
      : [];
    const tasks = Array.isArray(front.tasks) ? (front.tasks as Array<Record<string, unknown>>) : [];
    const deadlines = Array.isArray(front.deadlines)
      ? (front.deadlines as Array<Record<string, unknown>>)
      : [];
    const notes = Array.isArray(front.notes) ? (front.notes as Array<Record<string, unknown>>) : [];

    const allEvents: Array<{ date: string; type: string; text: string }> = [];

    for (const t of times) {
      allEvents.push({
        date: str(t.date) || str(t.created_at) || "",
        type: "⏱️",
        text: `${str(t.minutes)} min: ${str(t.description)}`,
      });
    }
    for (const e of expenses) {
      allEvents.push({
        date: str(e.date) || str(e.created_at) || "",
        type: "💰",
        text: `${Number(e.amount || 0).toFixed(2)} EUR: ${str(e.description)}`,
      });
    }
    for (const n of notes) {
      allEvents.push({
        date: str(n.date) || str(n.created_at) || "",
        type: "📝",
        text: str(n.text) || str(n.note) || str(n.content) || "",
      });
    }
    for (const t of tasks) {
      allEvents.push({
        date: str(t.created_at) || str(t.due_date) || "",
        type: t.done ? "✅" : "📋",
        text: str(t.title),
      });
    }
    for (const d of deadlines) {
      allEvents.push({
        date: str(d.created_at) || str(d.due_date) || str(d.date) || "",
        type: d.status === "done" || d.done ? "✅" : "⚖️",
        text: str(d.title),
      });
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
      family: "Familienrecht",
      civil: "Zivilrecht",
      criminal: "Strafrecht",
      labor: "Arbeitsrecht",
      commercial: "Handelsrecht",
      tax: "Steuerrecht",
      administrative: "Verwaltungsrecht",
      ip: "Gewerblicher Rechtsschutz",
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
    ]
      .filter(Boolean)
      .join("\n");
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
    ]
      .filter(Boolean)
      .join("\n");
  }

  if (intent.kind === "close_case") {
    const resolved = await resolveAuthorizedCase(ctx, intent.caseRef);
    if (!resolved.ok) return resolved.message;
    const target = resolved.page;
    await createPendingAction(ctx, intent, target);
    return `Erkannt: Akte "${target.title}" abschließen und archivieren. Antworte mit JA zum Bestätigen.`;
  }

  if (intent.kind === "create_invoice") {
    if (!intent.caseRef)
      return "Zu welcher Akte soll ich die Rechnung erstellen? Beispiel: `rechnung akt 2026-014: 2500 eur für Klageentwurf`.";
    const resolved = await resolveAuthorizedCase(ctx, intent.caseRef);
    if (!resolved.ok) return resolved.message;
    const target = resolved.page;
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

  if (intent.kind === "appointment") {
    let target: BrainPage | undefined;
    if (intent.caseRef) {
      const resolved = await resolveAuthorizedCase(ctx, intent.caseRef);
      if (!resolved.ok) return resolved.message;
      target = resolved.page;
    }
    await createPendingAction(ctx, intent, target);
    return [
      `Erkannt: Termin anlegen`,
      `Datum: ${intent.date}`,
      `Uhrzeit: ${intent.time}`,
      `Thema: ${intent.title}`,
      target ? `Akte: ${target.title}` : "(ohne Aktenbezug)",
      `Antworte mit JA zum Bestätigen.`,
    ]
      .filter(Boolean)
      .join("\n");
  }

  if (intent.kind === "list_appointments") {
    const pages = await listPages(ctx.sender.brainId, "appointment", 100);
    const today = new Date().toISOString().slice(0, 10);
    const upcoming = pages
      .map((page) => {
        const front = fm(page);
        return {
          date: str(front.date),
          time: str(front.time),
          title: str(front.title) || page.title,
          location: str(front.location),
          caseTitle: str(front.case_title),
          status: str(front.status),
        };
      })
      .filter((a) => a.date >= today && a.status !== "cancelled")
      .sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time));
    if (upcoming.length === 0) return "Keine anstehenden Termine. 📭";
    return [
      `📅 Anstehende Termine (${upcoming.length}):`,
      ...upcoming
        .slice(0, 15)
        .map(
          (a) =>
            `• ${a.date} ${a.time} — ${a.title}${a.location ? ` @ ${a.location}` : ""}${a.caseTitle ? ` (${a.caseTitle})` : ""}`
        ),
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
    // Natural-language WhatsApp chat: personalized, context-aware, with conversation history
    return naturalWhatsAppReply({
      sender: ctx.sender,
      fromPhone: ctx.fromPhone,
      messageId: ctx.messageId,
      text: intent.text,
    });
  }

  if (intent.kind === "unknown") {
    return intent.message;
  }

  return "Unbekannter Befehl. Schreibe `hilfe` für alle Befehle.";
}

export async function handleLegalChatMedia(
  ctx: MediaChatContext,
  media: StoredWhatsAppMedia
): Promise<string> {
  await createMediaInboxPage(ctx, media).catch((err) => {
    console.warn(
      "[legal-chat] media inbox write failed:",
      err instanceof Error ? err.message : String(err)
    );
  });

  let target: BrainPage | null = null;
  let lookupHelp: string | null = null;
  let autoAssigned = false;
  const caseRef = parseCaseRefFromText(ctx.caption || "");
  if (caseRef) {
    const resolved = await resolveAuthorizedCase(ctx, caseRef);
    if (resolved.ok) target = resolved.page;
    else lookupHelp = resolved.message;
  }

  // G2: Smart Auto-Assignment — no explicit caseRef, try heuristics
  if (!target && !caseRef) {
    target = await smartAssignCase(ctx, media);
    if (target) autoAssigned = true;
  }

  const documentSlug = await createMediaVaultPage(ctx, media, target);
  let reply: string;
  if (target) {
    await attachMediaToCase(ctx, target, media, documentSlug);
    void queueWhatsAppDocumentAnalysis(ctx.sender.brainId, documentSlug);
    if (autoAssigned) {
      reply = [
        `Gespeichert: ${media.kind} "${media.filename}" wurde im Vault abgelegt und automatisch an "${target.title}" gehängt.`,
        `Wenn das nicht die richtige Akte ist, bitte mit "akt <Aktenzeichen>" korrigieren.`,
      ].join("\n");
    } else {
      reply = `Gespeichert: ${media.kind} "${media.filename}" wurde im Vault abgelegt und an "${target.title}" gehängt.`;
    }
  } else if (caseRef) {
    reply = `Gespeichert im Vault, aber nicht eindeutig zugeordnet.\n${lookupHelp}`;
  } else {
    reply = `Gespeichert im Vault: ${media.kind} "${media.filename}". Für direkte Zuordnung beim Senden bitte Beschriftung mit Akte nutzen, z.B. "akt 2026-014".`;
  }

  // Log outbound reply in brain
  await createOutboxPage(
    ctx.sender.brainId,
    ctx.fromPhone,
    ctx.messageId,
    reply,
    "media_upload"
  ).catch((err) => {
    console.warn(
      "[legal-chat] media outbox write failed:",
      err instanceof Error ? err.message : String(err)
    );
  });

  return reply;
}

/**
 * G2: Smart document-to-case assignment heuristic.
 * Tries multiple strategies in order:
 * 1. Filename/caption keyword match against case titles, client names, opponent names
 * 2. Sender's most recently active case (last chat_action or time_entry)
 * 3. If only one case exists and sender has access, auto-assign
 * Returns null if no confident match found.
 */
async function smartAssignCase(
  ctx: MediaChatContext,
  media: StoredWhatsAppMedia
): Promise<BrainPage | null> {
  const cases = await listPages(ctx.sender.brainId, "legal_case", 200);
  const accessible = cases.filter((c) => identityCanAccessMatter(ctx.sender, c.slug));
  if (accessible.length === 0) return null;

  // Strategy 1: Keyword match against filename/caption
  const searchText = `${media.filename} ${ctx.caption || ""}`.toLowerCase();
  if (searchText.trim()) {
    const scored = accessible
      .map((page) => {
        const front = fm(page);
        const hay = [
          page.title,
          str(front.case_number),
          str(front.client_name),
          str(front.opponent_name),
        ]
          .join(" ")
          .toLowerCase();
        let score = 0;
        // Check if any word from the filename appears in the case data
        const words = searchText.split(/[\s._\-]+/).filter((w) => w.length > 2);
        for (const word of words) {
          if (hay.includes(word)) score += 10;
        }
        // Strong match: case_number appears in filename
        const caseNum = str(front.case_number).toLowerCase();
        if (caseNum && searchText.includes(caseNum)) score += 50;
        return { page, score };
      })
      .filter((item) => item.score > 0)
      .sort((a, b) => b.score - a.score);
    if (scored.length > 0 && scored[0].score >= 20) {
      return scored[0].page;
    }
  }

  // Strategy 2: Most recently active case for this sender
  try {
    const actions = await listPages(ctx.sender.brainId, "chat_action", 20);
    const senderHash = phoneHash(ctx.fromPhone);
    const recentAction = actions
      .filter((a) => {
        const front = fm(a);
        return (
          str(front.from_phone_hash) === senderHash &&
          str(front.status) === "executed" &&
          str(front.target_slug)
        );
      })
      .sort(
        (a, b) =>
          new Date(str(fm(b).created_at) || 0).getTime() -
          new Date(str(fm(a).created_at) || 0).getTime()
      )[0];
    if (recentAction) {
      const targetSlug = str(fm(recentAction).target_slug);
      const match = accessible.find((c) => c.slug === targetSlug);
      if (match) return match;
    }
  } catch {
    // Non-blocking
  }

  // Strategy 3: If only one accessible case, auto-assign
  if (accessible.length === 1) return accessible[0];

  return null;
}
