import { listEnginePages } from "@/lib/engine-pages";
import { NextRequest } from "next/server";
import { ENGINE_URL, engineHeadersForBrain } from "@/lib/engine";
import { sendMail } from "@/lib/mail";
import { searchJudgements, type JudgementHit } from "@/lib/judgements";
import { createCronHandler } from "@/lib/api-handler";
import { filterNewHitIds } from "@/lib/caselaw-dedup";
import {
  activeStaffRecipients,
  fetchPages,
  getRecipientsByBrain,
  matterPermissionsBySlug,
  recipientsForMatter,
} from "@/lib/cron-utils";
import type { MatterPermissions } from "@/lib/matter-access";
import {
  type RegulatoryMonitor,
  type RegulatoryAlert,
  frontmatterToMonitor,
  monitorToFrontmatter,
  alertToFrontmatter,
  alertSlug,
  shouldRunToday,
  inferSeverity,
  inferChangeType,
  monitorSlug,
} from "@/lib/regulatory-monitors";
import { env } from "@/lib/env";
import type { BrainPage } from "@/lib/types";

import { logger } from "@/lib/logger";
const log = logger("api/cron/regulatory-monitors");
import { engineWriteBestEffort } from "@/lib/engine-write";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * GET /api/cron/regulatory-monitors — Regulatory Monitoring Cron.
 *
 * Läuft als supercronic Cron (Netcup) oder manuell:
 *   curl -H "Authorization: Bearer $CRON_SECRET" https://…/api/cron/regulatory-monitors
 *
 * Pro Brain (Kanzlei):
 *   1. Liest alle regulatory_monitor Pages (active, frequency matches today)
 *   2. Für jeden Monitor: sucht via searchJudgements nach neuen Treffern
 *   3. Neue Treffer → regulatory_alert Brain-Pages
 *   4. Update monitor last_run_at / last_run_hits
 *   5. Email-Notification je Person (wenn email_notifications=true): aktive
 *      Mitarbeiter; mandatsbezogene Monitore nur an Personen mit Aktenzugriff
 *
 * Integration mit /api/cron/case-law: teilt die Dedup-Tabelle
 * subsumio_caselaw_seen. Backward-compatible: liest auch die legacy
 * Watchlist (monitoring/case-law-watchlist) und migriert sie nicht,
 * sondern behandelt sie als zusätzlichen Monitor.
 */

async function fetchMonitorPages(brainId: string): Promise<BrainPage[]> {
  try {
    return (await listEnginePages(engineHeadersForBrain(brainId), "regulatory_monitor", 50_000, {
      timeoutMs: 30_000,
    })) as unknown as BrainPage[];
  } catch {
    return [];
  }
}

async function fetchLegacyWatchlist(brainId: string): Promise<BrainPage | null> {
  try {
    const res = await fetch(`${ENGINE_URL}/api/pages/monitoring/case-law-watchlist`, {
      headers: engineHeadersForBrain(brainId),
      signal: AbortSignal.timeout(30_000),
    });
    if (!res.ok) return null;
    return (await res.json()) as BrainPage;
  } catch {
    return null;
  }
}

