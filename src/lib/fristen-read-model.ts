import { listEnginePages } from "@/lib/engine-pages";
import { ENGINE_URL } from "@/lib/engine";
import { activeDelegateFor, type AbsenceRecord } from "@/lib/absence";
import {
  computeDeadlineStatus,
  normalizeFristenbuchStatus,
  timelineToDeadline,
  type DeadlineStatus,
} from "@/lib/legal-deadlines";
import { caseFrontmatter } from "@/lib/legal-types";
import { isClosedDeadline, isDiscardedDeadline } from "@/lib/deadline-reminders";
import { createTtlCache, headersCacheKey } from "@/lib/server-ttl-cache";

/**
 * Unified Fristen Read-Model — shared by GET /api/legal/fristen and the
 * deadline calendar feeds (src/lib/deadlines-ics.ts).
 *
 * Merges deadlines from three sources into one deduplicated list:
 *   1. Engine Fristenbuch (deterministic classification via frist-engine)
 *   2. legal_deadline pages (standalone deadline pages in the brain)
 *   3. legal_case frontmatter.deadlines[] (deadlines embedded in case pages)
 *
 * All three are mapped to the canonical Frist type with a single
 * DeadlineStatus enum. Deduplication key: (case_slug + due_date + title).
 * (plus timeline events of the matters).
 *
 * Failure handling: a missed deadline is a malpractice event, so a source that
 * fails to load is never passed off as "no deadlines" — it is reported in
 * `failedSources` (page lists are read strictly), and every caller must surface
 * it: the route as `partial: true` / 503, the calendar feeds as 502.
 */

/** Deadline sources a failed read is reported under (`failed_sources`). */
export type FristenSource = "fristenbuch" | "legal_deadline" | "legal_case" | "absence_record";

export interface Frist {
  id: string;
  case_slug?: string;
  case_title?: string;
  title: string;
  description?: string;
  due_date: string;
  status: DeadlineStatus;
  type: string;
  law?: string;
  court?: string;
  source: "fristenbuch" | "legal_deadline" | "legal_case" | "timeline";
  source_slug?: string;
  /**
   * For `legal_case` rows: identity of the entry inside the matter's
   * `deadlines[]` (its stored `id`, or raw title + due_date for legacy entries).
   * `source_slug` is then the MATTER — writes must target this one entry, never
   * the matter page itself.
   */
  deadline_ref?: { id?: string; title?: string; due_date?: string };
  vorfrist_date?: string;
  is_notfrist?: boolean;
  second_check_required?: boolean;
  second_check_by?: string;
  second_check_at?: string;
  erv_zustelldatum?: string;
  review_status?: string;
  reviewed_by?: string;
  reminder_sent_at?: string;
  calculation_note?: string;
  /** Responsible lawyer of the matter (case frontmatter own_lawyer_name). */
  responsible?: string;
  /** Who stands in while the responsible lawyer is away (Urlaubsvertretung). */
  deputy?: string;
  /** Last day of that absence, ISO date. */
  deputy_until?: string;
  /** Erledigungsvermerk: when and by whom the deadline was completed. */
  completed_at?: string;
  completed_by?: string;
  created_at?: string;
  updated_at?: string;
}

interface FristenbuchEintrag {
  case_slug: string;
  datum: string;
  frist: string;
  rechtsgrundlage: string;
  folge_bei_versaeumnis: string;
  beleg_on: string;
  ampel: string;
  status: DeadlineStatus;
  vorfrist: string;
  eskalation: boolean;
  review_status?: "approved" | "unreviewed";
}

interface FristenbuchResponse {
  heute: string;
  eintraege: FristenbuchEintrag[];
  zusammenfassung: Record<string, number>;
}

interface BrainPage {
  slug: string;
  title?: string;
  type?: string;
  frontmatter?: Record<string, unknown>;
  created_at?: string;
  updated_at?: string;
}

function dedupKey(f: Frist): string {
  return `${f.case_slug ?? "_"}|${f.due_date}|${f.title.slice(0, 80)}`;
}

function str(value: unknown): string | undefined {
  return typeof value === "string" && value ? value : undefined;
}

