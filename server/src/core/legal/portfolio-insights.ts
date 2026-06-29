/**
 * portfolio-insights — Cross-contract analytics for in-house legal teams.
 *
 * Aggregates clause data, risk distributions, and obligation summaries across
 * the entire contract portfolio. Detects outlier provisions that deviate from
 * the norm, surfaces trends in negotiated positions, and tracks upcoming
 * obligations.
 *
 * This is the Subsumio equivalent of Harvey's "Contract Intelligence" portfolio
 * view — but grounded in the brain's actual document store, not a separate CLM.
 */
import type { BrainEngine } from "../engine.ts";

export interface ClauseFrequency {
  clause_type: string;
  count: number;
  percentage: number;
  avg_risk_level: "low" | "medium" | "high" | "critical";
  variants: number;
}

export interface OutlierProvision {
  slug: string;
  title: string;
  clause_type: string;
  deviation: string;
  severity: "info" | "warning" | "critical";
  expected: string;
  actual: string;
}

export interface ObligationSummary {
  total: number;
  upcoming_30_days: number;
  overdue: number;
  by_type: Record<string, number>;
}

export interface RiskDistribution {
  low: number;
  medium: number;
  high: number;
  critical: number;
}

export interface PortfolioTrend {
  period: string;
  contract_count: number;
  avg_risk_score: number;
  top_clauses: string[];
}

export interface PortfolioInsights {
  total_contracts: number;
  analyzed_contracts: number;
  risk_distribution: RiskDistribution;
  clause_frequencies: ClauseFrequency[];
  outlier_provisions: OutlierProvision[];
  obligation_summary: ObligationSummary;
  trends: PortfolioTrend[];
  negotiation_patterns: string[];
  warnings: string[];
  generated_at: string;
  attorney_review_required: true;
}

export interface PortfolioInsightsOpts {
  sourceId?: string;
  sourceIds?: string[];
  limit?: number;
  daysBack?: number;
}

const RISK_SCORE: Record<string, number> = { low: 1, medium: 2, high: 3, critical: 4 };

interface ContractMeta {
  slug: string;
  title: string;
  frontmatter: Record<string, unknown>;
  content: string;
  updated_at: string;
}

async function loadContracts(
  engine: BrainEngine,
  opts: PortfolioInsightsOpts
): Promise<ContractMeta[]> {
  const limit = opts.limit ?? 200;

  const rows = await engine.executeRaw<{
    slug: string;
    title: string;
    frontmatter: Record<string, unknown>;
    compiled_truth: string;
    updated_at: string;
  }>(
    `SELECT slug, title, frontmatter,
            COALESCE(compiled_truth, content, '') as compiled_truth,
            updated_at::text as updated_at
     FROM pages
     WHERE type = 'contract'
       AND deleted_at IS NULL
       ${opts.sourceId && opts.sourceId !== "default" ? "AND source_id = $2" : ""}
     ORDER BY updated_at DESC
     LIMIT $1`,
    opts.sourceId && opts.sourceId !== "default" ? [limit, opts.sourceId] : [limit]
  );

  return rows.map((r) => ({
    slug: r.slug,
    title: r.title,
    frontmatter: r.frontmatter ?? {},
    content: r.compiled_truth ?? "",
    updated_at: r.updated_at,
  }));
}

function extractClauseFrequencies(contracts: ContractMeta[]): ClauseFrequency[] {
  const clauseMap = new Map<string, { count: number; risks: string[]; variants: Set<string> }>();

  for (const c of contracts) {
    const analysis = (c.frontmatter.auto_analysis ?? c.frontmatter.analysis ?? {}) as Record<
      string,
      unknown
    >;
    const risks = Array.isArray(analysis.risks)
      ? (analysis.risks as Array<Record<string, unknown>>)
      : [];
    const clauses = Array.isArray(analysis.clauses)
      ? (analysis.clauses as Array<Record<string, unknown>>)
      : [];

    for (const clause of clauses) {
      const type = String(clause.type ?? clause.clause_type ?? "unknown");
      const variant = String(clause.variant ?? clause.text ?? "").slice(0, 100);
      const existing = clauseMap.get(type) ?? { count: 0, risks: [], variants: new Set<string>() };
      existing.count++;
      existing.variants.add(variant);
      if (typeof clause.risk_level === "string") existing.risks.push(clause.risk_level);
      clauseMap.set(type, existing);
    }

    for (const risk of risks) {
      const type = String(risk.category ?? risk.type ?? "general");
      const existing = clauseMap.get(type) ?? { count: 0, risks: [], variants: new Set<string>() };
      existing.count++;
      if (typeof risk.severity === "string") existing.risks.push(risk.severity);
      clauseMap.set(type, existing);
    }
  }

  const total = contracts.length || 1;
  return Array.from(clauseMap.entries())
    .map(([type, data]) => {
      const avgRisk =
        data.risks.length > 0
          ? data.risks.reduce((sum, r) => sum + (RISK_SCORE[r] ?? 1), 0) / data.risks.length
          : 1;
      const riskLevel =
        avgRisk >= 3.5 ? "critical" : avgRisk >= 2.5 ? "high" : avgRisk >= 1.5 ? "medium" : "low";
      return {
        clause_type: type,
        count: data.count,
        percentage: Math.round((data.count / total) * 100),
        avg_risk_level: riskLevel as ClauseFrequency["avg_risk_level"],
        variants: data.variants.size,
      };
    })
    .sort((a, b) => b.count - a.count)
    .slice(0, 20);
}