async function persistAlertPage(
  brainId: string,
  monitor: RegulatoryMonitor,
  hit: JudgementHit
): Promise<boolean> {
  const slug = alertSlug(monitor.monitor_id, hit.id);
  const severity = inferSeverity({
    legalArea: hit.legalArea,
    keywords: hit.keywords,
    snippet: hit.snippet,
  });
  const changeType = inferChangeType({ type: hit.type, snippet: hit.snippet });
  const alert: Partial<RegulatoryAlert> = {
    monitor_id: monitor.monitor_id,
    monitor_topic: monitor.topic,
    change_type: changeType,
    severity,
    source: hit.source,
    date: hit.date?.slice(0, 10) ?? new Date().toISOString().slice(0, 10),
    title: `${hit.court} — ${hit.title || hit.caseNumber || "Neue Entscheidung"}`,
    summary: hit.summary || hit.snippet || "",
    url: hit.url,
    court: hit.court,
    case_number: hit.caseNumber,
    ecli: hit.ecli,
    keywords: hit.keywords,
    read: false,
    // WP-7.41: Mandanten-Bezug + Kurator vom Monitor erben — Alerts eines
    // mandantenbezogenen Monitors können ins Portal der Akte gestellt werden.
    case_slug: monitor.case_slug,
    owner_name: monitor.owner_name,
    created_at: new Date().toISOString(),
  };
  // Einzelne Fehler dürfen den Cron nicht abbrechen — werden aber gezählt.
  return engineWriteBestEffort(
    `${ENGINE_URL}/api/pages`,
    {
      method: "POST",
      headers: { ...engineHeadersForBrain(brainId), "Content-Type": "application/json" },
      body: JSON.stringify({
        slug,
        title: alert.title,
        type: "regulatory_alert",
        content: alert.summary || "",
        frontmatter: alertToFrontmatter(alert),
      }),
      signal: AbortSignal.timeout(30_000),
    },
    "Monitoring-Treffer"
  );
}

async function updateMonitorStatus(
  brainId: string,
  monitor: RegulatoryMonitor,
  hits: number,
  status: "ok" | "error"
): Promise<void> {
  // Non-fatal; a refused write is logged by the helper.
  await engineWriteBestEffort(
    `${ENGINE_URL}/api/pages`,
    {
      method: "POST",
      headers: { ...engineHeadersForBrain(brainId), "Content-Type": "application/json" },
      body: JSON.stringify({
        slug: monitorSlug(monitor.monitor_id),
        type: "regulatory_monitor",
        frontmatter: monitorToFrontmatter({
          ...monitor,
          last_run_at: new Date().toISOString(),
          last_run_hits: hits,
          last_run_status: status,
          updated_at: new Date().toISOString(),
        }),
        merge: true,
      }),
      signal: AbortSignal.timeout(10_000),
    },
    "Monitor-Status"
  );
}

async function filterNewHits(
  brainId: string,
  monitorId: string,
  hits: JudgementHit[]
): Promise<JudgementHit[]> {
  const hitIds = hits.map((h) => `${monitorId}:${h.id}`);
  const freshIndices = await filterNewHitIds(brainId, hitIds);
  return hits.filter((_, i) => freshIndices.has(i));
}

function renderMonitorDigest(
  monitor: RegulatoryMonitor,
  hits: JudgementHit[],
  appUrl: string
): { subject: string; text: string } {
  const parts: string[] = [`Monitor "${monitor.topic}" — ${hits.length} neue Treffer:`, ""];
  for (const h of hits) {
    parts.push(
      `  • ${h.date?.slice(0, 10) || "—"} — ${h.court} ${h.caseNumber}${h.ecli ? ` (${h.ecli})` : ""}`
    );
    if (h.url) parts.push(`    ${h.url}`);
  }
  parts.push("");
  parts.push(`Monitor verwalten: ${appUrl}/dashboard/monitoring`);
  parts.push("");
  parts.push("Automatische Recherche — Relevanz und Aktualität bitte selbst prüfen.");
  return {
    subject: `🔔 Monitor "${monitor.topic}": ${hits.length} neue Treffer`,
    text: parts.join("\n"),
  };
}

function legacyToMonitor(page: BrainPage): RegulatoryMonitor | null {
  const fm = page.frontmatter ?? {};
  const terms = Array.isArray(fm.terms) ? fm.terms : [];
  const keywords = terms
    .map((t: unknown) => (t && typeof t === "object" ? (t as Record<string, unknown>) : {}))
    .map((t: Record<string, unknown>) => String(t.query ?? ""))
    .filter(Boolean);
  if (keywords.length === 0) return null;
  return {
    monitor_id: "legacy-watchlist",
    topic: "Rechtsprechungs-Watchlist (Legacy)",
    jurisdiction: "all",
    frequency: "daily",
    sources: ["case-law"],
    keywords,
    status: "active",
    email_notifications: true,
    created_at: String(fm.created_at ?? page.created_at ?? new Date().toISOString()),
    updated_at: String(fm.updated_at ?? page.updated_at ?? new Date().toISOString()),
  };
}