/**
 * The same deadline often appears in several sources. Keep the first entry but
 * fill in fields it lacks (second check, review, completion) from later ones,
 * and let a completion always win — a completed deadline must never be shown
 * as overdue just because another source still lists it as open.
 */
function mergeFrist(existing: Frist, incoming: Frist): void {
  const target = existing as unknown as Record<string, unknown>;
  // An explicit deadline page beats the AI-extracted pipeline calendar: once a
  // lawyer approved a calendar row (→ approved legal_deadline), that page's
  // slug, review and completion state are authoritative.
  const incomingWins = existing.source === "fristenbuch" && incoming.source !== "fristenbuch";
  for (const [key, value] of Object.entries(incoming)) {
    if (value === undefined) continue;
    if (incomingWins || target[key] === undefined) target[key] = value;
  }
  if (incoming.status === "done") existing.status = "done";
}

/** Sources whose failure makes the deadline list incomplete. */
export const DEADLINE_SOURCES: readonly FristenSource[] = [
  "fristenbuch",
  "legal_deadline",
  "legal_case",
];

export interface FristenReadModel {
  /** Deduplicated deadlines, unsorted, unfiltered by status. */
  fristen: Frist[];
  /** Sources that failed to load — never silently treated as "empty". */
  failedSources: FristenSource[];
}

/** Safety stop per page type — far beyond any real firm; reaching it is reported. */
export const FRISTEN_READ_CAP = 100_000;