function detectOutliers(contracts: ContractMeta[]): OutlierProvision[] {
  const outliers: OutlierProvision[] = [];

  for (const c of contracts) {
    const analysis = (c.frontmatter.auto_analysis ?? c.frontmatter.analysis ?? {}) as Record<
      string,
      unknown
    >;
    const risks = Array.isArray(analysis.risks)
      ? (analysis.risks as Array<Record<string, unknown>>)
      : [];

    for (const risk of risks) {
      const severity = String(risk.severity ?? "low");
      if (severity === "high" || severity === "critical") {
        outliers.push({
          slug: c.slug,
          title: c.title,
          clause_type: String(risk.category ?? risk.type ?? "unknown"),
          deviation: String(risk.description ?? ""),
          severity: severity === "critical" ? "critical" : "warning",
          expected: String(risk.mitigation ?? "Standardposition gemäß Playbook"),
          actual: String(risk.description ?? ""),
        });
      }
    }

    // Check for unusual contract terms (long duration, high value, unusual clauses)
    const duration = c.frontmatter.contract_duration as number | undefined;
    if (duration && duration > 60) {
      outliers.push({
        slug: c.slug,
        title: c.title,
        clause_type: "Vertragslaufzeit",
        deviation: `Ungewöhnlich lange Laufzeit: ${duration} Monate`,
        severity: "warning",
        expected: "Üblich: 12-36 Monate",
        actual: `${duration} Monate`,
      });
    }

    const value = c.frontmatter.contract_value as number | undefined;
    if (value && value > 500000) {
      outliers.push({
        slug: c.slug,
        title: c.title,
        clause_type: "Vertragsvolumen",
        deviation: `Hohes Vertragsvolumen: €${value.toLocaleString("de-DE")}`,
        severity: "info",
        expected: "Standardvolumen < €500.000",
        actual: `€${value.toLocaleString("de-DE")}`,
      });
    }
  }

  return outliers.slice(0, 50);
}

function summarizeObligations(contracts: ContractMeta[]): ObligationSummary {
  let total = 0;
  let upcoming30 = 0;
  let overdue = 0;
  const byType: Record<string, number> = {};

  const now = new Date();
  const in30Days = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);

  for (const c of contracts) {
    const obligations = Array.isArray(c.frontmatter.obligations)
      ? (c.frontmatter.obligations as Array<Record<string, unknown>>)
      : [];

    for (const obs of obligations) {
      total++;
      const type = String(obs.type ?? "general");
      byType[type] = (byType[type] ?? 0) + 1;

      const dueDate = obs.due_date ? new Date(String(obs.due_date)) : null;
      if (dueDate) {
        if (dueDate < now) overdue++;
        else if (dueDate <= in30Days) upcoming30++;
      }
    }
  }

  return { total, upcoming_30_days: upcoming30, overdue, by_type: byType };
}

function calculateRiskDistribution(contracts: ContractMeta[]): RiskDistribution {
  const dist = { low: 0, medium: 0, high: 0, critical: 0 };

  for (const c of contracts) {
    const analysis = (c.frontmatter.auto_analysis ?? c.frontmatter.analysis ?? {}) as Record<
      string,
      unknown
    >;
    const overallRisk = String(analysis.overall_risk ?? "low");
    if (dist[overallRisk as keyof RiskDistribution] !== undefined) {
      dist[overallRisk as keyof RiskDistribution]++;
    } else {
      dist.low++;
    }
  }

  return dist;
}

