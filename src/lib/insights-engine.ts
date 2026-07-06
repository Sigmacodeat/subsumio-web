/**
 * Insights-Engine — ereignisgesteuerte Hinweise für das Kanzlei-OS.
 *
 * TODO 8: Generates insight cards from cross-source events:
 * - Urteil↔Akte: New judgements matching case legal areas
 * - Playbook: Procedural next-step suggestions based on case type/phase
 * - Widersprüche: Contradiction detection between case documents/statements
 *
 * Insights are computed client-side from cockpit data + judgement sync results.
 * No AI calls — pure rule-based matching for zero-cost, real-time insights.
 */

export type InsightType =
  | "judgement_match"
  | "playbook_hint"
  | "contradiction"
  | "deadline_risk"
  | "extraction_issue";
export type InsightSeverity = "info" | "warning" | "critical";

export interface Insight {
  id: string;
  type: InsightType;
  severity: InsightSeverity;
  title: string;
  description: string;
  caseSlug?: string;
  caseTitle?: string;
  href?: string;
  createdAt: string;
  dismissed?: boolean;
}

export interface InsightInput {
  cases: Array<{
    slug: string;
    title?: string;
    frontmatter?: {
      status?: string;
      legal_area?: string;
      procedure?: string;
      court?: string;
      deadlines?: Array<{
        due_date?: string;
        date?: string;
        status?: string;
        is_notfrist?: boolean;
        title?: string;
      }>;
      timeline?: Array<{
        date?: string;
        title?: string;
        description?: string;
        type?: string;
      }>;
      contradictions?: Array<{
        field?: string;
        severity?: string;
        description?: string;
        value_a?: string;
        value_b?: string;
        doc_a_slug?: string;
        doc_b_slug?: string;
      }>;
    };
  }>;
  judgements?: Array<{
    slug: string;
    title?: string;
    frontmatter?: {
      court?: string;
      date?: string;
      legal_area?: string;
      file_number?: string;
      summary?: string;
    };
  }>;
  recentDocuments?: Array<{
    slug: string;
    title?: string;
    frontmatter?: {
      case_slug?: string;
      extraction_status?: string;
      analysis_status?: string;
      extraction_unverified?: boolean;
    };
  }>;
}

function isOpenCase(status?: string): boolean {
  return !["done", "closed", "settled", "won", "lost", "archived"].includes(
    String(status ?? "").toLowerCase()
  );
}

function daysUntil(dateStr: string): number {
  const now = new Date();
  now.setUTCHours(0, 0, 0, 0);
  const target = new Date(dateStr);
  target.setUTCHours(0, 0, 0, 0);
  return Math.ceil((target.getTime() - now.getTime()) / 86_400_000);
}

/**
 * Generate judgement↔case match insights.
 * Matches by legal_area and court overlap.
 */
function generateJudgementMatches(input: InsightInput): Insight[] {
  const insights: Insight[] = [];
  if (!input.judgements || input.judgements.length === 0) return insights;

  for (const caseItem of input.cases) {
    if (!isOpenCase(caseItem.frontmatter?.status)) continue;
    const caseArea = caseItem.frontmatter?.legal_area?.toLowerCase();
    const caseCourt = caseItem.frontmatter?.court?.toLowerCase();
    if (!caseArea && !caseCourt) continue;

    for (const judgement of input.judgements) {
      const jArea = judgement.frontmatter?.legal_area?.toLowerCase();
      const jCourt = judgement.frontmatter?.court?.toLowerCase();
      const jDate = judgement.frontmatter?.date;

      // Only recent judgements (last 90 days)
      if (jDate) {
        const age = daysUntil(jDate);
        if (age < -90) continue;
      }

      const areaMatch = caseArea && jArea && caseArea === jArea;
      const courtMatch = caseCourt && jCourt && caseCourt === jCourt;

      if (areaMatch || courtMatch) {
        insights.push({
          id: `ins-jm-${caseItem.slug}-${judgement.slug}`,
          type: "judgement_match",
          severity: "info",
          title: judgement.title ?? "Neues Urteil",
          description: `Neues Urteil${courtMatch ? ` vom ${judgement.frontmatter?.court}` : ""}${
            areaMatch ? ` im Bereich ${caseItem.frontmatter?.legal_area}` : ""
          } — potenziell relevant für Akte "${caseItem.title ?? caseItem.slug}".`,
          caseSlug: caseItem.slug,
          caseTitle: caseItem.title,
          href: `/dashboard/cases/${caseItem.slug}`,
          createdAt: jDate ?? new Date().toISOString(),
        });
      }
    }
  }

  return insights;
}

