/**
 * Posteingangsbuch (Inbound Mail Register)
 * =========================================
 * Chronologisches Register aller eingehenden Dokumente/Kommunikation
 * (Upload, E-Mail, WhatsApp, ERV, Scan) mit Eingangsstempel und laufender
 * Nummer. Pendant zum bereits vorhandenen Postausgangsbuch
 * (outbound-register.ts) — für den Posteingang gab es bislang kein
 * eigenes Register, nur die rohen Dokument-/E-Mail-Seiten selbst, ohne
 * Eingangsdatum-Stempel oder Kanal-Übersicht an einer Stelle.
 */

export type InboundChannel = "upload" | "email" | "whatsapp" | "erv" | "scan" | "portal" | "share";

export const INBOUND_CHANNEL_LABEL: Record<InboundChannel, string> = {
  upload: "Hochgeladen",
  email: "E-Mail",
  whatsapp: "WhatsApp",
  erv: "ERV",
  scan: "Scan",
  portal: "Mandantenportal",
  share: "Geteilt",
};

export interface InboundEntry {
  id: string;
  /** Eingangsdatum — der GoBD-relevante Zeitpunkt, nicht das Dokumentdatum selbst. */
  received_at: string;
  channel: InboundChannel;
  direction: "inbound";
  sender_name?: string;
  sender_address?: string;
  case_slug?: string;
  subject: string;
  document_slug?: string;
  received_by?: string;
  notes?: string;
  /** Automatische Aktenzuordnung — Vorschlag, noch nicht bestätigt. */
  case_suggested?: boolean;
  case_suggest_reason?: string;
  /** Who confirmed or corrected the matter, and when. */
  case_confirmed_by?: string;
  case_confirmed_at?: string;
  /** Every change of the assignment — the receipt stamp itself never changes. */
  assignment_history?: InboundAssignmentChange[];
  created_at: string;
}

export interface InboundAssignmentChange {
  from?: string;
  to: string;
  by: string;
  by_id?: string;
  at: string;
  /** confirmed = the suggestion was accepted as is. */
  kind: "confirmed" | "reassigned";
}

export function isInboundEntryPage(page: {
  type?: unknown;
  frontmatter?: Record<string, unknown>;
}): boolean {
  return page.type === "inbound_entry" || page.frontmatter?.type === "inbound_entry";
}

/**
 * Frontmatter merge for confirming or correcting a register entry's matter.
 * Only the assignment fields — never the receipt stamp (date, channel,
 * sender, subject). The previous matter stays visible in the history.
 */
export function inboundAssignmentUpdate(
  entry: Pick<InboundEntry, "case_slug" | "assignment_history">,
  input: { caseSlug: string; by: string; byId?: string; at: string }
): Pick<
  InboundEntry,
  "case_slug" | "case_suggested" | "case_confirmed_by" | "case_confirmed_at" | "assignment_history"
> {
  const change: InboundAssignmentChange = {
    ...(entry.case_slug ? { from: entry.case_slug } : {}),
    to: input.caseSlug,
    by: input.by,
    ...(input.byId ? { by_id: input.byId } : {}),
    at: input.at,
    kind: entry.case_slug === input.caseSlug ? "confirmed" : "reassigned",
  };
  return {
    case_slug: input.caseSlug,
    case_suggested: false,
    case_confirmed_by: input.by,
    case_confirmed_at: input.at,
    assignment_history: [...(entry.assignment_history ?? []), change],
  };
}

export interface InboundCaseCandidate {
  slug: string;
  aktenzeichen?: string;
  title?: string;
  parties?: string[];
}

const STOPWORDS = new Set([
  "der",
  "die",
  "das",
  "und",
  "oder",
  "von",
  "vom",
  "mit",
  "für",
  "gegen",
  "in",
  "im",
  "am",
  "an",
  "auf",
  "zu",
  "zur",
  "zum",
  "bei",
  "sehr",
  "geehrte",
  "betreff",
  "betreffend",
  "re",
  "az",
  "aktenzeichen",
  "schreiben",
  "post",
  "eingang",
  "datum",
  "sehr",
  "frau",
  "herr",
  "herrn",
  "kanzlei",
  "gmbh",
]);

