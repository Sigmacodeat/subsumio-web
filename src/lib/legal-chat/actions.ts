import { randomUUID } from "node:crypto";
import { ENGINE_URL, engineHeadersForBrain } from "@/lib/engine";
import type { BrainPage } from "@/lib/types";
import type { StoredWhatsAppMedia } from "@/lib/whatsapp/media";
import type { WhatsAppSenderBinding } from "@/lib/whatsapp/types";
import { phoneHash } from "@/lib/whatsapp/verify";

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
  | { kind: "invoice_status"; caseRef: string }
  | { kind: "task"; caseRef: string; title: string; dueDate?: string }
  | { kind: "deadline"; caseRef: string; title: string; dueDate: string }
  | { kind: "case_summary"; caseRef: string }
  | { kind: "brain_query"; query: string }
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

function parseIntent(text: string): ParsedIntent {
  const trimmed = text.trim();
  const lower = trimmed.toLowerCase();
  if (/^(ja|ok|okay|speichern|bestaetigen|bestätigen)$/i.test(trimmed)) return { kind: "confirm" };
  if (/^(nein|no|abbrechen|verwerfen|stopp|stop)$/i.test(trimmed)) return { kind: "cancel" };
  if (/^(hilfe|help|\?)$/i.test(trimmed)) return { kind: "help" };

  const minutesMatch = trimmed.match(/(\d+(?:[,.]\d+)?)\s*(h|std|stunden|m|min|minute|minuten)\b/i);
  if (minutesMatch) {
    const raw = parseFloat(minutesMatch[1].replace(",", "."));
    const unit = minutesMatch[2].toLowerCase();
    const minutes = Math.max(1, Math.round(unit.startsWith("h") || unit.startsWith("std") ? raw * 60 : raw));
    const caseMatch = trimmed.match(/\b(?:akt|akte|az|aktenzeichen)\s+([^,;:\n]+)/i);
    const caseRef = (caseMatch?.[1] ?? "").trim();
    const description = trimmed
      .replace(minutesMatch[0], "")
      .replace(caseMatch?.[0] ?? "", "")
      .replace(/^\s*zeit\s*/i, "")
      .trim() || "Zeiterfassung via WhatsApp";
    return caseRef
      ? { kind: "time_entry", minutes, caseRef, description, billable: !/\bnicht\s+abrechenbar\b/i.test(trimmed) }
      : { kind: "unknown", message: "Zu welcher Akte soll ich die Zeit buchen? Beispiel: zeit 20m akt 2026-014 telefonat" };
  }

  const expenseMatch = trimmed.match(/^(?:auslage|kosten|spesen)\s+(?:(?:akt|akte)\s+([^:]+):\s*)?(.+)$/i);
  if (expenseMatch) {
    const body = expenseMatch[2].trim();
    const amountMatch = body.match(/(\d+(?:[,.]\d{1,2})?)\s*(?:eur|euro|€)?/i);
    if (!amountMatch) {
      return { kind: "unknown", message: "Bitte Betrag für die Auslage angeben, z.B. `auslage akt 2026-014: 12,50 eur kopien`." };
    }
    const amount = Math.max(0, Number.parseFloat(amountMatch[1].replace(",", ".")));
    const description = body
      .replace(amountMatch[0], "")
      .replace(/\b(eur|euro)\b/gi, "")
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

  const statusMatch = trimmed.match(/^(?:status|abrechnung|offen)\s+(?:zu\s+)?(?:(?:akt|akte)\s+)?(.+)$/i);
  if (statusMatch) return { kind: "invoice_status", caseRef: statusMatch[1].trim() };

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
    if (!dateMatch) return { kind: "unknown", message: "Bitte Datum für die Frist angeben, z.B. `frist akt 2026-014: Berufung 2026-07-01`." };
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

  if (lower.includes("offen abrechenbar") || lower.includes("offene abrechnung")) {
    const caseMatch = trimmed.match(/\b(?:akt|akte)\s+([^,;:\n]+)/i);
    if (caseMatch) return { kind: "invoice_status", caseRef: caseMatch[1].trim() };
  }

  return {
    kind: "unknown",
    message: "Ich habe das noch nicht sicher verstanden. Schreibe z.B. `zeit 20m akt 2026-014 telefonat`, `notiz akt 2026-014: ...` oder `status akt 2026-014`.",
  };
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

async function createPendingAction(ctx: ChatContext, intent: Extract<ParsedIntent, { kind: "time_entry" | "expense" | "case_note" | "task" | "deadline" }>, target: BrainPage): Promise<string> {
  const id = randomUUID();
  const slug = `legal/chat/actions/${id}`;
  const title =
    intent.kind === "time_entry" ? "Zeitbuchung bestätigen"
    : intent.kind === "expense" ? "Auslage bestätigen"
    : intent.kind === "case_note" ? "Aktennotiz bestätigen"
    : intent.kind === "task" ? "Aufgabe bestätigen"
    : "Frist bestätigen";
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
      target_slug: target.slug,
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
  if (!targetSlug || !payload) throw new Error("pending action incomplete");
  const casePage = await getPage(ctx.sender.brainId, targetSlug);
  const caseFm = fm(casePage);

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

export async function handleLegalChatMessage(ctx: ChatContext): Promise<string> {
  const intent = parseIntent(ctx.text);
  await createInboxPage(ctx, intent).catch((err) => {
    console.warn("[legal-chat] inbox write failed:", err instanceof Error ? err.message : String(err));
  });

  if (intent.kind === "help") {
    return [
      "Kanzlei OS WhatsApp-Befehle:",
      "zeit 20m akt 2026-014 telefonat mit mandant",
      "auslage akt 2026-014: 12,50 eur kopien",
      "notiz akt 2026-014: gegner bietet 8000 eur",
      "aufgabe akt 2026-014: klageentwurf prüfen bis 2026-07-01",
      "frist akt 2026-014: Berufung 2026-07-01",
      "status akt 2026-014",
      "zusammenfassung akt 2026-014",
      "frage: was weißt du über Müller Vergleich?",
      "PDF/Foto/Audio mit Beschriftung `akt 2026-014` wird im Vault gespeichert und der Akte zugeordnet.",
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
    const answer = await think(ctx.sender.brainId, intent.query);
    return answer.slice(0, 3500);
  }

  return intent.message;
}

export async function handleLegalChatMedia(ctx: MediaChatContext, media: StoredWhatsAppMedia): Promise<string> {
  await createMediaInboxPage(ctx, media).catch((err) => {
    console.warn("[legal-chat] media inbox write failed:", err instanceof Error ? err.message : String(err));
  });

  let target: BrainPage | null = null;
  const caseRef = parseCaseRefFromText(ctx.caption || "");
  if (caseRef) target = await resolveCase(ctx.sender.brainId, caseRef);

  const documentSlug = await createMediaVaultPage(ctx, media, target);
  if (target) {
    await attachMediaToCase(ctx, target, media, documentSlug);
    return `Gespeichert: ${media.kind} "${media.filename}" wurde im Vault abgelegt und an "${target.title}" gehängt.`;
  }

  if (caseRef) {
    const help = await caseLookupHelp(ctx.sender.brainId, caseRef);
    return `Gespeichert im Vault, aber nicht eindeutig zugeordnet.\n${help}`;
  }

  return `Gespeichert im Vault: ${media.kind} "${media.filename}". Für direkte Zuordnung beim Senden bitte Beschriftung mit Akte nutzen, z.B. "akt 2026-014".`;
}
