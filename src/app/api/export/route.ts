import { createHandler } from "@/lib/api-handler";
import { ENGINE_URL } from "@/lib/engine";
import { usageFor } from "@/lib/usage";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

/**
 * GET /api/export — DSGVO Art. 20 (Datenübertragbarkeit).
 * Liefert ALLE Daten des eingeloggten Nutzers als JSON-Download:
 * Konto (ohne Passwort-Hash), Nutzungszähler und das vollständige Brain
 * (alle Seiten der Tenant-Source mit Volltext, Frontmatter, Tags).
 */
export const GET = createHandler(
  {
    action: "brain.read",
    rateTier: "heavy",
    maxDuration: 120,
  },
  async (ctx) => {
    let brain: unknown = { error: "engine_unavailable", pages: [] };
    try {
      const upstream = await fetch(`${ENGINE_URL}/api/export`, {
        headers: ctx.headers,
        signal: AbortSignal.timeout(10_000),
      });
      if (upstream.ok) brain = await upstream.json();
    } catch {
      // Engine offline: Konto-Daten trotzdem exportieren, Brain-Teil markiert.
    }

    const usage = await usageFor(ctx.brainId).catch(() => null);

    const { user } = ctx;
    const payload = {
      format: "subsumio-dsgvo-export-v1",
      exported_at: new Date().toISOString(),
      account: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        plan: user.plan,
        brainId: user.brainId,
        orgId: user.orgId ?? null,
        referralCode: user.referralCode,
        referredBy: user.referredBy ?? null,
        createdAt: user.createdAt,
      },
      usage,
      brain,
    };

    const date = new Date().toISOString().slice(0, 10);
    return new Response(JSON.stringify(payload, null, 2), {
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Content-Disposition": `attachment; filename="subsumio-export-${date}.json"`,
        "Cache-Control": "no-store",
      },
    });
  }
);
