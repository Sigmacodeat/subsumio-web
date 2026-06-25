/**
 * Gap 9: Chronology Builder API.
 *
 * POST /api/legal/chronology
 * Body: { case_slug, forensic_report?, on_table?, damage_table?, deadline_calendar? }
 *
 * Generiert eine Chronologie aus den Pipeline-Outputs und gibt sie zurück.
 */

import { NextRequest, NextResponse } from "next/server";
import { buildChronology, exportChronologyMarkdown } from "@/lib/legal/chronology-builder";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { case_slug, forensic_report, on_table, damage_table, deadline_calendar } = body;

    if (!case_slug || typeof case_slug !== "string") {
      return NextResponse.json({ error: "case_slug is required" }, { status: 400 });
    }

    const chrono = buildChronology(case_slug, {
      forensicReport: forensic_report ?? null,
      onTable: on_table ?? [],
      damageTable: damage_table ?? [],
      deadlineCalendar: deadline_calendar ?? [],
    });

    const md = exportChronologyMarkdown(chrono);

    return NextResponse.json({
      chronology: chrono,
      markdown: md,
      count: chrono.entries.length,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
