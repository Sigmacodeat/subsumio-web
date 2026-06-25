import { NextRequest } from "next/server";
import { ENGINE_URL, engineHeadersForBrain } from "@/lib/engine";
import { sendMail } from "@/lib/mail";
import { searchJudgements, type JudgementHit } from "@/lib/judgements";
import { createCronHandler } from "@/lib/api-handler";
import { filterNewHitIds } from "@/lib/caselaw-dedup";
import { getRecipientsByBrain } from "@/lib/cron-utils";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * GET /api/cron/case-law — proaktives Rechtsprechungs-Monitoring.
 *
 * Pro Brain wird die Watchlist-Seite `monitoring/case-law-watchlist` gelesen
 * (frontmatter.terms = [{ query, jurisdiction }]). Für jeden Begriff werden
 * Urteile der letzten 7 Tage gesucht; neue Treffer (per Postgres-Dedup) gehen
 * als E-Mail-Digest an die Brain-Nutzer.
 *
 * Schutz via CRON_SECRET (Bearer). Gesteuert via supercronic im Hetzner Stack.
 */

const WATCHLIST_SLUG = "monitoring/case-law-watchlist";

interface WatchTerm {
  query: string;
  jurisdiction: "at" | "de" | "ch" | "all";
}

async function readWatchlist(brainId: string): Promise<WatchTerm[]> {
  try {
    const res = await fetch(`${ENGINE_URL}/api/pages/${WATCHLIST_SLUG}`, {
      headers: engineHeadersForBrain(brainId),
    });
    if (!res.ok) return [];
    const page = (await res.json()) as { frontmatter?: Record<string, unknown> };
    const terms = page.frontmatter?.terms;
    if (!Array.isArray(terms)) return [];
    return terms
      .map((t) => (t && typeof t === "object" ? (t as Record<string, unknown>) : {}))
      .map((t) => ({
        query: String(t.query ?? "").trim(),
        jurisdiction: (["at", "de", "ch", "all"].includes(String(t.jurisdiction))
          ? String(t.jurisdiction)
          : "all") as WatchTerm["jurisdiction"],
      }))
      .filter((t) => t.query);
  } catch {
    return [];
  }
}

/** Dedup-Tabelle: ein Treffer (brain + hit-id) wird nur einmal gemeldet. */
async function filterNewHits(brainId: string, hits: JudgementHit[]): Promise<JudgementHit[]> {
  const freshIndices = await filterNewHitIds(
    brainId,
    hits.map((h) => h.id)
  );
  return hits.filter((_, i) => freshIndices.has(i));
}

/** Persistiere Treffer als Brain-Pages (type: judgement) für spätere Brain-Suche. */
async function persistHitsAsPages(brainId: string, hits: JudgementHit[]) {
  for (const h of hits) {
    const slug = `legal/judgements/${h.id}`;
    try {
      await fetch(`${ENGINE_URL}/api/pages`, {
        method: "POST",
        headers: { ...engineHeadersForBrain(brainId), "Content-Type": "application/json" },
        body: JSON.stringify({
          slug,
          title: `${h.court} — ${h.title || "Urteil"}`,
          type: "judgement",
          content: h.summary || h.snippet || "",
          frontmatter: {
            type: "judgement",
            court: h.court,
            date: h.date,
            case_number: h.caseNumber,
            ecli: h.ecli,
            url: h.url,
            source: h.source,
            legal_area: h.legalArea || "Allgemein",
            keywords: h.keywords || [],
            fetched_at: new Date().toISOString(),
          },
        }),
      });
    } catch {
      // Einzelne Fehler dürfen den Cron nicht abbrechen
    }
  }
}

function renderDigest(
  hitsByTerm: { term: string; hits: JudgementHit[] }[],
  appUrl: string
): { subject: string; text: string } {
  const total = hitsByTerm.reduce((n, t) => n + t.hits.length, 0);
  const parts: string[] = [`${total} neue Entscheidung(en) zu Ihren beobachteten Themen:`, ""];
  for (const { term, hits } of hitsByTerm) {
    if (hits.length === 0) continue;
    parts.push(`▸ "${term}":`);
    for (const h of hits) {
      parts.push(
        `  • ${h.date?.slice(0, 10) || "—"} — ${h.court} ${h.caseNumber}${h.ecli ? ` (${h.ecli})` : ""}`
      );
      if (h.url) parts.push(`    ${h.url}`);
    }
    parts.push("");
  }
  parts.push(`Watchlist verwalten: ${appUrl}/dashboard/monitoring`);
  parts.push("");
  parts.push("Automatische Recherche — Relevanz und Aktualität bitte selbst prüfen.");
  return { subject: `⚖️ ${total} neue Entscheidung(en) zu Ihren Themen`, text: parts.join("\n") };
}

export const GET = createCronHandler(async (_req: NextRequest) => {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || "https://subsum.eu";
  const from = new Date(Date.now() - 7 * 86400_000).toISOString().slice(0, 10);

  const recipientsByBrain = await getRecipientsByBrain();

  let brainsChecked = 0;
  let brainsWithHits = 0;
  let mailsSent = 0;

  for (const [brainId, recipients] of recipientsByBrain) {
    brainsChecked++;
    const watchlist = await readWatchlist(brainId);
    if (watchlist.length === 0) continue;

    const hitsByTerm: { term: string; hits: JudgementHit[] }[] = [];
    const allFreshHits: JudgementHit[] = [];
    for (const term of watchlist.slice(0, 20)) {
      const { results } = await searchJudgements({
        q: term.query,
        jurisdiction: term.jurisdiction,
        from,
        limit: 20,
      });
      const fresh = await filterNewHits(brainId, results);
      if (fresh.length > 0) {
        hitsByTerm.push({ term: term.query, hits: fresh });
        allFreshHits.push(...fresh);
      }
    }
    // Persistiere neue Treffer als Brain-Pages (type: judgement)
    if (allFreshHits.length > 0) {
      await persistHitsAsPages(brainId, allFreshHits);
    }

    const total = hitsByTerm.reduce((n, t) => n + t.hits.length, 0);
    if (total === 0) continue;
    brainsWithHits++;

    const { subject, text } = renderDigest(hitsByTerm, appUrl);
    for (const user of recipients) {
      const r = await sendMail({ to: user.email, subject, text });
      if (r.sent) mailsSent++;
    }
  }

  return Response.json({
    ok: true,
    brains_checked: brainsChecked,
    brains_with_hits: brainsWithHits,
    mails_sent: mailsSent,
  });
});
