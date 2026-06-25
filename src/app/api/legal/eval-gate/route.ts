/**
 * Gap 15: Eval Gate API Endpoint.
 *
 * POST /api/legal/eval-gate
 * Body: { specialist: string, leave_one_out?: boolean, threshold?: number }
 *
 * Führt ein Eval-Gate für einen Specialist aus und gibt das Ergebnis zurück.
 * Harvey-Feature: "Before any Tool Bundle or system prompt upgrade can be deployed,
 * it must pass tests demonstrating that existing capabilities maintain their
 * performance levels."
 */

import { NextRequest, NextResponse } from "next/server";
import type { evalGate as _evalGate } from "@/../server/src/core/legal/eval-framework";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const specialist = body.specialist;
    const leaveOneOut = body.leave_one_out ?? false;
    const threshold = body.threshold ?? 0.8;

    if (!specialist || typeof specialist !== "string") {
      return NextResponse.json({ error: "specialist is required" }, { status: 400 });
    }

    // In production, this would use the real engine + queue
    // For now, we return a structured response indicating the eval gate is available
    const result = {
      specialist,
      status: "eval-gate-available",
      message: `Eval gate for "${specialist}" is configured. Run with engine + queue to execute.`,
      leave_one_out: leaveOneOut,
      threshold,
      datasets_available: ["on-scanner", "entity-extractor", "forensic-analyst", "legal-critic"],
    };

    return NextResponse.json(result);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
