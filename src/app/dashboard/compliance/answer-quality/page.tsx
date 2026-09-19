"use client";

import { useEffect, useState } from "react";
import { ThumbsDown, ThumbsUp } from "lucide-react";
import { PageHeader } from "@/components/dashboard/page-header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { unwrapApiBody } from "@/lib/api-body";
import { formatDate } from "@/lib/utils";

interface Summary {
  up: number;
  down: number;
  reasons: { wrong: number; missing_source: number; incomplete: number; other: number };
  recentDown: Array<{
    question: string;
    answerExcerpt: string;
    reason?: string;
    comment?: string;
    caseSlug?: string;
    createdAt: string;
  }>;
}

const REASON_LABEL: Record<string, string> = {
  wrong: "Falsch",
  missing_source: "Quelle fehlt",
  incomplete: "Unvollständig",
  other: "Anderes",
};

/**
 * How the firm rated Copilot answers (lib/answer-feedback.ts): share of
 * helpful answers, why answers failed, and the latest unhelpful ones to
 * review. Admins only.
 */
export default function AnswerQualityPage() {
  const [days, setDays] = useState(30);
  const [data, setData] = useState<Summary | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setData(null);
    fetch(`/api/copilot/feedback?days=${days}`)
      .then(async (res) => {
        const body = await res.json();
        if (!res.ok) throw new Error(body?.error?.message ?? "Nicht verfügbar");
        setData(unwrapApiBody<Summary>(body));
      })
      .catch((err) => setError(err instanceof Error ? err.message : String(err)));
  }, [days]);

  const total = data ? data.up + data.down : 0;
  const share = data && total > 0 ? Math.round((data.up / total) * 100) : null;

  return (
    <div className="mx-auto max-w-[1000px] space-y-6 p-4 md:p-6 lg:p-8">
      <PageHeader
        title="Antwortqualität des Copilots"
        description="Wie Ihre Kanzlei die Antworten bewertet hat – als Nachweis der menschlichen Kontrolle und um schwache Antworten gezielt zu prüfen."
        breadcrumbs={[
          { label: "Dashboard", href: "/dashboard" },
          { label: "Compliance", href: "/dashboard/compliance" },
          { label: "Antwortqualität" },
        ]}
        actions={
          <select
            value={days}
            onChange={(e) => setDays(Number(e.target.value))}
            aria-label="Zeitraum"
            className="rounded-lg border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] px-2 py-1 text-sm"
          >
            <option value={7}>7 Tage</option>
            <option value={30}>30 Tage</option>
            <option value={90}>90 Tage</option>
            <option value={365}>1 Jahr</option>
          </select>
        }
      />

      {error ? (
        <p className="text-sm text-[color:var(--ds-danger-text)]">{error}</p>
      ) : !data ? (
        <Skeleton className="h-40 w-full" />
      ) : (
        <>
          <div className="grid gap-3 md:grid-cols-3">
            <Card>
              <CardHeader className="pb-1">
                <CardDescription>Hilfreich</CardDescription>
                <CardTitle className="flex items-center gap-2 text-2xl tabular-nums">
                  <ThumbsUp size={16} aria-hidden="true" />
                  {data.up}
                </CardTitle>
              </CardHeader>
            </Card>
            <Card>
              <CardHeader className="pb-1">
                <CardDescription>Nicht hilfreich</CardDescription>
                <CardTitle className="flex items-center gap-2 text-2xl tabular-nums">
                  <ThumbsDown size={16} aria-hidden="true" />
                  {data.down}
                </CardTitle>
              </CardHeader>
            </Card>
            <Card>
              <CardHeader className="pb-1">
                <CardDescription>Anteil hilfreich</CardDescription>
                <CardTitle className="text-2xl tabular-nums">
                  {share === null ? "–" : `${share} %`}
                </CardTitle>
              </CardHeader>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Gründe für schlechte Bewertungen</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-wrap gap-4 text-sm">
              {Object.entries(data.reasons).map(([k, v]) => (
                <span key={k} className="text-[color:var(--ds-text-muted)]">
                  {REASON_LABEL[k]}:{" "}
                  <span className="font-semibold text-[color:var(--ds-text)] tabular-nums">
                    {v}
                  </span>
                </span>
              ))}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Zuletzt als nicht hilfreich bewertet</CardTitle>
              <CardDescription>Frage und Antwortauszug zum Nachprüfen.</CardDescription>
            </CardHeader>
            <CardContent>
              {data.recentDown.length === 0 ? (
                <p className="text-sm text-[color:var(--ds-text-muted)]">
                  Keine im gewählten Zeitraum.
                </p>
              ) : (
                <ul className="divide-y divide-[color:var(--ds-border)]">
                  {data.recentDown.map((d, i) => (
                    <li key={`${d.createdAt}-${i}`} className="space-y-1 py-3 text-sm">
                      <div className="flex flex-wrap items-center gap-2 text-xs text-[color:var(--ds-text-subtle)]">
                        <span>{formatDate(d.createdAt)}</span>
                        {d.reason && <span>· {REASON_LABEL[d.reason] ?? d.reason}</span>}
                        {d.caseSlug && <span>· {d.caseSlug}</span>}
                      </div>
                      <p className="font-medium text-[color:var(--ds-text)]">{d.question || "–"}</p>
                      <p className="line-clamp-3 text-[color:var(--ds-text-muted)]">
                        {d.answerExcerpt}
                      </p>
                      {d.comment && <p className="text-xs italic">„{d.comment}“</p>}
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