function tokens(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[^\p{L}\p{N}-]+/u)
    .filter((w) => w.length >= 4 && !STOPWORDS.has(w));
}

/**
 * Deterministische Aktenzuordnung für Posteingänge — bewusst ohne KI:
 * ein Posteingang ist GoBD-relevant, die Zuordnung muss nachvollziehbar
 * und reproduzierbar sein. Score: Aktenzeichen-Treffer (10), Partei-
 * Name (4/Token), Betreff-Tokens gegen Titel (2/Token). Ab Score 6 gilt
 * die Zuordnung als Vorschlag (nie still übernommen).
 */
export function suggestCaseForInbound(
  input: { subject: string; senderName?: string; senderAddress?: string },
  cases: InboundCaseCandidate[]
): { slug: string; score: number; reason: string } | null {
  const haystack =
    `${input.subject} ${input.senderName ?? ""} ${input.senderAddress ?? ""}`.toLowerCase();
  const subjectTokens = new Set(tokens(input.subject));
  let best: { slug: string; score: number; reason: string } | null = null;

  for (const c of cases) {
    let score = 0;
    const reasons: string[] = [];
    if (c.aktenzeichen && haystack.includes(c.aktenzeichen.toLowerCase())) {
      score += 10;
      reasons.push(`Aktenzeichen ${c.aktenzeichen}`);
    }
    for (const party of c.parties ?? []) {
      const hits = tokens(party).filter((w) => haystack.includes(w));
      if (hits.length > 0) {
        score += hits.length * 4;
        reasons.push(`Partei ${party}`);
      }
    }
    if (c.title) {
      const hits = tokens(c.title).filter((w) => subjectTokens.has(w));
      if (hits.length > 0) score += hits.length * 2;
    }
    if (score > 0 && (best === null || score > best.score)) {
      best = { slug: c.slug, score, reason: reasons.join(", ") || "Betreff-Ähnlichkeit" };
    }
  }
  return best && best.score >= 6 ? best : null;
}

export function newInboundEntryId(): string {
  return `in-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export function createInboundEntry(input: {
  channel: InboundChannel;
  subject: string;
  senderName?: string;
  senderAddress?: string;
  caseSlug?: string;
  documentSlug?: string;
  receivedBy?: string;
  notes?: string;
}): InboundEntry {
  const now = new Date().toISOString();
  return {
    id: newInboundEntryId(),
    received_at: now,
    channel: input.channel,
    direction: "inbound",
    sender_name: input.senderName,
    sender_address: input.senderAddress,
    case_slug: input.caseSlug,
    subject: input.subject,
    document_slug: input.documentSlug,
    received_by: input.receivedBy,
    notes: input.notes,
    created_at: now,
  };
}

export function filterInboundByDateRange(
  entries: InboundEntry[],
  from: string,
  to: string
): InboundEntry[] {
  const fromTime = new Date(from).getTime();
  const toTime = new Date(to).getTime();
  return entries.filter(
    (e) =>
      new Date(e.received_at).getTime() >= fromTime && new Date(e.received_at).getTime() <= toTime
  );
}

export function exportInboundRegister(entries: InboundEntry[]): string {
  const header = "Eingangsdatum;Kanal;Absender;Adresse;Akte;Betreff\n";
  const rows = entries.map((e) =>
    [
      e.received_at.slice(0, 19),
      INBOUND_CHANNEL_LABEL[e.channel],
      e.sender_name ?? "",
      e.sender_address ?? "",
      e.case_slug ?? "",
      e.subject,
    ]
      .map((v) => `"${String(v).replace(/"/g, '""')}"`)
      .join(";")
  );
  return header + rows.join("\n") + (rows.length > 0 ? "\n" : "");
}

/** Prefilled text of a deadline created from a register entry. */
export function inboundDeadlineDescription(
  entry: Pick<InboundEntry, "subject" | "received_at">
): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(entry.received_at ?? "");
  const day = m ? `${m[3]}.${m[2]}.${m[1]}` : "";
  return `Frist aus Posteingang: ${entry.subject}${day ? ` (eingelangt ${day})` : ""}`;
}
