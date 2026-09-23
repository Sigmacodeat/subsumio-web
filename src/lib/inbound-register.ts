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

export type InboundChannel = "upload" | "email" | "whatsapp" | "erv" | "scan" | "portal";

export const INBOUND_CHANNEL_LABEL: Record<InboundChannel, string> = {
  upload: "Hochgeladen",
  email: "E-Mail",
  whatsapp: "WhatsApp",
  erv: "ERV",
  scan: "Scan",
  portal: "Mandantenportal",
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
  created_at: string;
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