export const GET = createCronHandler(async (_req: NextRequest) => {
  const appUrl = env("NEXT_PUBLIC_APP_URL") || "https://subsum.io";
  const from = new Date(Date.now() - 7 * 86400_000).toISOString().slice(0, 10);

  const recipientsByBrain = await getRecipientsByBrain();

  let brainsChecked = 0;
  let monitorsRun = 0;
  let alertsCreated = 0;
  let mailsSent = 0;
  let errors = 0;
  let alertWriteFailures = 0;

  for (const [brainId, brainUsers] of recipientsByBrain) {
    brainsChecked++;
    // Default recipients: active firm staff only; a matter-bound monitor only
    // to people who may open that matter (unreadable matter → admins only).
    const staff = activeStaffRecipients(brainUsers);
    let matterPermissions: Map<string, MatterPermissions> | null = null;

    // 1. Load all monitor definitions
    const monitorPages = await fetchMonitorPages(brainId);
    const monitors: RegulatoryMonitor[] = [];

    for (const page of monitorPages) {
      const m = frontmatterToMonitor(page);
      if (m && m.status === "active" && shouldRunToday(m.frequency)) {
        monitors.push(m);
      }
    }

    // 2. Load legacy watchlist as additional monitor (backward compat)
    const legacyPage = await fetchLegacyWatchlist(brainId);
    if (legacyPage) {
      const legacyMonitor = legacyToMonitor(legacyPage);
      if (legacyMonitor && shouldRunToday(legacyMonitor.frequency)) {
        monitors.push(legacyMonitor);
      }
    }

    if (monitors.length === 0) continue;

    // 3. Execute each monitor
    for (const monitor of monitors) {
      monitorsRun++;
      try {
        const allFreshHits: JudgementHit[] = [];

        if (monitor.sources.includes("case-law") || monitor.monitor_id === "legacy-watchlist") {
          // Search judgements for each keyword
          for (const keyword of monitor.keywords.slice(0, 20)) {
            const { results } = await searchJudgements({
              q: keyword,
              jurisdiction:
                monitor.jurisdiction === "eu"
                  ? "all"
                  : (monitor.jurisdiction as "at" | "de" | "ch" | "all"),
              from,
              limit: 20,
            });
            const fresh = await filterNewHits(brainId, monitor.monitor_id, results);
            allFreshHits.push(...fresh);
          }
        }

        // 4. Create alert pages for new hits
        for (const hit of allFreshHits) {
          if (await persistAlertPage(brainId, monitor, hit)) alertsCreated++;
          else alertWriteFailures++;
        }

        // 5. Update monitor status
        await updateMonitorStatus(brainId, monitor, allFreshHits.length, "ok");

        // 6. Send email notifications
        if (allFreshHits.length > 0 && monitor.email_notifications) {
          const { subject, text } = renderMonitorDigest(monitor, allFreshHits, appUrl);
          if (monitor.case_slug && !monitor.notify_emails?.length && !matterPermissions) {
            matterPermissions = matterPermissionsBySlug(
              await fetchPages(brainId, "legal_case", 10_000).catch(() => [])
            );
          }
          const emails = monitor.notify_emails?.length
            ? monitor.notify_emails
            : recipientsForMatter(staff, monitor.case_slug, matterPermissions ?? new Map()).map(
                (u) => u.email
              );
          for (const email of emails) {
            const r = await sendMail({ to: email, subject, text });
            if (r.sent) mailsSent++;
          }
        }
      } catch (err) {
        errors++;
        log.error(
          `[regulatory-monitors] Monitor ${monitor.monitor_id} failed:`,
          err instanceof Error ? err.message : String(err)
        );
        await updateMonitorStatus(brainId, monitor, 0, "error");
      }
    }
  }

  return Response.json({
    ok: true,
    brains_checked: brainsChecked,
    monitors_run: monitorsRun,
    alerts_created: alertsCreated,
    mails_sent: mailsSent,
    errors,
    alert_write_failures: alertWriteFailures,
  });
});
