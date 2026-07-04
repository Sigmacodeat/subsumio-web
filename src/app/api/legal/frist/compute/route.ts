import { NextRequest, NextResponse } from "next/server";
import { ENGINE_URL, engineContext } from "@/lib/engine";

export const dynamic = "force-dynamic";

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
export async function POST(req: NextRequest) {
  const ctx = await engineContext();
  if (!ctx) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  try {
    const body = await req.json();
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
