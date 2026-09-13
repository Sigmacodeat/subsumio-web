import { createHandler } from "@/lib/api-handler";
import { ENGINE_URL } from "@/lib/engine";
import { usageFor } from "@/lib/usage";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

/**
 * GET /api/export — DSGVO Art. 15/20 für das eigene Konto.
 * Liefert Konto (ohne Passwort-Hash) und Nutzungszähler. Das Brain gehört nur
 * dann zum persönlichen Export, wenn es ein persönliches Brain ist. Bei
 * Kanzlei-Mitgliedern ist es der gemeinsame Aktenbestand der Kanzlei (fremde
 * Mandanten, Ethical Walls) — der Kanzlei-Export liegt bei den Kanzlei-Admins
 * (/api/data-export/gdpr, /api/data-export/backup).
 */
export const GET = createHandler(
  {
    action: "brain.read",
    rateTier: "heavy",
    maxDuration: 120,
  },
  async (ctx) => {
    const firmMember = Boolean(ctx.user.orgId);
    let brain: unknown = firmMember
      ? {
          excluded: "firm_brain",
          note: "Akten der Kanzlei sind nicht Teil des persönlichen Exports. Der Kanzlei-Export wird von Kanzlei-Admins erstellt.",
          pages: [],
        }
      : { error: "engine_unavailable", pages: [] };
    if (!firmMember) {
      try {
        const upstream = await fetch(`${ENGINE_URL}/api/export`, {
          headers: ctx.headers,
          signal: AbortSignal.timeout(10_000),
        });
        if (upstream.ok) brain = await upstream.json();
      } catch {
        // Engine offline: Konto-Daten trotzdem exportieren, Brain-Teil markiert.
      }
    }

    const usage = firmMember ? null : await usageFor(ctx.brainId).catch(() => null);

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
