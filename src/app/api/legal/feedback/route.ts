import { createHandler, apiSuccess } from "@/lib/api-handler";
import { listEnginePages } from "@/lib/engine-pages";

export const dynamic = "force-dynamic";

/**
 * WP-8.53 Folge: NPS-Auswertung für die Kanzlei.
 * Aggregiert die `client_feedback`-Pages (geschrieben von
 * /api/portal/feedback) über alle Akten des Brains.
 * NPS = %Promoter (9–10) − %Detraktoren (0–6).
 */

interface FeedbackPage {
  slug: string;
  frontmatter?: {
    case_slug?: string;
    nps_score?: number;
    comment?: string | null;
    submitted_at?: string;
  };
}

export const GET = createHandler({ action: "brain.read", rateTier: "standard" }, async (ctx) => {
  // Cursor-paginated: a bare /api/pages call is capped at 100 rows.
  // Kein Feedback-Endpunkt-Fehler an die UI propagieren — leere Auswertung
  // statt Fehler, wenn noch keine Bewertungen existieren (listEnginePages
  // ist nicht-strict und gibt bei Engine-Ausfall das Gelesene zurück).
  const pages = (await listEnginePages(ctx.headers, "client_feedback", 10_000, {
    slugPrefix: "feedback-",
  })) as unknown as FeedbackPage[];

  const entries = pages
    .map((p) => ({
      caseSlug: p.frontmatter?.case_slug ?? "",
      score: typeof p.frontmatter?.nps_score === "number" ? p.frontmatter.nps_score : null,
      comment: p.frontmatter?.comment ?? null,
      submittedAt: p.frontmatter?.submitted_at ?? "",
    }))
    .filter((e): e is typeof e & { score: number } => e.score !== null)
    .sort((a, b) => b.submittedAt.localeCompare(a.submittedAt));

  const total = entries.length;
  const promoters = entries.filter((e) => e.score >= 9).length;
  const detractors = entries.filter((e) => e.score <= 6).length;
  const passives = total - promoters - detractors;
  const average = total
    ? Math.round((entries.reduce((s, e) => s + e.score, 0) / total) * 10) / 10
    : null;
  const nps = total ? Math.round((promoters / total - detractors / total) * 100) : null;

  const byCaseMap = new Map<string, { count: number; sum: number }>();
  for (const e of entries) {
    const cur = byCaseMap.get(e.caseSlug) ?? { count: 0, sum: 0 };
    cur.count += 1;
    cur.sum += e.score;
    byCaseMap.set(e.caseSlug, cur);
  }
  const byCase = [...byCaseMap.entries()]
    .map(([caseSlug, v]) => ({
      caseSlug,
      count: v.count,
      average: Math.round((v.sum / v.count) * 10) / 10,
    }))
    .sort((a, b) => b.count - a.count);

  // 90-Tage-Trend: ISO-Wochen-Buckets (Mo-Start), älteste → neueste.
  const trendBuckets = new Map<string, { sum: number; count: number }>();
  const cutoff = Date.now() - 90 * 24 * 3600 * 1000;
  for (const e of entries) {
    const ts = Date.parse(e.submittedAt);
    if (!Number.isFinite(ts) || ts < cutoff) continue;
    const d = new Date(ts);
    d.setUTCHours(0, 0, 0, 0);
    d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7)); // Wochenstart Mo
    const key = d.toISOString().slice(0, 10);
    const cur = trendBuckets.get(key) ?? { sum: 0, count: 0 };
    cur.sum += e.score;
    cur.count += 1;
    trendBuckets.set(key, cur);
  }
  const weeklyTrend = [...trendBuckets.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([week, v]) => ({
      week,
      average: Math.round((v.sum / v.count) * 10) / 10,
      count: v.count,
    }));

  return apiSuccess({
    total,
    nps,
    average,
    promoters,
    passives,
    detractors,
    latest: entries.slice(0, 10),
    byCase,
    weeklyTrend,
  });
});