/**
 * Generate playbook hints based on case type and procedural state.
 */
function generatePlaybookHints(input: InsightInput): Insight[] {
  const insights: Insight[] = [];

  for (const caseItem of input.cases) {
    if (!isOpenCase(caseItem.frontmatter?.status)) continue;
    const fm = caseItem.frontmatter ?? {};
    const procedure = String(fm.procedure ?? "").toLowerCase();
    const deadlines = fm.deadlines ?? [];
    const timeline = fm.timeline ?? [];

    // Check if case has no deadlines set but is open
    if (deadlines.length === 0 && timeline.length > 0) {
      insights.push({
        id: `ins-pb-nofrist-${caseItem.slug}`,
        type: "playbook_hint",
        severity: "warning",
        title: "Keine Fristen gesetzt",
        description: `Akte "${caseItem.title ?? caseItem.slug}" hat ${
          timeline.length
        } Timeline-Ereignisse aber keine Fristen. Prüfen Sie ob prozessuale Fristen gesetzt werden müssen.`,
        caseSlug: caseItem.slug,
        caseTitle: caseItem.title,
        href: `/dashboard/cases/${caseItem.slug}?tab=deadlines`,
        createdAt: new Date().toISOString(),
      });
    }

    // Check for Notfristen approaching
    for (const dl of deadlines) {
      const dueStr = dl.due_date ?? dl.date;
      if (!dueStr || dl.status === "done") continue;
      const days = daysUntil(dueStr);
      if (dl.is_notfrist && days >= 0 && days <= 7) {
        insights.push({
          id: `ins-pb-notfrist-${caseItem.slug}-${dueStr}`,
          type: "playbook_hint",
          severity: days <= 3 ? "critical" : "warning",
          title: "Notfrist droht zu verstreichen",
          description: `Notfrist "${dl.title ?? dueStr}" in Akte "${
            caseItem.title ?? caseItem.slug
          }" läuft in ${days} Tag${days === 1 ? "" : "en"} ab. Vier-Augen-Kontrolle erforderlich.`,
          caseSlug: caseItem.slug,
          caseTitle: caseItem.title,
          href: `/dashboard/cases/${caseItem.slug}?tab=deadlines`,
          createdAt: new Date().toISOString(),
        });
      }
    }

    // Procedure-specific hints
    if (procedure.includes("klage") || procedure.includes("litigation")) {
      const hasHearing = timeline.some(
        (t) =>
          t.type === "hearing" ||
          String(t.title ?? "")
            .toLowerCase()
            .includes("termin")
      );
      if (!hasHearing && timeline.length > 2) {
        insights.push({
          id: `ins-pb-termin-${caseItem.slug}`,
          type: "playbook_hint",
          severity: "info",
          title: "Kein Termin eingetragen",
          description: `Klageverfahren "${caseItem.title ?? caseItem.slug}" hat keinen Gerichtstermin. Prüfen Sie ob ein Terminsantrag gestellt werden muss.`,
          caseSlug: caseItem.slug,
          caseTitle: caseItem.title,
          href: `/dashboard/cases/${caseItem.slug}?tab=timeline`,
          createdAt: new Date().toISOString(),
        });
      }
    }
  }

  return insights;
}

/**
 * Generate extraction-issue insights from document analysis status.
 * These are NOT inhaltliche Widersprüche — they signal extraction/analysis failures.
 */
