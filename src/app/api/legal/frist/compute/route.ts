import { NextResponse } from "next/server";
import { ENGINE_URL } from "@/lib/engine";
import { createHandler } from "@/lib/api-handler";
import { z } from "zod";

export const dynamic = "force-dynamic";

const computeSchema = z
  .object({
    start_date: z.string().max(20).optional(),
    frist_type: z.string().max(100).optional(),
    days: z.number().int().min(-365).max(365).optional(),
    law: z.string().max(50).optional(),
    case_slug: z.string().max(500).optional(),
  })
  .passthrough();

/**
 * POST /api/legal/frist/compute — Proxies the Engine's AT frist-engine
 * computation (berechneFristAuto) to the web domain.
 *
 * When the Kanzlei's Rechtsraum is AT, the web app delegates deadline
 * calculation to the deterministic frist-engine, which handles:
 *   - Zustellfiktionen (§ 89a GOG, § 17 ZustG, § 26 ZustG)
 *   - Verhandlungsfreie Zeit (§ 222 ZPO)
 *   - AVG-specific rules (§ 33 Abs 2)
 *   - Vorfrist computation
 */
export const POST = createHandler(
  {
    action: "brain.read",
    rateTier: "standard",
    body: computeSchema,
    audit: (_ctx, body) => ({
      action: "legal.frist_compute" as const,
      entityType: "frist",
      details: {
        start_date: body.start_date,
        frist_type: body.frist_type,
        days: body.days,
        law: body.law,
        case_slug: body.case_slug,
      },
    }),
  },
  async (ctx, body) => {
    try {
      const res = await fetch(`${ENGINE_URL}/api/legal/frist/compute`, {
        method: "POST",
        headers: {
          ...ctx.headers,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(15_000),
      });
      const data = await res.json();
      if (!res.ok) {
        return NextResponse.json(data, { status: res.status });
      }
      return NextResponse.json(data);
    } catch {
      return NextResponse.json(
        { error: "frist_compute_unavailable", message: "Engine not reachable" },
        { status: 502 }
      );
    }
  }
);
