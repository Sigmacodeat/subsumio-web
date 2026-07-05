import { NextResponse } from "next/server";
import { ENGINE_URL } from "@/lib/engine";
import { createHandler } from "@/lib/api-handler";
import { computeDeadlineStatus, normalizeFristenbuchStatus } from "@/lib/legal-deadlines";
import { caseFrontmatter } from "@/lib/legal-types";
import { timelineToDeadline } from "@/lib/legal-deadlines";
import type { DeadlineStatus } from "@/lib/legal-deadlines";
import { z } from "zod";

export const dynamic = "force-dynamic";

const querySchema = z.object({
  case: z.string().max(500).optional(),
  status: z.string().max(50).optional(),
  heute: z.string().max(10).optional(),
});

/**
 * Unified Fristen Read-Model — GET /api/legal/fristen
 *
 * Merges deadlines from three sources into one deduplicated list:
 *   1. Engine Fristenbuch (deterministic classification via frist-engine)
 *   2. legal_deadline pages (standalone deadline pages in the brain)
 *   3. legal_case frontmatter.deadlines[] (deadlines embedded in case pages)
 *
 * All three are mapped to the canonical Frist type with a single
 * DeadlineStatus enum. Deduplication key: (case_slug + due_date + title).
 *
 * Query params:
 *   - case: filter by case slug
 *   - status: filter by status (overdue, critical, warning, vorfrist, pending, done)
 *   - heute: override "today" date (ISO YYYY-MM-DD, for testing)
 */

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
  vorfrist_date?: string;
  is_notfrist?: boolean;
  second_check_required?: boolean;
  second_check_by?: string;
  second_check_at?: string;
  erv_zustelldatum?: string;
  review_status?: string;
  reminder_sent_at?: string;
  calculation_note?: string;
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

export const GET = createHandler(
  {
    action: "brain.read",
    rateTier: "standard",
    query: querySchema,
  },
  async (ctx, _body, query) => {
    const caseFilter = query.case;
    const statusFilter = query.status;
    const heute = query.heute;

    const fristen: Frist[] = [];
    const seen = new Set<string>();

    // ── Source 1: Engine Fristenbuch ──────────────────────────────────────
    try {
      const params = new URLSearchParams();
      if (caseFilter) params.set("case", caseFilter);
      if (heute) params.set("heute", heute);

      const url = `${ENGINE_URL}/api/legal/fristenbuch${params.toString() ? `?${params}` : ""}`;
      const res = await fetch(url, {
        headers: ctx.headers,
        signal: AbortSignal.timeout(15_000),
      });
      if (res.ok) {
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
            };
            const key = dedupKey(f);
            if (!seen.has(key)) {
              seen.add(key);
              fristen.push(f);
            }
          }
        }
      }
    } catch {
      // Engine fristenbuch unavailable — continue with brain pages
    }

    // ── Source 2+3: Brain pages (legal_deadline + legal_case) ─────────────
    try {
      const batchUrl = new URL(`${ENGINE_URL}/api/pages/batch-list`);
      batchUrl.searchParams.set("types", "legal_deadline,legal_case");
      batchUrl.searchParams.set("limit", "300");

      const batchRes = await fetch(batchUrl.toString(), {
        headers: ctx.headers,
        signal: AbortSignal.timeout(15_000),
      });
      if (batchRes.ok) {
        const batchData = (await batchRes.json()) as {
          results?: Record<string, BrainPage[]>;
        };
        const deadlinePages = batchData.results?.["legal_deadline"] ?? [];
        const casePages = batchData.results?.["legal_case"] ?? [];

        // Source 2: standalone legal_deadline pages
        for (const page of deadlinePages) {
          const fm = page.frontmatter ?? {};
          const dueDate = String(fm.due_date ?? fm.date ?? "");
          if (!dueDate) continue;
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
              typeof fm.status === "string" ? fm.status : undefined,
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
            second_check_by:
              typeof fm.second_check_by === "string" ? fm.second_check_by : undefined,
            second_check_at:
              typeof fm.second_check_at === "string" ? fm.second_check_at : undefined,
            erv_zustelldatum:
              typeof fm.erv_zustelldatum === "string" ? fm.erv_zustelldatum : undefined,
            review_status: typeof fm.review_status === "string" ? fm.review_status : undefined,
            reminder_sent_at:
              typeof fm.reminder_sent_at === "string" ? fm.reminder_sent_at : undefined,
            calculation_note:
              typeof fm.calculation_note === "string" ? fm.calculation_note : undefined,
            created_at: page.created_at,
            updated_at: page.updated_at,
          };
          const key = dedupKey(f);
          if (!seen.has(key)) {
            seen.add(key);
            fristen.push(f);
          }
        }

        // Source 3: legal_case frontmatter.deadlines[]
        for (const page of casePages) {
          if (caseFilter && page.slug !== caseFilter) continue;
          const fm = caseFrontmatter(page);
          const rawDeadlines = fm.deadlines ?? [];
          for (const d of rawDeadlines) {
            const dueDate = d.due_date;
            if (!dueDate) continue;

            const f: Frist = {
              id: d.id || `${page.slug}-${dueDate}`,
              case_slug: page.slug,
              case_title: page.title,
              title: d.title || d.description || "Frist",
              description: d.description,
              due_date: dueDate.slice(0, 10),
              status: computeDeadlineStatus(dueDate, d.status, d.vorfrist_date, d.erv_zustelldatum),
              type: d.type || "deadline",
              law: d.law,
              court: d.court,
              source: "legal_case",
              source_slug: page.slug,
              vorfrist_date: d.vorfrist_date,
              is_notfrist: d.is_notfrist,
              second_check_required: d.second_check_required,
              second_check_by: d.second_check_by,
              second_check_at: d.second_check_at,
              erv_zustelldatum: d.erv_zustelldatum,
              review_status: d.review_status,
              reminder_sent_at: d.reminder_sent_at,
              calculation_note: d.calculation_note,
            };
            const key = dedupKey(f);
            if (!seen.has(key)) {
              seen.add(key);
              fristen.push(f);
            }
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
              const key = dedupKey(f);
              if (!seen.has(key)) {
                seen.add(key);
                fristen.push(f);
              }
            }
          }
        }
      }
    } catch {
      // Brain pages unavailable — return what we have from fristenbuch
    }

    // ── Filter by status ──────────────────────────────────────────────────
    const filtered = statusFilter ? fristen.filter((f) => f.status === statusFilter) : fristen;

    // ── Sort: overdue first, then by due_date ascending ───────────────────
    const statusRank: Record<DeadlineStatus, number> = {
      overdue: 0,
      critical: 1,
      warning: 2,
      vorfrist: 3,
      pending: 4,
      done: 5,
    };
    filtered.sort(
      (a, b) => statusRank[a.status] - statusRank[b.status] || a.due_date.localeCompare(b.due_date)
    );

    // ── Summary ───────────────────────────────────────────────────────────
    const zusammenfassung = {
      gesamt: filtered.length,
      overdue: filtered.filter((f) => f.status === "overdue").length,
      critical: filtered.filter((f) => f.status === "critical").length,
      warning: filtered.filter((f) => f.status === "warning").length,
      vorfrist: filtered.filter((f) => f.status === "vorfrist").length,
      pending: filtered.filter((f) => f.status === "pending").length,
      done: filtered.filter((f) => f.status === "done").length,
    };

    return NextResponse.json({
      fristen: filtered,
      zusammenfassung,
    });
  }
);
