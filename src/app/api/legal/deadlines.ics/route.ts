import { ENGINE_URL } from "@/lib/engine";
import { createHandler } from "@/lib/api-handler";
import { z } from "zod";

export const dynamic = "force-dynamic";

const querySchema = z.object({
  case: z.string().max(500).optional(),
});

/**
 * GET /api/legal/deadlines.ics — Proxies the Engine's ICS feed
 * (with Vorfrist-VALARM) to the same domain so clients can subscribe
 * without needing direct Engine access.
 *
 * The Engine's fristenbuch builds VEVENTs for each Frist plus a
 * Vorfrist VEVENT with VALARM (-P2D) for Kanzlei control dates.
 *
 * FALLBACK: When the engine's fristenbuch has no entries (e.g. a fresh
 * brain with only legal_case frontmatter.deadlines), we build the ICS
 * directly from the brain pages (legal_deadline + legal_case) using the
 * same logic as /api/legal/fristen.
 */
export const GET = createHandler(
  {
    action: "brain.read",
    rateTier: "standard",
    query: querySchema,
  },
  async (ctx, _body, query) => {
    try {
      const caseSlug = query.case ?? undefined;
      const url = `${ENGINE_URL}/api/legal/deadlines.ics${caseSlug ? `?case=${encodeURIComponent(caseSlug)}` : ""}`;
      const res = await fetch(url, {
        headers: ctx.headers,
        signal: AbortSignal.timeout(15_000),
      });
      if (res.ok) {
        const ics = await res.text();
        // If the engine returned VEVENTs, use them directly
        if (ics.includes("BEGIN:VEVENT")) {
          return new Response(ics, {
            headers: {
              "Content-Type": "text/calendar; charset=utf-8",
              "Content-Disposition": 'attachment; filename="fristenbuch.ics"',
              "Cache-Control": "no-store, max-age=0",
            },
          });
        }
      }

      // Fallback: build ICS directly from brain pages (same logic as fristen API)
      const fristen = await collectFristenFromBrain(ctx, caseSlug);

      const vevents = fristen
        .filter((f) => f.due_date)
        .map((f) => {
          const dtstart = f.due_date!.replace(/-/g, "");
          const summary = (f.title || "Frist").replace(/[\\,;]/g, "\\$&");
          const description = (f.case_title || f.case_slug || "").replace(/[\\,;]/g, "\\$&");
          return [
            "BEGIN:VEVENT",
            `UID:${dtstart}-${summary.slice(0, 20)}@subsumio`,
            `DTSTAMP:${new Date()
              .toISOString()
              .replace(/[-:]/g, "")
              .replace(/\.\d+Z$/, "Z")}`,
            `DTSTART;VALUE=DATE:${dtstart}`,
            `SUMMARY:${summary}`,
            description ? `DESCRIPTION:${description}` : "",
            "END:VEVENT",
          ]
            .filter(Boolean)
            .join("\n");
        })
        .join("\n");

      const ics = [
        "BEGIN:VCALENDAR",
        "VERSION:2.0",
        "PRODID:-//Subsumio//Fristenbuch//DE",
        "CALSCALE:GREGORIAN",
        "METHOD:PUBLISH",
        "X-WR-CALNAME:Subsumio Fristenbuch",
        vevents,
        "END:VCALENDAR",
      ]
        .filter(Boolean)
        .join("\n");

      return new Response(ics, {
        headers: {
          "Content-Type": "text/calendar; charset=utf-8",
          "Content-Disposition": 'attachment; filename="fristenbuch.ics"',
          "Cache-Control": "no-store, max-age=0",
        },
      });
    } catch {
      return new Response("ICS feed unavailable", { status: 502 });
    }
  }
);

interface FristEntry {
  title?: string;
  due_date?: string;
  case_title?: string;
  case_slug?: string;
}

/**
 * Collect deadlines from brain pages (legal_deadline + legal_case) using
 * the same merge logic as /api/legal/fristen. This avoids calling the
 * web app's own HTTP endpoint (which would need the host/port) and
 * duplicates the source-2+3 logic inline.
 */
async function collectFristenFromBrain(
  ctx: { headers: Record<string, string> },
  caseFilter?: string
): Promise<FristEntry[]> {
  const fristen: FristEntry[] = [];

  const fetchPagesByType = async (type: string) => {
    const url = new URL(`${ENGINE_URL}/api/pages`);
    url.searchParams.set("type", type);
    url.searchParams.set("limit", "300");
    const res = await fetch(url.toString(), {
      headers: ctx.headers,
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) return [];
    const raw = await res.json();
    return Array.isArray(raw) ? raw : [];
  };

  try {
    const [deadlinePages, casePages] = await Promise.all([
      fetchPagesByType("legal_deadline"),
      fetchPagesByType("legal_case"),
    ]);

    // Source 2: standalone legal_deadline pages
    for (const page of deadlinePages) {
      const fm = (page as { frontmatter?: Record<string, unknown> }).frontmatter ?? {};
      const dueDate = String(fm.due_date ?? fm.date ?? "");
      if (!dueDate) continue;
      if (caseFilter && fm.case_slug !== caseFilter) continue;
      fristen.push({
        title: String(fm.description ?? fm.title ?? "Frist"),
        due_date: dueDate.slice(0, 10),
        case_slug: typeof fm.case_slug === "string" ? fm.case_slug : undefined,
        case_title: typeof fm.case_title === "string" ? fm.case_title : undefined,
      });
    }

    // Source 3: legal_case frontmatter.deadlines[]
    for (const page of casePages) {
      if (caseFilter && (page as { slug?: string }).slug !== caseFilter) continue;
      const fm = ((page as { frontmatter?: Record<string, unknown> }).frontmatter ?? {}) as {
        deadlines?: Array<{ title?: string; due_date?: string }>;
      };
      for (const d of fm.deadlines ?? []) {
        if (!d.due_date) continue;
        fristen.push({
          title: d.title || "Frist",
          due_date: d.due_date.slice(0, 10),
          case_slug: (page as { slug?: string }).slug,
          case_title: (page as { title?: string }).title,
        });
      }
    }
  } catch {
    // Brain pages unavailable — return what we have
  }

  return fristen;
}
