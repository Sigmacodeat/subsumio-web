/**
 * CTI-Integration (WP-4.20) — provider-neutrale Telefonie-Anbindung.
 *
 * Placetel, sipgate, 3CX & Co. senden Webhooks mit eigenen Payloads; die
 * Route normalisiert auf `CtiCallEvent`. Anruferkennung läuft über die
 * hinterlegte Telefonnummer in den Kontakten (fm.phone).
 *
 * Sicherheit: Bearer-Token via CTI_WEBHOOK_SECRET — ohne Secret ist die
 * Route nicht aktiv (503 statt stillem Offenstehen).
 */

export type CtiEventType = "ringing" | "answered" | "ended" | "missed";

export interface CtiCallEvent {
  /** Provider-Call-ID (Placetel call_id, sipgate callId, 3CX id). */
  callId: string;
  event: CtiEventType;
  /** Anrufernummer (bei ausgehenden: die Zielnummer). */
  caller: string;
  /** Angerufene Nebenstelle/Nummer der Kanzlei. */
  callee?: string;
  direction: "inbound" | "outbound";
  at: string;
  /** Gesprächsdauer in Sekunden (bei event=ended). */
  durationS?: number;
}

// ── Telefonnummern ───────────────────────────────────────────────────

/** Auf Ziffern reduzieren; +43/0043/043 → internationale Form ohne '+'. */
export function normalisePhone(raw: string): string {
  let d = (raw ?? "").replace(/[^\d+]/g, "");
  if (d.startsWith("+")) d = d.slice(1);
  if (d.startsWith("00")) d = d.slice(2);
  return d;
}

/**
 * Nummern vergleichen über Suffixe — robust gegenüber 0676…/+43 676…/
 * 0043 676… und der Trunk-0 (01 5050000 vs. +43 1 5050000). Jede Seite
 * wird in Varianten (mit und ohne führende 0) suffix-verglichen.
 */
export function phoneMatches(a: string, b: string): boolean {
  const variants = (v: string): string[] => {
    const n = normalisePhone(v);
    if (!n) return [];
    const stripped = n.replace(/^0+/, "");
    return stripped !== n ? [n, stripped] : [n];
  };
  for (const na of variants(a)) {
    for (const nb of variants(b)) {
      if (na === nb) return true;
      // Mindestens 7 signifikante Ziffern müssen übereinstimmen, sonst
      // wäre jede Durchwahl ein Treffer.
      const shorter = na.length <= nb.length ? na : nb;
      if (shorter.length >= 7 && (na.endsWith(nb) || nb.endsWith(na))) return true;
    }
  }
  return false;
}

// ── Provider-Payloads normalisieren ──────────────────────────────────

interface RawPayload {
  [key: string]: unknown;
}

function str(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}

function num(v: unknown): number | undefined {
  const n = typeof v === "number" ? v : parseInt(String(v ?? ""), 10);
  return Number.isFinite(n) && n >= 0 ? n : undefined;
}

/**
 * Akzeptiert das neutrale Format {event, call_id, caller, callee, direction}
 * sowie die gängigen Provider-Varianten:
 *  - Placetel:  {event: "IncomingCall"|"CallAnswered"|"Hangup"|"MissedCall",
 *                call_id, from, to}
 *  - sipgate:   {event: "newCall"|"answer"|"hangup"|"onHook", callId, from, to}
 *  - 3CX:       {event_type: "ringing"|"answered"|"ended"|"missed",
 *                call_id, caller_number, extension}
 */
export function parseCtiPayload(raw: RawPayload): CtiCallEvent | null {
  const eventRaw = str(raw.event ?? raw.event_type).toLowerCase();
  const eventMap: Record<string, CtiEventType> = {
    ringing: "ringing",
    incomingcall: "ringing",
    newcall: "ringing",
    answered: "answered",
    callanswered: "answered",
    answer: "answered",
    ended: "ended",
    hangup: "ended",
    onhook: "ended",
    missed: "missed",
    missedcall: "missed",
  };
  const event = eventMap[eventRaw];
  if (!event) return null;

  const caller =
    str(raw.caller) || str(raw.caller_number) || str(raw.from) || str(raw.callerNumber);
  const callee = str(raw.callee) || str(raw.to) || str(raw.extension);
  const callId = str(raw.call_id) || str(raw.callId) || str(raw.id) || `cti-${Date.now()}`;
  if (!caller) return null;

  const dirRaw = str(raw.direction).toLowerCase();
  const direction: CtiCallEvent["direction"] =
    dirRaw === "outbound" || dirRaw === "outgoing" || dirRaw === "out" ? "outbound" : "inbound";

  const at = str(raw.at) || str(raw.timestamp) || new Date().toISOString();
  const durationS = num(raw.duration_s ?? raw.duration ?? raw.duration_seconds);

  return { callId, event, caller, callee, direction, at, durationS };
}

// ── Anruferkennung ───────────────────────────────────────────────────

export interface CallerMatch {
  contactSlug: string;
  contactName: string;
  role?: string;
  /** Akten, die den Kontakt verlinken (client_slug/court_slug/opponent_slugs). */
  caseSlugs: Array<{ slug: string; title: string }>;
}

interface PageLike {
  slug: string;
  title: string;
  frontmatter?: Record<string, unknown>;
}

/** Findet Kontakte mit passender Telefonnummer und deren verlinkte Akten. */
export function findCallerMatches(
  callerNumber: string,
  contacts: PageLike[],
  cases: PageLike[]
): CallerMatch[] {
  const matches: CallerMatch[] = [];
  for (const c of contacts) {
    const fm = c.frontmatter ?? {};
    const phones = [fm.phone, fm.mobile, fm.fax].filter(
      (p): p is string => typeof p === "string" && p.trim().length > 3
    );
    if (!phones.some((p) => phoneMatches(p, callerNumber))) continue;
    const caseSlugs = cases
      .filter((kase) => {
        const kf = kase.frontmatter ?? {};
        if (kf.client_slug === c.slug || kf.court_slug === c.slug) return true;
        const opp = kf.opponent_slugs;
        return Array.isArray(opp) && opp.includes(c.slug);
      })
      .map((kase) => ({ slug: kase.slug, title: kase.title }));
    matches.push({
      contactSlug: c.slug,
      contactName: (typeof fm.name === "string" && fm.name) || c.title,
      role: typeof fm.role === "string" ? fm.role : undefined,
      caseSlugs,
    });
  }
  return matches;
}

/** Brain für CTI: Ein-Instanz-Modell wie öffentliche Buchung/Erstanfrage. */
export function resolveCtiBrainId(): string | null {
  return (
    process.env.CTI_BRAIN_ID ||
    process.env.SUBSUMIO_PUBLIC_INTAKE_BRAIN_ID ||
    process.env.WHATSAPP_DEFAULT_BRAIN_ID ||
    null
  );
}
