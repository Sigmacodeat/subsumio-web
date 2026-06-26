import { z } from "zod";
import { createHandler } from "@/lib/api-handler";
import { buildChronology, exportChronologyMarkdown } from "@/lib/legal/chronology-builder";

const postSchema = z.object({
  case_slug: z.string().min(1),
  forensic_report: z.unknown().optional(),
  on_table: z.array(z.unknown()).optional(),
  damage_table: z.array(z.unknown()).optional(),
  deadline_calendar: z.array(z.unknown()).optional(),
});

export const POST = createHandler(
  {
    action: "brain.read",
    rateTier: "standard",
    body: postSchema,
  },
  async (_ctx, body) => {
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
