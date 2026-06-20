"use client";

import { useState } from "react";
import {
  Radar,
  Loader2,
  AlertTriangle,
  CheckCircle2,
  Clock,
  Settings2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { api } from "@/lib/api";
import type { CaseScannerResponse } from "@/lib/types";
import { PageHeader } from "@/components/dashboard/page-header";

export default function CaseScannerPage() {
  const [lookAhead, setLookAhead] = useState(7);
  const [evidenceThreshold, setEvidenceThreshold] = useState(1);
  const [maxCases, setMaxCases] = useState(50);
  const [result, setResult] = useState<CaseScannerResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run() {
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const res = await api.legal.caseScan({
        look_ahead_days: lookAhead,
        evidence_threshold: evidenceThreshold,
        max_cases: maxCases,
      });
      setResult(res);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Scanner-Start fehlgeschlagen.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="p-6 md:p-8 max-w-3xl mx-auto space-y-6">
      <PageHeader
        title="Akten-Scanner"
        description="Nacht-Agent scannt alle Akten auf drohende Fristen, neue Issues und Evidenz-Lücken — wird asynchron als Engine-Job ausgeführt"
        breadcrumbs={[{ label: "Dashboard", href: "/dashboard" }, { label: "Akten-Scanner" }]}
      />

      {/* Info banner */}
      <div className="rounded-xl border border-blue-500/20 bg-blue-500/5 p-4">
        <div className="flex items-start gap-3">
          <Radar size={18} className="text-blue-600 shrink-0 mt-0.5" />
          <div className="text-sm text-[color:var(--ds-text-muted)] space-y-1">
            <p className="text-[color:var(--ds-text)] font-medium">Wie funktioniert der Akten-Scanner?</p>
            <p>Der Scanner wird als Hintergrund-Job in der Engine gestartet. Er durchsucht alle legal_case pages nach:</p>
            <ul className="list-disc list-inside text-xs space-y-0.5 ml-2">
              <li>Fristen, die in den nächsten N Tagen ablaufen</li>
              <li>Neuen Issues, die seit dem letzten Scan aufgetaucht sind</li>
              <li>Akten mit geringer Evidenz (unter dem Schwellwert)</li>
            </ul>
            <p className="text-xs">Das Ergebnis wird als Job-Status zurückgegeben. Die detaillierten Ergebnisse schreibt der Agent in die jeweiligen Akten-Seiten.</p>
          </div>
        </div>
      </div>

      {/* Configuration */}
      <div className="rounded-xl border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] p-5 space-y-4">
        <h3 className="text-xs uppercase tracking-wider text-[color:var(--ds-text-muted)] font-semibold flex items-center gap-2">
          <Settings2 size={14} /> Konfiguration
        </h3>

        {/* Look ahead */}
        <div>
          <div className="flex items-center justify-between mb-1.5">
            <label className="text-sm text-[color:var(--ds-text)] font-medium">Vorschau-Zeitraum</label>
            <span className="text-sm font-mono text-emerald-600">{lookAhead} Tage</span>
          </div>
          <input
            type="range"
            min={1}
            max={90}
            value={lookAhead}
            onChange={(e) => setLookAhead(Number(e.target.value))}
            className="w-full accent-emerald-600"
          />
          <p className="text-xs text-[color:var(--ds-text-muted)] mt-1">Fristen in den nächsten {lookAhead} Tagen werden als kritisch markiert.</p>
        </div>

        {/* Evidence threshold */}
        <div>
          <div className="flex items-center justify-between mb-1.5">
            <label className="text-sm text-[color:var(--ds-text)] font-medium">Evidenz-Schwellwert</label>
            <span className="text-sm font-mono text-emerald-600">{evidenceThreshold}</span>
          </div>
          <input
            type="range"
            min={0}
            max={10}
            value={evidenceThreshold}
            onChange={(e) => setEvidenceThreshold(Number(e.target.value))}
            className="w-full accent-emerald-600"
          />
          <p className="text-xs text-[color:var(--ds-text-muted)] mt-1">Akten mit weniger als {evidenceThreshold} Evidenzstücken werden flagged.</p>
        </div>

        {/* Max cases */}
        <div>
          <label className="text-sm text-[color:var(--ds-text)] font-medium block mb-1.5">Max. Akten pro Scan</label>
          <select
            value={maxCases}
            onChange={(e) => setMaxCases(Number(e.target.value))}
            className="w-full bg-[color:var(--ds-surface)] border border-[color:var(--ds-border)] rounded-lg px-3 py-2 text-sm text-[color:var(--ds-text)]"
          >
            {[10, 25, 50, 100, 250, 500].map((n) => (
              <option key={n} value={n}>{n} Akten</option>
            ))}
          </select>
        </div>

        <Button onClick={run} disabled={loading} className="gap-2 bg-emerald-600 hover:bg-emerald-500 text-white w-full">
          {loading ? <Loader2 size={16} className="animate-spin" /> : <Radar size={16} />}
          Scan starten
        </Button>
      </div>

      {/* Error */}
      {error && (
        <div className="flex items-center gap-2 px-4 py-3 rounded-lg border border-red-500/20 bg-red-500/5 text-sm text-red-600">
          <AlertTriangle size={16} /> {error}
        </div>
      )}

      {/* Result */}
      {result && (
        <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-5 space-y-3">
          <div className="flex items-center gap-3">
            <CheckCircle2 size={24} className="text-emerald-600" />
            <div>
              <h3 className="text-sm font-medium text-[color:var(--ds-text)]">Scan gestartet</h3>
              <p className="text-xs text-[color:var(--ds-text-muted)]">Job-ID: <span className="font-mono">{result.job_id}</span></p>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3 mt-3">
            <div className="rounded-lg bg-[color:var(--ds-surface)] border border-[color:var(--ds-border)] p-3 text-center">
              <Clock size={16} className="mx-auto text-emerald-600 mb-1" />
              <div className="text-lg font-bold text-[color:var(--ds-text)]">{result.look_ahead_days}</div>
              <div className="text-xs text-[color:var(--ds-text-muted)]">Tage Vorschau</div>
            </div>
            <div className="rounded-lg bg-[color:var(--ds-surface)] border border-[color:var(--ds-border)] p-3 text-center">
              <Radar size={16} className="mx-auto text-emerald-600 mb-1" />
              <div className="text-lg font-bold text-[color:var(--ds-text)]">{result.evidence_threshold}</div>
              <div className="text-xs text-[color:var(--ds-text-muted)]">Evidenz-Schwelle</div>
            </div>
            <div className="rounded-lg bg-[color:var(--ds-surface)] border border-[color:var(--ds-border)] p-3 text-center">
              <Settings2 size={16} className="mx-auto text-emerald-600 mb-1" />
              <div className="text-lg font-bold text-[color:var(--ds-text)]">{result.max_cases}</div>
              <div className="text-xs text-[color:var(--ds-text-muted)]">Max. Akten</div>
            </div>
          </div>

          <div className="flex items-center gap-2 pt-2">
            <Badge variant="default" className="text-xs bg-emerald-500/10 border-emerald-500/20 text-emerald-600">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse mr-1.5" />
              {result.status}
            </Badge>
            <span className="text-xs text-[color:var(--ds-text-muted)]">
              Der Agent schreibt Ergebnisse in die jeweiligen Akten-Seiten. Prüfen Sie die Akten-Übersicht in einigen Minuten.
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