/** Loads and merges every deadline source for the caller behind `headers`. */
export async function loadFristenReadModel(
  headers: Record<string, string>,
  opts: { caseFilter?: string; heute?: string } = {}
): Promise<FristenReadModel> {
  const caseFilter = opts.caseFilter;
  const heute = opts.heute;
  const fristen: Frist[] = [];
  const byKey = new Map<string, Frist>();
  const addFrist = (f: Frist) => {
    const key = dedupKey(f);
    const existing = byKey.get(key);
    if (existing) {
      mergeFrist(existing, f);
      return;
    }
    byKey.set(key, f);
    fristen.push(f);
  };
  const responsibleByCase = new Map<string, string>();
  const absenceRecords: AbsenceRecord[] = [];
  const titleByCase = new Map<string, string>();
  const failedSources: FristenSource[] = [];

  // ── Source 1: Engine Fristenbuch ──────────────────────────────────────
  try {
    const params = new URLSearchParams();
    if (caseFilter) params.set("case", caseFilter);
    if (heute) params.set("heute", heute);

    const url = `${ENGINE_URL}/api/legal/fristenbuch${params.toString() ? `?${params}` : ""}`;
    const res = await fetch(url, {
      headers,
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) {
      failedSources.push("fristenbuch");
    } else {
      const data = (await res.json()) as FristenbuchResponse;
      if (data?.eintraege && Array.isArray(data.eintraege)) {
        for (const e of data.eintraege) {
          const status = normalizeFristenbuchStatus(String(e.status ?? "ok"));
          const f: Frist = {
            id: `fb-${e.case_slug}-${e.datum}-${e.frist.slice(0, 20)}`,
            case_slug: e.case_slug,
            title: e.frist,
            due_date: e.datum,
            status,
            type: "deadline",
            law: e.rechtsgrundlage,
            source: "fristenbuch",
            vorfrist_date: e.vorfrist || undefined,
            // Pipeline calendars are AI-extracted: "unreviewed" until a
            // lawyer approves the row (older engines omit the field).
            review_status: e.review_status ?? "unreviewed",
          };
          addFrist(f);
        }
      }
    }
  } catch {
    // Engine fristenbuch unavailable — continue with brain pages, but say so.
    failedSources.push("fristenbuch");
  }

  // ── Source 2+3: Brain pages (legal_deadline + legal_case) ─────────────
  {
    // All matters and deadlines, in batches; deleted deadlines are left out.
    // strict + failOnTruncate: a failed batch or a list cut at the safety
    // stop must surface as a failed source, never as a silently shortened
    // list (the listing is newest-first, so a cut would drop exactly the
    // long-untouched deadlines that are now falling due). With a matter
    // filter, the engine selects only that matter's rows.
    const fetchPagesByType = async (type: FristenSource): Promise<BrainPage[]> => {
      try {
        const scoped: Parameters<typeof listEnginePages>[3] = !caseFilter
          ? {}
          : type === "legal_deadline"
            ? { frontmatter: { case_slug: caseFilter } }
            : type === "legal_case"
              ? { slugPrefix: caseFilter }
              : {};
        return (await listEnginePages(headers, type, FRISTEN_READ_CAP, {
          strict: true,
          failOnTruncate: true,
          ...scoped,
        })) as unknown as BrainPage[];
      } catch {
        failedSources.push(type);
        return [];
      }
    };
    const [deadlinePages, casePages, absencePages] = await Promise.all([
      fetchPagesByType("legal_deadline"),
      fetchPagesByType("legal_case"),
      fetchPagesByType("absence_record"),
    ]);
    // Deadlines have no assignee of their own — they inherit the matter's
    // responsible lawyer. While that lawyer is away, the deadline names the
    // stand-in instead of silently staying with someone on holiday.
    for (const page of absencePages) {
      const record = page.frontmatter as unknown as AbsenceRecord | undefined;
      if (record?.user_email) absenceRecords.push(record);
    }
    for (const casePage of casePages) {
      const lawyer = str(casePage.frontmatter?.own_lawyer_name);
      if (lawyer) responsibleByCase.set(casePage.slug, lawyer);
      if (casePage.title) titleByCase.set(casePage.slug, casePage.title);
    }

    // Source 2: standalone legal_deadline pages
    for (const page of deadlinePages) {
      const fm = page.frontmatter ?? {};
      const dueDate = String(fm.due_date ?? fm.date ?? "");
      if (!dueDate) continue;
      // A discarded AI suggestion must not linger in the Fristenbuch —
      // and a cancelled or deleted deadline must not resurface as "overdue"
      // (computeDeadlineStatus only knows "done" as closed).
      if (isDiscardedDeadline(fm)) continue;
      if (caseFilter && fm.case_slug !== caseFilter) continue;

      const f: Frist = {
        id: page.slug || `ld-${dueDate}`,
        source_slug: page.slug,
        case_slug: typeof fm.case_slug === "string" ? fm.case_slug : undefined,
        case_title: typeof fm.case_title === "string" ? fm.case_title : undefined,
        title: String(fm.description ?? fm.title ?? page.title ?? "Frist"),
        description: typeof fm.description === "string" ? fm.description : undefined,
        due_date: dueDate.slice(0, 10),
        status: computeDeadlineStatus(
          dueDate,
          // "erledigt", "completed", … are done too — same closed set as
          // the reminders (isClosedDeadline), never "overdue".
          isClosedDeadline(fm) ? "done" : typeof fm.status === "string" ? fm.status : undefined,
          typeof fm.vorfrist_date === "string" ? fm.vorfrist_date : undefined,
          typeof fm.erv_zustelldatum === "string" ? fm.erv_zustelldatum : undefined
        ),
        type: String(fm.event_type ?? fm.type ?? "deadline"),
        law: typeof fm.law === "string" ? fm.law : undefined,
        court: typeof fm.court === "string" ? fm.court : undefined,
        source: "legal_deadline",
        vorfrist_date: typeof fm.vorfrist_date === "string" ? fm.vorfrist_date : undefined,
        is_notfrist: fm.is_notfrist === true,
        second_check_required: fm.second_check_required === true,
        second_check_by: typeof fm.second_check_by === "string" ? fm.second_check_by : undefined,
        second_check_at: typeof fm.second_check_at === "string" ? fm.second_check_at : undefined,
        erv_zustelldatum: typeof fm.erv_zustelldatum === "string" ? fm.erv_zustelldatum : undefined,
        review_status: typeof fm.review_status === "string" ? fm.review_status : undefined,
        reviewed_by: typeof fm.reviewed_by === "string" ? fm.reviewed_by : undefined,
        reminder_sent_at: typeof fm.reminder_sent_at === "string" ? fm.reminder_sent_at : undefined,
        calculation_note: typeof fm.calculation_note === "string" ? fm.calculation_note : undefined,
        completed_at: str(fm.completed_at),
        completed_by: str(fm.completed_by),
        created_at: page.created_at,
        updated_at: page.updated_at,
      };
      addFrist(f);
    }

    // Source 3: legal_case frontmatter.deadlines[]
    for (const page of casePages) {
      if (caseFilter && page.slug !== caseFilter) continue;
      const fm = caseFrontmatter(page);
      const rawDeadlines = fm.deadlines ?? [];
      for (const d of rawDeadlines) {
        const dueDate = d.due_date;
        if (!dueDate) continue;
        // Stored JSON can carry "cancelled"/"storniert"/"erledigt" even
        // though the DeadlineStatus union doesn't list them; a discarded AI
        // suggestion is gone here just like on a deadline page.
        if (isDiscardedDeadline(d)) continue;

        const f: Frist = {
          id: d.id || `${page.slug}-${dueDate}`,
          case_slug: page.slug,
          case_title: page.title,
          title: d.title || d.description || "Frist",
          description: d.description,
          due_date: dueDate.slice(0, 10),
          status: computeDeadlineStatus(
            dueDate,
            isClosedDeadline(d) ? "done" : d.status,
            d.vorfrist_date,
            d.erv_zustelldatum
          ),
          type: d.type || "deadline",
          law: d.law,
          court: d.court,
          source: "legal_case",
          source_slug: page.slug,
          deadline_ref: d.id ? { id: d.id } : { title: d.title ?? "", due_date: d.due_date },
          vorfrist_date: d.vorfrist_date,
          is_notfrist: d.is_notfrist,
          second_check_required: d.second_check_required,
          second_check_by: d.second_check_by,
          second_check_at: d.second_check_at,
          erv_zustelldatum: d.erv_zustelldatum,
          review_status: d.review_status,
          reviewed_by: d.reviewed_by,
          reminder_sent_at: d.reminder_sent_at,
          calculation_note: d.calculation_note,
          completed_at: str((d as unknown as Record<string, unknown>).completed_at),
          completed_by: str((d as unknown as Record<string, unknown>).completed_by),
        };
        addFrist(f);
      }

      // Also extract timeline entries that are deadlines/events
      const timeline = [...(fm.timeline ?? []), ...(fm.timeline_events ?? [])];
      for (const entry of timeline) {
        if (
          entry.date &&
          (entry.type === "deadline" || entry.type === "event" || entry.type === "hearing")
        ) {
          const d = timelineToDeadline(entry, page.slug);
          const f: Frist = {
            id: d.id || `${page.slug}-${entry.date}`,
            case_slug: page.slug,
            case_title: page.title,
            title: d.description || d.title || "Termin",
            due_date: entry.date.slice(0, 10),
            status: computeDeadlineStatus(entry.date, d.status),
            type: d.type || "event",
            source: "timeline",
            source_slug: page.slug,
          };
          addFrist(f);
        }
      }
    }
  }

  for (const f of fristen) {
    if (f.case_slug && !f.responsible) f.responsible = responsibleByCase.get(f.case_slug);
    if (f.case_slug && !f.case_title) f.case_title = titleByCase.get(f.case_slug);
    const deputy = activeDelegateFor(
      f.responsible,
      absenceRecords,
      heute ? new Date(heute) : undefined
    );
    if (deputy) {
      f.deputy = deputy.name;
      f.deputy_until = deputy.until;
    }
  }

  return { fristen, failedSources };
}

/**
 * Polling surfaces (topbar warnings, copilot deadline alerts) ask for the
 * read model on every dashboard page, in every tab, every minute. They share
 * one build per caller (brain + access) and options for 30 s — the
 * Fristenbuch itself reads uncached.
 */
const pollingCache = createTtlCache<FristenReadModel>(30_000);

export function loadFristenReadModelCached(
  headers: Record<string, string>,
  opts: { caseFilter?: string; heute?: string } = {}
): Promise<FristenReadModel> {
  const key = [headersCacheKey(headers), opts.caseFilter ?? "", opts.heute ?? ""].join("\u0000");
  return pollingCache.get(key, () => loadFristenReadModel(headers, opts));
}