function calculateTrends(contracts: ContractMeta[], daysBack: number): PortfolioTrend[] {
  const now = new Date();
  const periods: PortfolioTrend[] = [];
  const periodCount = Math.min(6, Math.ceil(daysBack / 30));

  for (let i = periodCount - 1; i >= 0; i--) {
    const periodStart = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const periodEnd = new Date(now.getFullYear(), now.getMonth() - i + 1, 0, 23, 59, 59);
    const periodLabel = periodStart.toLocaleDateString("de-DE", {
      month: "short",
      year: "numeric",
    });

    const periodContracts = contracts.filter((c) => {
      const updated = new Date(c.updated_at);
      return updated >= periodStart && updated <= periodEnd;
    });

    const riskScores = periodContracts.map((c) => {
      const analysis = (c.frontmatter.auto_analysis ?? c.frontmatter.analysis ?? {}) as Record<
        string,
        unknown
      >;
      return RISK_SCORE[String(analysis.overall_risk ?? "low")] ?? 1;
    });

    const avgRisk =
      riskScores.length > 0 ? riskScores.reduce((a, b) => a + b, 0) / riskScores.length : 0;

    const clauseTypes = new Set<string>();
    for (const c of periodContracts) {
      const analysis = (c.frontmatter.auto_analysis ?? c.frontmatter.analysis ?? {}) as Record<
        string,
        unknown
      >;
      const clauses = Array.isArray(analysis.clauses)
        ? (analysis.clauses as Array<Record<string, unknown>>)
        : [];
      for (const cl of clauses) clauseTypes.add(String(cl.type ?? cl.clause_type ?? ""));
    }

    periods.push({
      period: periodLabel,
      contract_count: periodContracts.length,
      avg_risk_score: Math.round(avgRisk * 10) / 10,
      top_clauses: Array.from(clauseTypes).slice(0, 5),
    });
  }

  return periods;
}

function extractNegotiationPatterns(contracts: ContractMeta[]): string[] {
  const patterns: string[] = [];

  const counterparties = new Map<string, number>();
  for (const c of contracts) {
    const cp = String(c.frontmatter.counterparty ?? c.frontmatter.gegner ?? "");
    if (cp) counterparties.set(cp, (counterparties.get(cp) ?? 0) + 1);
  }

  const topCounterparties = Array.from(counterparties.entries())
    .filter(([, count]) => count > 1)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5);

  for (const [name, count] of topCounterparties) {
    patterns.push(`${name}: ${count} Verträge — wiederkehrende Verhandlungspartner`);
  }

  const clauseFreq = extractClauseFrequencies(contracts);
  const highRiskClauses = clauseFreq.filter(
    (c) => c.avg_risk_level === "high" || c.avg_risk_level === "critical"
  );
  if (highRiskClauses.length > 0) {
    patterns.push(
      `Häufige Risikoklauseln: ${highRiskClauses.map((c) => c.clause_type).join(", ")}`
    );
  }

  const recentContracts = contracts.filter((c) => {
    const updated = new Date(c.updated_at);
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    return updated >= thirtyDaysAgo;
  });
  if (recentContracts.length > 0) {
    patterns.push(
      `${recentContracts.length} Verträge in den letzten 30 Tagen — Verhandlungstempo: ${recentContracts.length > 10 ? "hoch" : "normal"}`
    );
  }

  return patterns;
}

export async function portfolioInsights(
  engine: BrainEngine,
  opts: PortfolioInsightsOpts
): Promise<PortfolioInsights> {
  const warnings: string[] = [];
  const daysBack = opts.daysBack ?? 180;

  const contracts = await loadContracts(engine, opts);

  if (contracts.length === 0) {
    warnings.push("NO_CONTRACTS_FOUND");
    return {
      total_contracts: 0,
      analyzed_contracts: 0,
      risk_distribution: { low: 0, medium: 0, high: 0, critical: 0 },
      clause_frequencies: [],
      outlier_provisions: [],
      obligation_summary: { total: 0, upcoming_30_days: 0, overdue: 0, by_type: {} },
      trends: [],
      negotiation_patterns: [],
      warnings,
      generated_at: new Date().toISOString(),
      attorney_review_required: true,
    };
  }

  const analyzed = contracts.filter((c) => c.frontmatter.auto_analysis || c.frontmatter.analysis);
  if (analyzed.length === 0) {
    warnings.push("NO_ANALYZED_CONTRACTS — run legal_analyze_document on contracts first");
  }

  return {
    total_contracts: contracts.length,
    analyzed_contracts: analyzed.length,
    risk_distribution: calculateRiskDistribution(contracts),
    clause_frequencies: extractClauseFrequencies(contracts),
    outlier_provisions: detectOutliers(contracts),
    obligation_summary: summarizeObligations(contracts),
    trends: calculateTrends(contracts, daysBack),
    negotiation_patterns: extractNegotiationPatterns(contracts),
    warnings,
    generated_at: new Date().toISOString(),
    attorney_review_required: true,
  };
}
