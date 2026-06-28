"use client";

import { useState } from "react";
import {
  Users,
  Activity,
  TrendingUp,
  TrendingDown,
  Minus,
  Loader2,
  AlertCircle,
  BarChart3,
  Zap,
  Clock,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useApiQuery } from "@/lib/use-api-query";

interface UserUsage {
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

interface FeatureUsage {
  feature: string;
  count: number;
  unique_users: number;
  trend: string;
}

interface UsageTrend {
  date: string;
  total_requests: number;
  unique_users: number;
  queries: number;
  analyses: number;
}

interface AdoptionAnalytics {
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

const trendIcon: Record<string, typeof TrendingUp> = {
  up: TrendingUp,
  down: TrendingDown,
  stable: Minus,
};

const trendColor: Record<string, string> = {
  up: "text-green-600",
  down: "text-red-600",
  stable: "text-muted-foreground",
};

export default function AdoptionAnalyticsPage() {
  const [daysBack, setDaysBack] = useState(30);

  const { data, loading, error, refetch } = useApiQuery<AdoptionAnalytics>(async () => {
    const res = await fetch(`/api/analytics/adoption?daysBack=${daysBack}`, {
      signal: AbortSignal.timeout(30_000),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return (await res.json()) as AdoptionAnalytics;
  }, [daysBack]);

  if (loading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <Loader2 className="text-muted-foreground h-8 w-8 animate-spin" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4">
        <AlertCircle className="text-destructive h-12 w-12" />
        <p className="text-muted-foreground">Fehler beim Laden der Analytics: {error}</p>
        <Button onClick={refetch} variant="outline">
          Erneut versuchen
        </Button>
      </div>
    );
  }

  if (!data) return null;

  return (
    <div className="mx-auto max-w-[1600px] space-y-6 p-4 md:p-6 lg:p-8">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <h1 className="flex items-center gap-2 text-xl font-bold md:text-2xl">
            <BarChart3 className="h-5 w-5 shrink-0 md:h-6 md:w-6" />
            Adoption Analytics
          </h1>
          <p className="text-muted-foreground mt-1 text-sm">
            Stand: {new Date(data.generated_at).toLocaleString("de-DE")}
          </p>
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-2">
          {[7, 30, 90, 180].map((d) => (
            <Button
              key={d}
              onClick={() => setDaysBack(d)}
              variant={daysBack === d ? "primary" : "outline"}
              size="sm"
            >
              {d}d
            </Button>
          ))}
        </div>
      </div>

      {data.warnings.length > 0 && (
        <Card className="border-yellow-200 bg-yellow-50 p-4">
          <div className="flex items-start gap-2">
            <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-yellow-600" />
            <div className="text-sm">
              <ul className="space-y-1 text-yellow-700">
                {data.warnings.map((w, i) => (
                  <li key={i}>{w}</li>
                ))}
              </ul>
            </div>
          </div>
        </Card>
      )}

      {/* KPI Cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card className="p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-muted-foreground text-sm">Aktive Nutzer (30d)</p>
              <p className="text-2xl font-bold">{data.active_users_30d}</p>
              <p className="text-muted-foreground text-xs">von {data.total_users} gesamt</p>
            </div>
            <Users className="h-8 w-8 text-blue-500" />
          </div>
        </Card>
        <Card className="p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-muted-foreground text-sm">Aktive Nutzer (7d)</p>
              <p className="text-2xl font-bold">{data.active_users_7d}</p>
            </div>
            <Activity className="h-8 w-8 text-green-500" />
          </div>
        </Card>
        <Card className="p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-muted-foreground text-sm">Anfragen (30d)</p>
              <p className="text-2xl font-bold">{data.total_requests_30d}</p>
            </div>
            <Zap className="h-8 w-8 text-orange-500" />
          </div>
        </Card>
        <Card className="p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-muted-foreground text-sm">Adoption Rate</p>
              <p className="text-2xl font-bold">{data.adoption_rate}%</p>
              <p className="text-muted-foreground text-xs">
                Ø {data.avg_requests_per_user} Anfragen/Nutzer
              </p>
            </div>
            <TrendingUp className="h-8 w-8 text-purple-500" />
          </div>
        </Card>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Feature Usage */}
        <Card className="p-6">
          <h2 className="mb-4 text-lg font-semibold">Feature-Nutzung</h2>
          {data.top_features.length === 0 ? (
            <p className="text-muted-foreground text-sm">Keine Nutzungsdaten verfügbar.</p>
          ) : (
            <div className="space-y-2">
              {data.top_features.map((f, i) => {
                const Icon = trendIcon[f.trend] ?? Minus;
                return (
                  <div
                    key={i}
                    className="flex items-center justify-between border-b py-2 last:border-0"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium capitalize">{f.feature}</p>
                      <p className="text-muted-foreground text-xs">
                        {f.unique_users} eindeutige Nutzer
                      </p>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="text-sm font-medium">{f.count}</span>
                      <Icon className={`h-4 w-4 ${trendColor[f.trend]}`} />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </Card>

        {/* User Breakdown */}
        <Card className="p-6">
          <h2 className="mb-4 text-lg font-semibold">Nutzer-Übersicht</h2>
          {data.user_breakdown.length === 0 ? (
            <p className="text-muted-foreground text-sm">Keine Nutzer-Daten verfügbar.</p>
          ) : (
            <div className="max-h-96 space-y-2 overflow-y-auto">
              {data.user_breakdown.map((u, i) => (
                <div
                  key={i}
                  className="flex items-center justify-between border-b py-2 last:border-0"
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{u.user_name || u.user_id}</p>
                    <div className="mt-0.5 flex items-center gap-2">
                      <Badge variant="default" className="text-xs">
                        {u.role}
                      </Badge>
                      <span className="text-muted-foreground flex items-center gap-1 text-xs">
                        <Clock className="h-3 w-3" />
                        {new Date(u.last_active).toLocaleDateString("de-DE")}
                      </span>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-medium">{u.total_requests}</p>
                    <p className="text-muted-foreground text-xs">Anfragen</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>

      {/* Usage Trends Chart */}
      {data.usage_trends.length > 0 && (
        <Card className="p-6">
          <h2 className="mb-4 text-lg font-semibold">Nutzungs-Trends</h2>
          <div className="grid grid-cols-4 gap-1.5 sm:grid-cols-7 md:grid-cols-14 lg:grid-cols-30">
            {data.usage_trends
              .slice(0, 30)
              .reverse()
              .map((t, i) => {
                const maxRequests = Math.max(...data.usage_trends.map((d) => d.total_requests), 1);
                const height = Math.max(4, Math.round((t.total_requests / maxRequests) * 60));
                return (
                  <div
                    key={i}
                    className="flex flex-col items-center gap-1"
                    title={`${t.date}: ${t.total_requests} Anfragen, ${t.unique_users} Nutzer`}
                  >
                    <div
                      className="w-full rounded-t bg-blue-500 transition-all hover:bg-blue-600"
                      style={{ height: `${height}px` }}
                    />
                    <span className="text-muted-foreground text-[10px]">
                      {new Date(t.date).toLocaleDateString("de-DE", { day: "numeric" })}
                    </span>
                  </div>
                );
              })}
          </div>
        </Card>
      )}
    </div>
  );
}
