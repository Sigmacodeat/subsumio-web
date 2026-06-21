"use client";

import { useState } from "react";
import {
  ClipboardList,
  Loader2,
  AlertTriangle,
  CalendarClock,
  Euro,
  Bell,
  FileText,
  Clock,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { api } from "@/lib/api";
import type { ObligationExtractionResult } from "@/lib/types";
import { cn } from "@/lib/utils";
import { PageHeader } from "@/components/dashboard/page-header";

const URGENCY_STYLES: Record<string, string> = {
  low: "bg-blue-500/10 text-blue-600 border-blue-500/20",
  medium: "bg-amber-500/10 text-amber-600 border-amber-500/20",
  high: "bg-orange-500/10 text-orange-600 border-orange-500/20",
  critical: "bg-red-500/10 text-red-600 border-red-500/20",
};

const TYPE_ICONS: Record<string, typeof ClipboardList> = {
  payment: Euro,
  notice: Bell,
  delivery: FileText,
  performance: ClipboardList,
  compliance: FileText,
  renewal: CalendarClock,
  termination: AlertTriangle,
  other: ClipboardList,
};

export default function ObligationTrackingPage() {
  const [mode, setMode] = useState<"text" | "slug">("slug");
  const [slug, setSlug] = useState("");
  const [text, setText] = useState("");
  const [jurisdiction, setJurisdiction] = useState<"at" | "de" | "ch" | "all">("all");
  const [result, setResult] = useState<ObligationExtractionResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run() {
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const res = await api.legal.extractObligations({
        ...(mode === "slug" ? { document_slug: slug.trim() } : { text: text.trim() }),
        jurisdiction,
      });
      setResult(res);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Extraktion fehlgeschlagen.");
    } finally {
      setLoading(false);
    }
  }

  const canRun = mode === "slug" ? slug.trim().length > 0 : text.trim().length > 0;

  return (
    <div className="mx-auto max-w-5xl space-y-6 p-4 md:p-8">
      <PageHeader
        title="Pflichten-Tracking"
        description="Extrahiert Vertragsverpflichtungen, Kündigungsfristen, Zahlungstermine und Verlängerungsdaten aus Verträgen"
        breadcrumbs={[{ label: "Dashboard", href: "/dashboard" }, { label: "Pflichten-Tracking" }]}
      />

      {/* Input */}
      <div className="space-y-3 rounded-xl border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] p-4">
        <div className="flex gap-2">
          <button
            onClick={() => setMode("slug")}
            className={cn(
              "rounded-lg px-3 py-1.5 text-xs font-medium transition-colors",
              mode === "slug"
                ? "brand-soft brand-text brand-border border"
                : "border border-transparent text-[color:var(--ds-text-muted)] hover:bg-[color:var(--ds-hover)]"
            )}
          >
            Aus Vault (Slug)
          </button>
          <button
            onClick={() => setMode("text")}
            className={cn(
              "rounded-lg px-3 py-1.5 text-xs font-medium transition-colors",
              mode === "text"
                ? "brand-soft brand-text brand-border border"
                : "border border-transparent text-[color:var(--ds-text-muted)] hover:bg-[color:var(--ds-hover)]"
            )}
          >
            Direkter Text
          </button>
        </div>

        {mode === "slug" ? (
          <Input
            value={slug}
            onChange={(e) => setSlug(e.target.value)}
            placeholder="Vertrags-Slug aus dem Brain"
            className="border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] text-[color:var(--ds-text)]"
          />
        ) : (
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Vertragstext hier einfügen…"
            className="h-40 w-full resize-none rounded-lg border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] px-4 py-3 font-mono text-sm leading-relaxed text-[color:var(--ds-text)] focus:border-emerald-500/50 focus:outline-none"
          />
        )}

        <div className="flex items-center gap-3">
          <label className="text-xs font-medium text-[color:var(--ds-text-muted)]">
            Rechtsordnung:
          </label>
          <div className="flex gap-1">
            {(["all", "at", "de", "ch"] as const).map((j) => (
              <button
                key={j}
                onClick={() => setJurisdiction(j)}
                className={cn(
                  "rounded-md px-2.5 py-1 text-xs font-medium transition-colors",
                  jurisdiction === j
                    ? "brand-soft brand-text brand-border border"
                    : "border border-transparent text-[color:var(--ds-text-muted)] hover:bg-[color:var(--ds-hover)]"
                )}
              >
                {j === "all" ? "Alle" : j.toUpperCase()}
              </button>
            ))}
          </div>
        </div>

        <Button
          onClick={run}
          disabled={loading || !canRun}
          className="gap-2 bg-emerald-600 text-white hover:bg-emerald-500"
        >
          {loading ? <Loader2 size={15} className="animate-spin" /> : <ClipboardList size={15} />}
          Obligationen extrahieren
        </Button>
      </div>

      {error && (
        <div className="flex items-center gap-2 rounded-lg border border-red-500/20 bg-red-500/5 px-4 py-3 text-sm text-red-600">
          <AlertTriangle size={16} /> {error}
        </div>
      )}

      {result && (
        <div className="space-y-4">
          {/* Summary */}
          {result.summary && (
            <div className="rounded-xl border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] p-4">
              <p className="text-sm text-[color:var(--ds-text)]">{result.summary}</p>
            </div>
          )}

          {/* Obligations */}
          {result.obligations.length > 0 && (
            <div className="rounded-xl border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] p-4">
              <h3 className="mb-3 flex items-center gap-2 text-xs font-semibold tracking-wider text-[color:var(--ds-text-muted)] uppercase">
                <ClipboardList size={14} /> Verpflichtungen ({result.obligations.length})
              </h3>
              <div className="space-y-3">
                {result.obligations.map((o, i) => {
                  const Icon = TYPE_ICONS[o.type] ?? ClipboardList;
                  return (
                    <div key={i} className="border-l-2 border-[color:var(--ds-border)] pl-4">
                      <div className="mb-1 flex items-center gap-2">
                        <Icon size={13} className="text-[color:var(--ds-text-muted)]" />
                        <Badge
                          variant="default"
                          className={cn("border text-xs", URGENCY_STYLES[o.urgency])}
                        >
                          {o.urgency}
                        </Badge>
                        <Badge
                          variant="default"
                          className="border-[color:var(--ds-border)] bg-[color:var(--ds-hover)] text-xs text-[color:var(--ds-text-muted)]"
                        >
                          {o.type}
                        </Badge>
                        {o.trigger_date && (
                          <span className="font-mono text-xs text-[color:var(--ds-text-muted)]">
                            {o.trigger_date}
                          </span>
                        )}
                        {o.recurring && o.recurring !== "one-time" && (
                          <Badge
                            variant="default"
                            className="border-blue-500/20 bg-blue-500/10 text-xs text-blue-600"
                          >
                            {o.recurring}
                          </Badge>
                        )}
                      </div>
                      <p className="text-sm text-[color:var(--ds-text)]">{o.description}</p>
                      <div className="mt-1 flex items-center gap-3 text-xs text-[color:var(--ds-text-muted)]">
                        <span>
                          <strong className="text-[color:var(--ds-text)]">
                            {o.obligated_party}
                          </strong>{" "}
                          → {o.counterparty}
                        </span>
                        {o.clause_reference && <span>§ {o.clause_reference}</span>}
                      </div>
                      {o.notes && (
                        <p className="mt-1 text-xs text-[color:var(--ds-text-muted)] italic">
                          {o.notes}
                        </p>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Renewal Dates */}
          {result.renewal_dates.length > 0 && (
            <div className="rounded-xl border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] p-4">
              <h3 className="mb-3 flex items-center gap-2 text-xs font-semibold tracking-wider text-[color:var(--ds-text-muted)] uppercase">
                <CalendarClock size={14} /> Verlängerungsdaten ({result.renewal_dates.length})
              </h3>
              <div className="space-y-2">
                {result.renewal_dates.map((r, i) => (
                  <div key={i} className="flex items-center gap-3 text-sm">
                    <span className="font-mono whitespace-nowrap text-[color:var(--ds-text)]">
                      {r.date}
                    </span>
                    <span className="text-[color:var(--ds-text-muted)]">{r.description}</span>
                    {r.auto_renew && (
                      <Badge
                        variant="default"
                        className="border-amber-500/20 bg-amber-500/10 text-xs text-amber-600"
                      >
                        Auto-Renewal
                      </Badge>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Payment Terms */}
          {result.payment_terms.length > 0 && (
            <div className="rounded-xl border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] p-4">
              <h3 className="mb-3 flex items-center gap-2 text-xs font-semibold tracking-wider text-[color:var(--ds-text-muted)] uppercase">
                <Euro size={14} /> Zahlungstermine ({result.payment_terms.length})
              </h3>
              <div className="space-y-2">
                {result.payment_terms.map((p, i) => (
                  <div key={i} className="flex items-center gap-3 text-sm">
                    <span className="font-mono whitespace-nowrap text-[color:var(--ds-text)]">
                      {p.due_date}
                    </span>
                    {p.amount && (
                      <Badge
                        variant="default"
                        className="border-emerald-500/20 bg-emerald-500/10 text-xs text-emerald-600"
                      >
                        {p.amount}
                      </Badge>
                    )}
                    <span className="text-[color:var(--ds-text-muted)]">{p.description}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Notice Periods */}
          {result.notice_periods.length > 0 && (
            <div className="rounded-xl border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] p-4">
              <h3 className="mb-3 flex items-center gap-2 text-xs font-semibold tracking-wider text-[color:var(--ds-text-muted)] uppercase">
                <Clock size={14} /> Kündigungsfristen ({result.notice_periods.length})
              </h3>
              <div className="space-y-2">
                {result.notice_periods.map((n, i) => (
                  <div key={i} className="flex items-center gap-3 text-sm">
                    <span className="text-[color:var(--ds-text)]">{n.event}</span>
                    <span className="text-[color:var(--ds-text-muted)]">{n.notice_period}</span>
                    <Badge
                      variant="default"
                      className="border-blue-500/20 bg-blue-500/10 text-xs text-blue-600"
                    >
                      {n.days} Tage
                    </Badge>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Warnings */}
          {result.warnings.length > 0 && (
            <div className="rounded-lg border border-amber-500/20 bg-amber-500/5 p-3">
              {result.warnings.map((w, i) => (
                <p key={i} className="text-xs text-amber-600">
                  {w}
                </p>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
