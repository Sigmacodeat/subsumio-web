"use client";

import { useState, useEffect } from "react";
import {
  Play,
  CheckCircle2,
  AlertTriangle,
  Database,
  Globe,
  RefreshCw,
  Info,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { api } from "@/lib/api";
import { PageHeader } from "@/components/dashboard/page-header";

interface Source {
  id: string;
  jurisdiction: "at" | "de" | "all";
  name: string;
  url: string;
  description: string;
  courts: string[];
  status: "idle" | "running" | "done" | "error";
  count: number;
  error?: string;
}

const SOURCES: Source[] = [
  {
    id: "ris-ogd",
    jurisdiction: "at",
    name: "RIS-OGD (Österreich)",
    url: "https://data.bka.gv.at/ris/api/v2.6",
    description: "OGH, OLG, VwGH — österreichische Judikatur (RIS Open Government Data)",
    courts: ["OGH", "OLG Wien", "OLG Graz", "OLG Innsbruck", "VwGH"],
    status: "idle",
    count: 0,
  },
  {
    id: "openlegaldata",
    jurisdiction: "de",
    name: "OpenLegalData (Deutschland)",
    url: "https://de.openlegaldata.io/api",
    description: "BGH, BVerfG, BVerwG, BFH und Instanzgerichte — deutsche Rechtsprechung",
    courts: ["BGH", "BVerfG", "BVerwG", "BFH", "LG", "OLG"],
    status: "idle",
    count: 0,
  },
];

export default function JudgementsSyncPage() {
  const [sources, setSources] = useState(SOURCES);
  const [overallStatus, setOverallStatus] = useState<"idle" | "running" | "done">("idle");
  const [existingCount, setExistingCount] = useState(0);

  useEffect(() => {
    loadExisting();
  }, []);

  async function loadExisting() {
    try {
      const pages = await api.brain.listPages({ type: "court_decision", limit: 500 });
      setExistingCount(pages.length);
    } catch {
      setExistingCount(0);
    }
  }

  async function startSync() {
    setOverallStatus("running");
    for (let i = 0; i < sources.length; i++) {
      const source = sources[i];
      setSources((prev) => prev.map((s, idx) => idx === i ? { ...s, status: "running" as const, error: undefined } : s));
      try {
        const result = await api.legal.judgementsSync({ jurisdiction: source.jurisdiction });
        setSources((prev) => prev.map((s, idx) => idx === i
          ? { ...s, status: "done" as const, count: result.imported }
          : s));
      } catch (e) {
        setSources((prev) => prev.map((s, idx) => idx === i
          ? { ...s, status: "error" as const, error: e instanceof Error ? e.message : "Sync fehlgeschlagen" }
          : s));
      }
    }
    setOverallStatus("done");
    loadExisting();
  }

  return (
    <div className="p-6 md:p-8 max-w-4xl mx-auto space-y-6">
      <PageHeader
        title="Rechtsprechungs-Sync"
        description="OGH, BGH, EuGH Urteile ins Brain laden"
        actions={
          <Button
            variant="primary"
            className="brand-bg brand-bg text-white gap-2 text-sm"
            onClick={startSync}
            disabled={overallStatus === "running"}
          >
          {overallStatus === "running" ? <RefreshCw size={14} className="animate-spin" /> : <Play size={14} />}
          {overallStatus === "running" ? "Synchronisiere…" : "Jetzt synchronisieren"}
        </Button>
        }
      />

      {/* Stats */}
      <div className="grid grid-cols-3 gap-3">
        <div className="rounded-xl border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] p-3 text-center">
          <div className="text-xs text-[color:var(--ds-text-muted)]">Im Brain</div>
          <div className="text-xl font-bold brand-text">{existingCount.toLocaleString("de-DE")}</div>
        </div>
        <div className="rounded-xl border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] p-3 text-center">
          <div className="text-xs text-[color:var(--ds-text-muted)]">Quellen</div>
          <div className="text-xl font-bold text-[color:var(--ds-text)]">{sources.length}</div>
        </div>
        <div className="rounded-xl border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] p-3 text-center">
          <div className="text-xs text-[color:var(--ds-text-muted)]">Gerichte</div>
          <div className="text-xl font-bold text-[color:var(--ds-text)]">{sources.reduce((s, src) => s + src.courts.length, 0)}</div>
        </div>
      </div>

      {/* CLI Reference */}
      <div className="rounded-xl border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] p-4 space-y-3">
        <h2 className="text-sm font-semibold text-[color:var(--ds-text)]">CLI-Befehle</h2>
        <div className="space-y-2">
          {[
            "gbrain connector add legal-judgements --jurisdiction at --query 'Haftung'",
            "gbrain connector add legal-judgements --jurisdiction de --query 'Haftung'",
            "gbrain connector sync legal-judgements",
            "gbrain search 'Haftung' --type court_decision",
          ].map((cmd) => (
            <div key={cmd} className="flex items-center gap-2 bg-[color:var(--ds-surface)] border border-[color:var(--ds-border)] rounded-lg px-3 py-2">
              <code className="text-xs font-mono brand-text flex-1">{cmd}</code>
              <button
                onClick={() => navigator.clipboard.writeText(cmd)}
                aria-label={`Befehl kopieren: ${cmd}`}
                className="text-[color:var(--ds-text-muted)] hover:text-[color:var(--ds-text)] transition-colors text-xs"
              >
                Kopieren
              </button>
            </div>
          ))}
        </div>
      </div>

      {/* Sources — aria-live so Screenreader den Sync-Fortschritt mitbekommen */}
      <div className="space-y-3" aria-live="polite">
        {sources.map((src) => (
          <div
            key={src.id}
            className="flex items-start gap-4 px-4 py-4 rounded-xl border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)]"
          >
            <div className={`w-10 h-10 rounded-lg flex items-center justify-center shrink-0 ${
              src.status === "done" ? "bg-emerald-500/10" :
              src.status === "running" ? "brand-soft" :
              src.status === "error" ? "bg-red-500/10" :
              "bg-[color:var(--ds-hover)]"
            }`}>
              {src.status === "done" ? <CheckCircle2 size={18} className="text-emerald-600" /> :
               src.status === "running" ? <RefreshCw size={18} className="brand-text animate-spin" /> :
               src.status === "error" ? <AlertTriangle size={18} className="text-red-600" /> :
               <Database size={18} className="text-[color:var(--ds-text-muted)]" />}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium text-[color:var(--ds-text)]">{src.name}</span>
                {src.status === "done" && (
                  <Badge variant="default" className="text-[10px] bg-emerald-500/10 text-emerald-600 border-emerald-500/20">
                    {src.count > 0 ? `+${src.count} Urteile importiert` : "Keine neuen Urteile"}
                  </Badge>
                )}
                {src.status === "running" && (
                  <Badge variant="default" className="text-[10px] brand-soft brand-text brand-border">
                    Lädt…
                  </Badge>
                )}
                {src.status === "error" && (
                  <Badge variant="default" className="text-[10px] bg-red-500/10 text-red-600 border-red-500/20">
                    Fehler: {src.error}
                  </Badge>
                )}
              </div>
              <p className="text-xs text-[color:var(--ds-text-muted)] mt-1">{src.description}</p>
              <div className="flex flex-wrap gap-1 mt-2">
                {src.courts.map((court) => (
                  <span key={court} className="text-[10px] px-2 py-0.5 rounded bg-[color:var(--ds-hover)] text-[color:var(--ds-text-muted)] border border-[color:var(--ds-border)]">
                    {court}
                  </span>
                ))}
              </div>
            </div>
            <a
              href={src.url}
              target="_blank"
              rel="noopener noreferrer"
              className="text-[color:var(--ds-text-muted)] hover:brand-text transition-colors shrink-0"
            >
              <Globe size={14} />
            </a>
          </div>
        ))}
      </div>

      {/* Info */}
      <div className="flex items-start gap-3 px-4 py-3 rounded-xl border border-amber-500/20 bg-amber-500/5">
        <Info size={16} className="text-amber-600 shrink-0 mt-0.5" />
        <div className="text-sm text-amber-600">
          <p className="font-medium mb-1">Hinweis zur Datenaktualität</p>
          <p className="text-xs leading-relaxed">
            Öffentliche Rechtsprechungsdatenbanken aktualisieren sich täglich.
            Der Konnektor führt ein Delta-Sync durch — bereits vorhandene Urteile
            werden nicht dupliziert. Für produktive Nutzung empfehlen wir einen
            täglichen Cron-Job: <code className="font-mono text-amber-700">gbrain connector sync legal-judgements</code>
          </p>
        </div>
      </div>
    </div>
  );
}
