"use client";

import { useEffect, useState, useCallback } from "react";
import { Loader2, Shield, AlertTriangle, FileText, Send } from "lucide-react";
import { PageHeader } from "@/components/dashboard/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/components/ui/toast";
import { useLang } from "@/lib/use-lang";
import { api } from "@/lib/api";
import type { RedTeamResult, RedTeamAnnotation } from "@/lib/red-team-agent";

const SEVERITY_COLORS: Record<string, string> = {
  high: "bg-red-100 text-red-700",
  medium: "bg-amber-100 text-amber-700",
  low: "bg-green-100 text-green-700",
};

const TYPE_LABELS: Record<string, string> = {
  weakness: "Schwäche",
  counterargument: "Gegenargument",
  missing_argument: "Fehlendes Argument",
  risk: "Risiko",
  precedent: "Präzedenzfall",
};

export default function RedTeamPage() {
  const { addToast } = useToast();
  const { t } = useLang();
  const [results, setResults] = useState<RedTeamResult[]>([]);
  const [loading, setLoading] = useState(true);
  const [analyzing, setAnalyzing] = useState(false);
  const [form, setForm] = useState({
    case_slug: "",
    draft_text: "",
    case_context: "",
    legal_area: "",
  });

  const load = useCallback(async () => {
    try {
      const pages = await api.brain.listPages({ type: "red_team_result", limit: 50 });
      setResults(pages.map((p) => p.frontmatter as unknown as RedTeamResult));
    } catch {
      addToast({ type: "error", title: t("redteam.err_load") });
    } finally {
      setLoading(false);
    }
  }, [addToast, t]);

  useEffect(() => {
    void load();
  }, [load]);

  const submit = async () => {
    if (!form.case_slug || !form.draft_text || !form.case_context) {
      addToast({ type: "error", title: t("redteam.err_required") });
      return;
    }
    setAnalyzing(true);
    try {
      const res = await fetch("/api/red-team", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          case_slug: form.case_slug,
          draft_text: form.draft_text,
          case_context: form.case_context,
          legal_area: form.legal_area || undefined,
        }),
      });
      if (!res.ok) throw new Error("API error");
      const data = await res.json();
      setResults((prev) => [data.result, ...prev]);
      setForm({ case_slug: "", draft_text: "", case_context: "", legal_area: "" });
      addToast({ type: "success", title: t("redteam.ok_analyze") });
    } catch {
      addToast({ type: "error", title: t("redteam.err_analyze") });
    } finally {
      setAnalyzing(false);
    }
  };

  return (
    <div className="mx-auto max-w-[1200px] space-y-6 p-4 md:p-8">
      <PageHeader
        title={t("redteam.title")}
        description={t("redteam.description")}
        breadcrumbs={[{ label: "Dashboard", href: "/dashboard" }, { label: "Red-Team" }]}
      />

      <section className="space-y-4 rounded-xl border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] p-5">
        <h2 className="flex items-center gap-2 font-semibold">
          <Shield className="h-5 w-5" /> {t("redteam.new")}
        </h2>
        <div className="grid gap-3">
          <div>
            <Label>{t("redteam.case_slug")} *</Label>
            <Input
              value={form.case_slug}
              onChange={(e) => setForm({ ...form, case_slug: e.target.value })}
              placeholder="legal/cases/2026-001"
            />
          </div>
          <div>
            <Label>{t("redteam.legal_area")}</Label>
            <Input
              value={form.legal_area}
              onChange={(e) => setForm({ ...form, legal_area: e.target.value })}
              placeholder="z.B. Mietrecht, Arbeitsrecht"
            />
          </div>
          <div>
            <Label>{t("redteam.context")} *</Label>
            <textarea
              className="w-full rounded-lg border border-[color:var(--ds-border)] bg-[color:var(--ds-surface-2)] p-3 text-sm"
              rows={3}
              value={form.case_context}
              onChange={(e) => setForm({ ...form, case_context: e.target.value })}
              placeholder="Kurze Zusammenfassung des Falls..."
            />
          </div>
          <div>
            <Label>{t("redteam.draft")} *</Label>
            <textarea
              className="w-full rounded-lg border border-[color:var(--ds-border)] bg-[color:var(--ds-surface-2)] p-3 font-mono text-sm"
              rows={6}
              value={form.draft_text}
              onChange={(e) => setForm({ ...form, draft_text: e.target.value })}
              placeholder="Schriftsatz hier einfügen..."
            />
          </div>
          <Button onClick={submit} disabled={analyzing}>
            {analyzing ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" /> {t("redteam.analyzing")}
              </>
            ) : (
              <>
                <Send className="mr-2 h-4 w-4" /> {t("redteam.submit")}
              </>
            )}
          </Button>
        </div>
      </section>

      {loading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-[color:var(--ds-text-muted)]" />
        </div>
      ) : results.length === 0 ? (
        <div className="rounded-xl border border-dashed border-[color:var(--ds-border)] p-12 text-center text-[color:var(--ds-text-muted)]">
          <FileText className="mx-auto mb-3 h-12 w-12 opacity-40" />
          <p>{t("redteam.empty")}</p>
        </div>
      ) : (
        <div className="space-y-4">
          {results.map((result) => (
            <div
              key={result.id}
              className="space-y-3 rounded-xl border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] p-5"
            >
              <div className="flex items-center justify-between">
                <div>
                  <span className="text-sm font-medium">{result.case_slug}</span>
                  <span className="ml-2 text-xs text-[color:var(--ds-text-muted)]">
                    {new Date(result.created_at).toLocaleString("de-DE")}
                  </span>
                </div>
                <Badge className={SEVERITY_COLORS[result.overall_risk] ?? ""}>
                  Risiko: {result.overall_risk}
                </Badge>
              </div>
              <p className="text-xs text-[color:var(--ds-text-muted)]">{result.summary}</p>
              <div className="space-y-2">
                {result.annotations.map((ann: RedTeamAnnotation, idx: number) => (
                  <div
                    key={idx}
                    className="rounded-lg border border-[color:var(--ds-border)] bg-[color:var(--ds-surface-2)] p-3"
                  >
                    <div className="flex items-center gap-2">
                      <Badge className={SEVERITY_COLORS[ann.severity] ?? ""}>{ann.severity}</Badge>
                      <span className="text-xs font-medium">
                        {TYPE_LABELS[ann.type] ?? ann.type}
                      </span>
                      <span className="text-xs text-[color:var(--ds-text-muted)]">
                        · {ann.section}
                      </span>
                    </div>
                    <p className="mt-1 text-sm">{ann.annotation}</p>
                    {ann.suggestion && (
                      <p className="mt-1 text-xs text-[color:var(--ds-text-muted)]">
                        <AlertTriangle className="mr-1 inline h-3 w-3" />
                        {ann.suggestion}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
