/**
 * adoption-analytics — Usage analytics for the Subsumio platform.
 *
 * Aggregates data from the engine's request log and audit trail to provide
 * insights into platform adoption: who's using it, what features they use,
 * and how usage trends over time. This is the Subsumio equivalent of
 * Harvey's "Command Center" — but grounded in the engine's own logs.
 */

import type { BrainEngine } from "../engine.ts";

export interface UserUsage {
  user_id: string;
  user_name: string;
  role: string;
  total_requests: number;
  queries: number;
  documents_analyzed: number;
  contracts_reviewed: number;
  agents_run: number;
  last_active: string;
}

export interface FeatureUsage {
  feature: string;
  count: number;
  unique_users: number;
  trend: "up" | "down" | "stable";
}

export interface UsageTrend {
  date: string;
  total_requests: number;
  unique_users: number;
  queries: number;
  analyses: number;
}

export interface AdoptionAnalytics {
  total_users: number;
  active_users_30d: number;
  active_users_7d: number;
  total_requests_30d: number;
  avg_requests_per_user: number;
  top_features: FeatureUsage[];
  user_breakdown: UserUsage[];
  usage_trends: UsageTrend[];
  adoption_rate: number;
  warnings: string[];
  generated_at: string;
}

export interface AdoptionAnalyticsOpts {
  sourceId?: string;
  daysBack?: number;
}

export async function adoptionAnalytics(
  engine: BrainEngine,
  opts: AdoptionAnalyticsOpts
): Promise<AdoptionAnalytics> {
  const warnings: string[] = [];
  const daysBack = opts.daysBack ?? 30;
  const sourceId = opts.sourceId;

  // Try to query the request log table. If it doesn't exist, return empty.
  let trends: UsageTrend[] = [];
  let userBreakdown: UserUsage[] = [];
  let featureUsage: FeatureUsage[] = [];
  let totalRequests30d = 0;
  let activeUsers30d = 0;
  let activeUsers7d = 0;
  let totalUsers = 0;

  try {
    // Usage trends by day
    trends = await engine.executeRaw<UsageTrend>(
      `SELECT
         DATE(created_at) as date,
         COUNT(*) as total_requests,
         COUNT(DISTINCT user_id) as unique_users,
         COUNT(*) FILTER (WHERE action LIKE 'query.%' OR action = 'legal.document_review') as queries,
         COUNT(*) FILTER (WHERE action LIKE 'legal.%') as analyses
       FROM mcp_request_log
       WHERE created_at >= NOW() - INTERVAL '${daysBack} days'
         ${sourceId && sourceId !== "default" ? `AND source_id = '${sourceId.replace(/'/g, "''")}'` : ""}
       GROUP BY DATE(created_at)
       ORDER BY date DESC
       LIMIT 90`
    );

    totalRequests30d = trends.reduce((sum, t) => sum + t.total_requests, 0);
  } catch {
    warnings.push("MCP_REQUEST_LOG_TABLE_NOT_AVAILABLE");
  }

  try {
    // User breakdown
    userBreakdown = await engine.executeRaw<UserUsage>(
      `SELECT
         user_id,
         MAX(user_name) as user_name,
         MAX(role) as role,
         COUNT(*) as total_requests,
         COUNT(*) FILTER (WHERE action LIKE 'query.%') as queries,
         COUNT(*) FILTER (WHERE action = 'legal.analyze' OR action = 'legal.document_review') as documents_analyzed,
         COUNT(*) FILTER (WHERE action LIKE 'legal.contract%' OR action = 'legal.redline') as contracts_reviewed,
         COUNT(*) FILTER (WHERE action LIKE 'agent.%') as agents_run,
         MAX(created_at)::text as last_active
       FROM mcp_request_log
       WHERE created_at >= NOW() - INTERVAL '${daysBack} days'
         ${sourceId && sourceId !== "default" ? `AND source_id = '${sourceId.replace(/'/g, "''")}'` : ""}
       GROUP BY user_id
       ORDER BY total_requests DESC
       LIMIT 50`
    );

    activeUsers30d = userBreakdown.length;
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    activeUsers7d = userBreakdown.filter((u) => new Date(u.last_active) >= sevenDaysAgo).length;
  } catch {
    if (!warnings.includes("MCP_REQUEST_LOG_TABLE_NOT_AVAILABLE")) {
      warnings.push("USER_BREAKDOWN_QUERY_FAILED");
    }
  }

  try {
    // Feature usage breakdown
    const featureRows = await engine.executeRaw<{
      feature: string;
      count: number;
      unique_users: number;
    }>(
      `SELECT
         SPLIT_PART(action, '.', 1) as feature,
         COUNT(*) as count,
         COUNT(DISTINCT user_id) as unique_users
       FROM mcp_request_log
       WHERE created_at >= NOW() - INTERVAL '${daysBack} days'
         ${sourceId && sourceId !== "default" ? `AND source_id = '${sourceId.replace(/'/g, "''")}'` : ""}
       GROUP BY SPLIT_PART(action, '.', 1)
       ORDER BY count DESC
       LIMIT 20`
    );

    // Calculate trend by comparing first half vs second half of the period
    const halfPeriod = Math.floor(daysBack / 2);
    const recentTrends = await engine.executeRaw<{ feature: string; recent_count: number }>(
      `SELECT
         SPLIT_PART(action, '.', 1) as feature,
         COUNT(*) as recent_count
       FROM mcp_request_log
       WHERE created_at >= NOW() - INTERVAL '${halfPeriod} days'
         ${sourceId && sourceId !== "default" ? `AND source_id = '${sourceId.replace(/'/g, "''")}'` : ""}
       GROUP BY SPLIT_PART(action, '.', 1)`
    );

    const recentMap = new Map(recentTrends.map((r) => [r.feature, r.recent_count]));

    featureUsage = featureRows.map((f) => {
      const recent = recentMap.get(f.feature) ?? 0;
      const older = f.count - recent;
      let trend: "up" | "down" | "stable" = "stable";
      if (older > 0) {
        const ratio = recent / older;
        if (ratio > 1.2) trend = "up";
        else if (ratio < 0.8) trend = "down";
      } else if (recent > 0) {
        trend = "up";
      }
      return { ...f, trend };
    });
  } catch {
    if (!warnings.includes("MCP_REQUEST_LOG_TABLE_NOT_AVAILABLE")) {
      warnings.push("FEATURE_USAGE_QUERY_FAILED");
    }
  }

  // Get total user count from auth store
  try {
    const userCount = await engine.executeRaw<{ count: number }>(
      `SELECT COUNT(DISTINCT user_id) as count FROM mcp_request_log WHERE created_at >= NOW() - INTERVAL '365 days'`
    );
    totalUsers = userCount[0]?.count ?? 0;
  } catch {
    totalUsers = activeUsers30d;
  }

  const adoptionRate = totalUsers > 0 ? Math.round((activeUsers30d / totalUsers) * 100) : 0;
  const avgRequestsPerUser = activeUsers30d > 0 ? Math.round(totalRequests30d / activeUsers30d) : 0;

  return {
    total_users: totalUsers,
    active_users_30d: activeUsers30d,
    active_users_7d: activeUsers7d,
    total_requests_30d: totalRequests30d,
    avg_requests_per_user: avgRequestsPerUser,
    top_features: featureUsage,
    user_breakdown: userBreakdown,
    usage_trends: trends,
    adoption_rate: adoptionRate,
    warnings,
    generated_at: new Date().toISOString(),
  };
}
