"use client";

import { useState, useEffect } from "react";
import { Play, CheckCircle2, AlertTriangle, Database, Globe, RefreshCw, Info } from "lucide-react";
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
      setSources((prev) =>
        prev.map((s, idx) =>
          idx === i ? { ...s, status: "running" as const, error: undefined } : s
        )
      );
      try {
        const result = await api.legal.judgementsSync({ jurisdiction: source.jurisdiction });
        setSources((prev) =>
          prev.map((s, idx) =>
            idx === i ? { ...s, status: "done" as const, count: result.imported } : s
          )
        );
      } catch (e) {
        setSources((prev) =>
          prev.map((s, idx) =>
            idx === i
              ? {
                  ...s,
                  status: "error" as const,
                  error: e instanceof Error ? e.message : "Sync fehlgeschlagen",
                }
              : s
          )
        );
      }
    }
    setOverallStatus("done");
    loadExisting();
  }

  return (
    <div className="mx-auto max-w-4xl space-y-6 p-6 md:p-8">
      <PageHeader
        title="Rechtsprechungs-Sync"
        description="OGH, BGH, EuGH Urteile ins Brain laden"
        breadcrumbs={[
          { label: "Übersicht", href: "/dashboard" },
          { label: "Rechtsprechungs-Sync" },
        ]}
        actions={
          <Button
            variant="primary"
            className="brand-bg brand-bg gap-2 text-sm text-white"
            onClick={startSync}
            disabled={overallStatus === "running"}
          >
            {overallStatus === "running" ? (
              <RefreshCw size={14} className="animate-spin" />
            ) : (
              <Play size={14} />
            )}
            {overallStatus === "running" ? "Synchronisiere…" : "Jetzt synchronisieren"}
          </Button>
        }
      />

      {/* Stats */}
      <div className="grid grid-cols-3 gap-3">
        <div className="rounded-xl border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] p-3 text-center">
          <div className="text-xs text-[color:var(--ds-text-muted)]">Im Brain</div>
          <div className="brand-text text-xl font-bold">
            {existingCount.toLocaleString("de-DE")}
          </div>
        </div>
        <div className="rounded-xl border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] p-3 text-center">
          <div className="text-xs text-[color:var(--ds-text-muted)]">Quellen</div>
          <div className="text-xl font-bold text-[color:var(--ds-text)]">{sources.length}</div>
        </div>
        <div className="rounded-xl border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] p-3 text-center">
          <div className="text-xs text-[color:var(--ds-text-muted)]">Gerichte</div>
          <div className="text-xl font-bold text-[color:var(--ds-text)]">
            {sources.reduce((s, src) => s + src.courts.length, 0)}
          </div>
        </div>
      </div>

      {/* CLI Reference */}
      <div className="space-y-3 rounded-xl border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] p-4">
        <h2 className="text-sm font-semibold text-[color:var(--ds-text)]">CLI-Befehle</h2>
        <div className="space-y-2">
          {[
            "subsumio connector add legal-judgements --jurisdiction at --query 'Haftung'",
            "subsumio connector add legal-judgements --jurisdiction de --query 'Haftung'",
            "subsumio connector sync legal-judgements",
            "subsumio search 'Haftung' --type court_decision",
          ].map((cmd) => (
            <div
              key={cmd}
              className="flex items-center gap-2 rounded-lg border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] px-3 py-2"
            >
              <code className="brand-text flex-1 font-mono text-xs">{cmd}</code>
              <button
                onClick={() => navigator.clipboard.writeText(cmd)}
                aria-label={`Befehl kopieren: ${cmd}`}
                className="text-xs text-[color:var(--ds-text-muted)] transition-colors hover:text-[color:var(--ds-text)]"
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
            className="flex items-start gap-4 rounded-xl border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] px-4 py-4"
          >
            <div
              className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ${
                src.status === "done"
                  ? "bg-emerald-500/10"
                  : src.status === "running"
                    ? "brand-soft"
                    : src.status === "error"
                      ? "bg-red-500/10"
                      : "bg-[color:var(--ds-hover)]"
              }`}
            >
              {src.status === "done" ? (
                <CheckCircle2 size={18} className="text-emerald-600" />
              ) : src.status === "running" ? (
                <RefreshCw size={18} className="brand-text animate-spin" />
              ) : src.status === "error" ? (
                <AlertTriangle size={18} className="text-red-600" />
              ) : (
                <Database size={18} className="text-[color:var(--ds-text-muted)]" />
              )}
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium text-[color:var(--ds-text)]">{src.name}</span>
                {src.status === "done" && (
                  <Badge
                    variant="default"
                    className="border-emerald-500/20 bg-emerald-500/10 text-xs text-emerald-600"
                  >
                    {src.count > 0 ? `+${src.count} Urteile importiert` : "Keine neuen Urteile"}
                  </Badge>
                )}
                {src.status === "running" && (
                  <Badge variant="default" className="brand-soft brand-text brand-border text-xs">
                    Lädt…
                  </Badge>
                )}
                {src.status === "error" && (
                  <Badge
                    variant="default"
                    className="border-red-500/20 bg-red-500/10 text-xs text-red-600"
                  >
                    Fehler: {src.error}
                  </Badge>
                )}
              </div>
              <p className="mt-1 text-xs text-[color:var(--ds-text-muted)]">{src.description}</p>
              <div className="mt-2 flex flex-wrap gap-1">
                {src.courts.map((court) => (
                  <span
                    key={court}
                    className="rounded border border-[color:var(--ds-border)] bg-[color:var(--ds-hover)] px-2 py-0.5 text-xs text-[color:var(--ds-text-muted)]"
                  >
                    {court}
                  </span>
                ))}
              </div>
            </div>
            <a
              href={src.url}
              target="_blank"
              rel="noopener noreferrer"
              className="hover:brand-text shrink-0 text-[color:var(--ds-text-muted)] transition-colors"
            >
              <Globe size={14} />
            </a>
          </div>
        ))}
      </div>

      {/* Info */}
      <div className="flex items-start gap-3 rounded-xl border border-amber-500/20 bg-amber-500/5 px-4 py-3">
        <Info size={16} className="mt-0.5 shrink-0 text-amber-600" />
        <div className="text-sm text-amber-600">
          <p className="mb-1 font-medium">Hinweis zur Datenaktualität</p>
          <p className="text-xs leading-relaxed">
            Öffentliche Rechtsprechungsdatenbanken aktualisieren sich täglich. Der Konnektor führt
            ein Delta-Sync durch — bereits vorhandene Urteile werden nicht dupliziert. Für
            produktive Nutzung empfehlen wir einen täglichen Cron-Job:{" "}
            <code className="font-mono text-amber-700">
              subsumio connector sync legal-judgements
            </code>
          </p>
        </div>
      </div>
    </div>
  );
}
