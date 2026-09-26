import { z } from "zod";
import { apiError, createHandler } from "@/lib/api-handler";
import { ENGINE_URL } from "@/lib/engine";
import { readCurrentPage } from "@/lib/page-write-guards";
import {
  buildChronology,
  buildMatterChronology,
  exportChronologyMarkdown,
  type MatterChronologyData,
} from "@/lib/legal/chronology-builder";

export const maxDuration = 60;

const postSchema = z.object({
  case_slug: z.string().min(1).max(200),
  forensic_report: z.unknown().optional(),
  on_table: z.array(z.unknown()).max(500).optional(),
  damage_table: z.array(z.unknown()).max(500).optional(),
  deadline_calendar: z.array(z.unknown()).max(500).optional(),
});

export const POST = createHandler(
  {
    action: "brain.read",
    rateTier: "standard",
    body: postSchema,
    audit: (_ctx, body) => ({
      action: "legal.chronology_build" as const,
      entityType: "chronology",
      details: {
        case_slug: body.case_slug,
        has_forensic_report: Boolean(body.forensic_report),
        on_table_count: body.on_table?.length ?? 0,
        damage_table_count: body.damage_table?.length ?? 0,
        deadline_calendar_count: body.deadline_calendar?.length ?? 0,
      },
    }),
  },
  async (ctx, body) => {
    const hasTables =
      Boolean(body.forensic_report) ||
      (body.on_table?.length ?? 0) > 0 ||
      (body.damage_table?.length ?? 0) > 0 ||
      (body.deadline_calendar?.length ?? 0) > 0;
    if (!hasTables) {
      // Only the matter was named (e.g. from the Word add-in): build the
      // chronology from the matter's own dated records. Read with the
      // caller's headers, so matter access rules apply.
      const read = await readCurrentPage(ENGINE_URL, ctx.headers, body.case_slug);
      if (read.kind === "error") {
        return apiError("engine_unreachable", "Akte konnte nicht geladen werden", 503);
      }
      const page = read.kind === "found" ? read.page : null;
      const type = page?.type ?? page?.frontmatter?.type;
      if (!page || type !== "legal_case") {
        return apiError("case_not_found", "Akte nicht gefunden", 404);
      }
      const chrono = buildMatterChronology(
        body.case_slug,
        page.title ?? body.case_slug,
        (page.frontmatter ?? {}) as MatterChronologyData
      );
      return Response.json({
        chronology: chrono,
        markdown: exportChronologyMarkdown(chrono),
        count: chrono.entries.length,
      });
    }
    const chrono = buildChronology(body.case_slug, {
      forensicReport: (body.forensic_report as never) ?? null,
      onTable: (body.on_table as never) ?? [],
      damageTable: (body.damage_table as never) ?? [],
      deadlineCalendar: (body.deadline_calendar as never) ?? [],
    });
    const md = exportChronologyMarkdown(chrono);
    return Response.json({
      chronology: chrono,
      markdown: md,
      count: chrono.entries.length,
    });
  }
);
