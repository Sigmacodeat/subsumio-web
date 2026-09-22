import { z } from "zod";
import { createHandler, apiError } from "@/lib/api-handler";
import { apiSuccess } from "@/lib/api-response";
import { ENGINE_URL, engineHeadersForBrain, enginePatchPage } from "@/lib/engine";
import {
  alertToFrontmatter,
  frontmatterToAlert,
  type RegulatoryAlert,
} from "@/lib/regulatory-monitors";
import { sanitizeUserInput } from "@/lib/prompt-sanitizer";
import type { BrainPage } from "@/lib/types";
import { logger } from "@/lib/logger";

const log = logger("api/monitoring/publish-alert");

const publishSchema = z.object({
  alert_slug: z.string().min(1).max(300),
  /** Ziel-Akte — muss zum case_slug des Monitors passen, wenn gesetzt. */
  case_slug: z.string().min(1).max(300),
  /** Anwaltliche Einordnung für den Mandanten — Pflicht (kuratiert ≠ roh). */
  impact_note: z.string().min(10).max(4_000),
});

/** Aus dem Alert die mandantenfähige Kurzinfo bauen. */
export function toClientAlert(alert: RegulatoryAlert, impactNote: string) {
  return {
    id: alertSlugToId(alert),
    title: alert.title,
    summary: (alert.summary ?? "").slice(0, 2_000),
    url: alert.url,
    date: alert.date,
    severity: alert.severity,
    impact_note: impactNote,
    published_at: new Date().toISOString(),
  };
}

function alertSlugToId(alert: RegulatoryAlert): string {
  return `${alert.monitor_id}:${alert.date}:${alert.title.slice(0, 40)}`;
}

/**
 * WP-7.41 Monitors-as-a-Service — kuratierter Regulatory-Alert wird in das
 * Mandantenportal der verknüpften Akte gestellt: Alert-Status → published,
 * Impact-Note des Anwalts + Quelle landen in `client_alerts` der Akte
 * (whitelisted in buildPortalCaseView).
 */
export const POST = createHandler(
  {
    action: "brain.write",
    rateTier: "standard",
    body: publishSchema,
    audit: (_ctx, b) => ({
      action: "workflow.update" as const,
      entityType: "regulatory_alert",
      details: { alert_slug: b.alert_slug, case_slug: b.case_slug },
    }),
  },
  async (ctx, body) => {
    const headers = engineHeadersForBrain(ctx.brainId);
    const impactNote = sanitizeUserInput(body.impact_note.trim());

    // 1. Alert laden
    const alertRes = await fetch(`${ENGINE_URL}/api/pages/${encodeURIComponent(body.alert_slug)}`, {
      headers,
      signal: AbortSignal.timeout(15_000),
    });
    if (!alertRes.ok) {
      return apiError("alert_not_found", "Alert nicht gefunden", 404);
    }
    const alertPage = (await alertRes.json()) as BrainPage;
    const alert = frontmatterToAlert(alertPage);
    if (!alert) {
      return apiError("not_an_alert", "Seite ist kein Regulatory-Alert", 400);
    }
    // Mandanten-Bezug prüfen: der Monitor bindet die Ziel-Akte — ein Alert
    // darf nicht in eine fremde Akte publiziert werden.
    if (alert.case_slug && alert.case_slug !== body.case_slug) {
      return apiError(
        "case_mismatch",
        "Der Alert ist an eine andere Akte gebunden (Monitor-Einstellung).",
        409
      );
    }

    // 2. Akte laden
    const caseRes = await fetch(`${ENGINE_URL}/api/pages/${encodeURIComponent(body.case_slug)}`, {
      headers,
      signal: AbortSignal.timeout(15_000),
    });
    if (!caseRes.ok) {
      return apiError("case_not_found", "Akte nicht gefunden", 404);
    }
    const casePage = (await caseRes.json()) as BrainPage;
    const existing = Array.isArray(casePage.frontmatter?.client_alerts)
      ? (casePage.frontmatter.client_alerts as Array<Record<string, unknown>>)
      : [];
    const entry = toClientAlert(alert, impactNote);
    if (existing.some((e) => e.id === entry.id)) {
      return apiError("already_published", "Dieser Alert wurde bereits veröffentlicht.", 409);
    }

    // 3. Beides schreiben — Alert zuerst, dann die Akte. Schlägt der zweite
    // Schritt fehl, bleibt der Alert "published" ohne Portal-Eintrag; die
    // Idempotenz-Prüfung oben macht den Retry sicher.
    const alertPatch = await enginePatchPage(headers, {
      slug: alertPage.slug,
      frontmatter: alertToFrontmatter({
        ...alert,
        status: "published",
        impact_note: impactNote,
        published_at: entry.published_at,
        case_slug: body.case_slug,
      }),
    });
    if (!alertPatch.ok) {
      log.warn("alert publish patch failed", { slug: alertPage.slug, status: alertPatch.status });
      return apiError("publish_failed", "Alert-Status konnte nicht gespeichert werden", 502);
    }
    const casePatch = await enginePatchPage(headers, {
      slug: casePage.slug,
      frontmatter: { client_alerts: [...existing, entry] },
    });
    if (!casePatch.ok) {
      log.warn("client_alerts patch failed", { slug: casePage.slug, status: casePatch.status });
      return apiError("publish_failed", "Portal-Eintrag konnte nicht geschrieben werden", 502);
    }

    return apiSuccess({ published: true, case_slug: casePage.slug });
  }
);
