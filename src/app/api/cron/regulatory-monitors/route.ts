import { NextRequest } from "next/server";
import { ENGINE_URL, engineHeadersForBrain } from "@/lib/engine";
import { sendMail } from "@/lib/mail";
import { searchJudgements, type JudgementHit } from "@/lib/judgements";
import { validateCronAuth } from "@/lib/cron-auth";
import { filterNewHitIds } from "@/lib/caselaw-dedup";
import { getRecipientsByBrain } from "@/lib/cron-utils";
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
import type { BrainPage } from "@/lib/types";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * GET /api/cron/regulatory-monitors — Regulatory Monitoring Cron.
 *
 * Läuft als Vercel Cron (vercel.json) oder manuell:
 *   curl -H "Authorization: Bearer $CRON_SECRET" https://…/api/cron/regulatory-monitors
 *
 * Pro Brain (Kanzlei):
 *   1. Liest alle regulatory_monitor Pages (active, frequency matches today)
 *   2. Für jeden Monitor: sucht via searchJudgements nach neuen Treffern
 *   3. Neue Treffer → regulatory_alert Brain-Pages
 *   4. Update monitor last_run_at / last_run_hits
 *   5. Email-Notification an Brain-Nutzer (wenn email_notifications=true)
 *
 * Integration mit /api/cron/case-law: teilt die Dedup-Tabelle
 * subsumio_caselaw_seen. Backward-compatible: liest auch die legacy
 * Watchlist (monitoring/case-law-watchlist) und migriert sie nicht,
 * sondern behandelt sie als zusätzlichen Monitor.
 */

async function fetchMonitorPages(brainId: string): Promise<BrainPage[]> {
  try {
    const res = await fetch(`${ENGINE_URL}/api/pages?type=regulatory_monitor&limit=200`, {
      headers: engineHeadersForBrain(brainId),
    });
    if (!res.ok) return [];
    const data = (await res.json()) as unknown;
    if (!Array.isArray(data)) return [];
    return data as BrainPage[];
  } catch {
    return [];
  }
}

async function fetchLegacyWatchlist(brainId: string): Promise<BrainPage | null> {
  try {
    const res = await fetch(`${ENGINE_URL}/api/pages/monitoring/case-law-watchlist`, {
      headers: engineHeadersForBrain(brainId),
    });
    if (!res.ok) return null;
    return (await res.json()) as BrainPage;
  } catch {
    return null;
  }
}

async function persistAlertPage(brainId: string, monitor: RegulatoryMonitor, hit: JudgementHit): Promise<void> {
  const slug = alertSlug(monitor.monitor_id, hit.id);
  const severity = inferSeverity({ legalArea: hit.legalArea, keywords: hit.keywords, snippet: hit.snippet });
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
    created_at: new Date().toISOString(),
  };
  try {
    await fetch(`${ENGINE_URL}/api/pages`, {
      method: "POST",
      headers: { ...engineHeadersForBrain(brainId), "Content-Type": "application/json" },
      body: JSON.stringify({
        slug,
        title: alert.title,
        type: "regulatory_alert",
        content: alert.summary || "",
        frontmatter: alertToFrontmatter(alert),
      }),
    });
  } catch {
    // Einzelne Fehler dürfen den Cron nicht abbrechen
  }
}

async function updateMonitorStatus(brainId: string, monitor: RegulatoryMonitor, hits: number, status: "ok" | "error"): Promise<void> {
  try {
    await fetch(`${ENGINE_URL}/api/pages`, {
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
    });
  } catch {
    // Non-fatal
  }
}

async function filterNewHits(brainId: string, monitorId: string, hits: JudgementHit[]): Promise<JudgementHit[]> {
  const hitIds = hits.map((h) => `${monitorId}:${h.id}`);
  const freshIndices = await filterNewHitIds(brainId, hitIds);
  return hits.filter((_, i) => freshIndices.has(i));
}

function renderMonitorDigest(
  monitor: RegulatoryMonitor,
  hits: JudgementHit[],
  appUrl: string,
): { subject: string; text: string } {
  const parts: string[] = [
    `Monitor "${monitor.topic}" — ${hits.length} neue Treffer:`,
    "",
  ];
  for (const h of hits) {
    parts.push(`  • ${h.date?.slice(0, 10) || "—"} — ${h.court} ${h.caseNumber}${h.ecli ? ` (${h.ecli})` : ""}`);
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

export async function GET(req: NextRequest) {
  const authError = validateCronAuth(req);
  if (authError) return authError;

  const appUrl = process.env.NEXT_PUBLIC_APP_URL || "https://subsum.eu";
  const from = new Date(Date.now() - 7 * 86400_000).toISOString().slice(0, 10);

  const recipientsByBrain = await getRecipientsByBrain();

  let brainsChecked = 0;
  let monitorsRun = 0;
  let alertsCreated = 0;
  let mailsSent = 0;
  let errors = 0;

  for (const [brainId, recipients] of recipientsByBrain) {
    brainsChecked++;

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
              jurisdiction: monitor.jurisdiction === "eu" ? "all" : monitor.jurisdiction as "at" | "de" | "ch" | "all",
              from,
              limit: 20,
            });
            const fresh = await filterNewHits(brainId, monitor.monitor_id, results);
            allFreshHits.push(...fresh);
          }
        }

        // 4. Create alert pages for new hits
        for (const hit of allFreshHits) {
          await persistAlertPage(brainId, monitor, hit);
          alertsCreated++;
        }

        // 5. Update monitor status
        await updateMonitorStatus(brainId, monitor, allFreshHits.length, "ok");

        // 6. Send email notifications
        if (allFreshHits.length > 0 && monitor.email_notifications) {
          const { subject, text } = renderMonitorDigest(monitor, allFreshHits, appUrl);
          const emails = monitor.notify_emails?.length ? monitor.notify_emails : recipients.map((u) => u.email);
          for (const email of emails) {
            const r = await sendMail({ to: email, subject, text });
            if (r.sent) mailsSent++;
          }
        }
      } catch (err) {
        errors++;
        console.error(`[regulatory-monitors] Monitor ${monitor.monitor_id} failed:`, err instanceof Error ? err.message : String(err));
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
  });
}