function generateExtractionIssues(input: InsightInput): Insight[] {
  const insights: Insight[] = [];

  for (const doc of input.recentDocuments ?? []) {
    const fm = doc.frontmatter ?? {};
    if (fm.analysis_status === "failed" || fm.extraction_unverified === true) {
      insights.push({
        id: `ins-ext-${doc.slug}`,
        type: "extraction_issue",
        severity: fm.analysis_status === "failed" ? "critical" : "warning",
        title: fm.analysis_status === "failed" ? "Analyse fehlgeschlagen" : "Extraktion unprüfbar",
        description: `Dokument "${doc.title ?? doc.slug}" ${
          fm.analysis_status === "failed"
            ? "Analyse fehlgeschlagen — möglicherweise unleserlich oder widersprüchlich."
            : "Extraktion nicht verifiziert — manuelle Prüfung empfohlen."
        }${fm.case_slug ? ` (Akte: ${fm.case_slug})` : ""}`,
        caseSlug: fm.case_slug,
        href: fm.case_slug ? `/dashboard/cases/${fm.case_slug}?tab=documents` : `/dashboard/vault`,
        createdAt: new Date().toISOString(),
      });
    }
  }

  return insights;
}

/**
 * Generate real contradiction insights from case.frontmatter.contradictions[].
 * These are inhaltliche Widersprüche between documents — detected by the
 * nightly contradiction-probe and on-demand cross-check.
 */
function generateRealContradictions(input: InsightInput): Insight[] {
  const insights: Insight[] = [];

  for (const caseItem of input.cases) {
    if (!isOpenCase(caseItem.frontmatter?.status)) continue;
    const contradictions = caseItem.frontmatter?.contradictions ?? [];
    for (const c of contradictions) {
      const severity =
        c.severity === "high" ? "critical" : c.severity === "medium" ? "warning" : "info";
      insights.push({
        id: `ins-ctr-${caseItem.slug}-${c.field ?? "unknown"}`,
        type: "contradiction",
        severity: severity as InsightSeverity,
        title: `Widerspruch: ${c.field ?? "unbekannt"}`,
        description:
          c.description ??
          `Konflikt zwischen Dokumenten: "${c.value_a ?? "—"}" vs "${c.value_b ?? "—"}"`,
        caseSlug: caseItem.slug,
        caseTitle: caseItem.title,
        href: `/dashboard/cases/${caseItem.slug}?tab=strategy`,
        createdAt: new Date().toISOString(),
      });
    }
  }

  return insights;
}

/**
 * Generate deadline risk insights for the dashboard.
 */
function generateDeadlineRisks(input: InsightInput): Insight[] {
  const insights: Insight[] = [];

  for (const caseItem of input.cases) {
    if (!isOpenCase(caseItem.frontmatter?.status)) continue;
    const deadlines = caseItem.frontmatter?.deadlines ?? [];
    for (const dl of deadlines) {
      const dueStr = dl.due_date ?? dl.date;
      if (!dueStr || dl.status === "done") continue;
      const days = daysUntil(dueStr);
      if (days < 0) {
        insights.push({
          id: `ins-dr-overdue-${caseItem.slug}-${dueStr}`,
          type: "deadline_risk",
          severity: "critical",
          title: "Frist versäumt",
          description: `Frist "${dl.title ?? dueStr}" in Akte "${
            caseItem.title ?? caseItem.slug
          }" ist ${Math.abs(days)} Tag${Math.abs(days) === 1 ? "" : "e"} überfällig.`,
          caseSlug: caseItem.slug,
          caseTitle: caseItem.title,
          href: `/dashboard/cases/${caseItem.slug}?tab=deadlines`,
          createdAt: new Date().toISOString(),
        });
      }
    }
  }

  return insights;
}

/**
 * Main entry point: generate all insights from input data.
 */
export function generateInsights(input: InsightInput): Insight[] {
  const safeInput: InsightInput = {
    cases: input.cases ?? [],
    judgements: input.judgements ?? [],
    recentDocuments: input.recentDocuments ?? [],
  };
  return [
    ...generateJudgementMatches(safeInput),
    ...generatePlaybookHints(safeInput),
    ...generateExtractionIssues(safeInput),
    ...generateRealContradictions(safeInput),
    ...generateDeadlineRisks(safeInput),
  ].sort((a, b) => {
    // Sort by severity (critical first), then by date (newest first)
    const severityOrder: Record<InsightSeverity, number> = {
      critical: 0,
      warning: 1,
      info: 2,
    };
    const sevDiff = severityOrder[a.severity] - severityOrder[b.severity];
    if (sevDiff !== 0) return sevDiff;
    return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
  });
}

/**
 * Filter out dismissed insights.
 */
export function filterActiveInsights(insights: Insight[]): Insight[] {
  return insights.filter((i) => !i.dismissed);
}
