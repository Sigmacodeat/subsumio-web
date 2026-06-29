"use client";

import { useState, useMemo } from "react";
import { useLang } from "@/lib/use-lang";
import { PageHeader } from "@/components/dashboard/page-header";
import { Button } from "@/components/ui/button";
import { ClipboardCheck, Plus, Search, CheckCircle, Clock } from "lucide-react";
import type { TaxAudit, TaxAuditPhase } from "@/lib/tax-types";

const PHASE_LABELS: Record<TaxAuditPhase, string> = {
  vorbereitung: "Vorbereitung",
  pruefung: "Prüfung",
  abschluss: "Abschluss",
  rechtsbehelf: "Rechtsbehelf",
  abgeschlossen: "Abgeschlossen",
};

const PHASE_COLORS: Record<TaxAuditPhase, string> = {
  vorbereitung: "bg-blue-500/10 text-blue-400 border-blue-500/20",
  pruefung: "bg-amber-500/10 text-amber-400 border-amber-500/20",
  abschluss: "bg-violet-500/10 text-violet-400 border-violet-500/20",
  rechtsbehelf: "bg-orange-500/10 text-orange-400 border-orange-500/20",
  abgeschlossen: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
};

export default function TaxAuditPage() {
  const { t } = useLang();
  const [search, setSearch] = useState("");
  const [audits] = useState<TaxAudit[]>([]);

  const filtered = useMemo(() => {
    return audits.filter((a) => {
      if (search) {
        const q = search.toLowerCase();
        if (!a.clientName.toLowerCase().includes(q)) return false;
      }
      return true;
    });
  }, [audits, search]);

  return (
    <div className="flex flex-col gap-6 p-6">
      <PageHeader
        title={t("nav.tax_audit")}
        description="Betriebs- und Aussenpruefungen verwalten"
        actions={
          <Button>
            <Plus size={16} className="mr-2" />
            Neue Pruefung
          </Button>
        }
      />

      <div className="flex flex-wrap items-center gap-3">
        <div className="relative min-w-[200px] flex-1">
          <Search
            size={14}
            className="absolute top-1/2 left-3 -translate-y-1/2 text-[color:var(--ds-text-subtle)]"
          />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Mandant suchen..."
            className="w-full rounded-lg border border-[color:var(--ds-border)] bg-[color:var(--ds-surface-2)] py-2 pr-3 pl-9 text-sm text-[color:var(--ds-text)] focus:border-[color:var(--brand-primary)] focus:outline-none"
          />
        </div>
      </div>

      {filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <ClipboardCheck size={48} className="text-[color:var(--ds-text-subtle)] opacity-50" />
          <p className="mt-4 text-sm text-[color:var(--ds-text-subtle)]">
            Keine Betriebspruefungen vorhanden.
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {filtered.map((a) => (
            <div
              key={a.id}
              className="rounded-xl border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] p-5"
            >
              <div className="flex items-start justify-between">
                <div>
                  <h3 className="font-semibold text-[color:var(--ds-text)]">{a.clientName}</h3>
                  <p className="mt-1 text-sm text-[color:var(--ds-text-muted)]">
                    {a.type} — Jahr {a.year}
                  </p>
                </div>
                <span
                  className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium ${PHASE_COLORS[a.phase]}`}
                >
                  {PHASE_LABELS[a.phase]}
                </span>
              </div>
              {a.findings && a.findings.length > 0 && (
                <div className="mt-4 space-y-2">
                  <p className="text-xs font-medium tracking-wider text-[color:var(--ds-text-subtle)] uppercase">
                    Pruefungsfeststellungen
                  </p>
                  {a.findings.map((f, i) => (
                    <div key={i} className="flex items-start gap-2 text-sm">
                      <span className={f.accepted ? "text-emerald-400" : "text-amber-400"}>
                        {f.accepted ? <CheckCircle size={14} /> : <Clock size={14} />}
                      </span>
                      <span className="text-[color:var(--ds-text-muted)]">{f.issue}</span>
                      {f.amount != null && (
                        <span className="ml-auto text-xs text-[color:var(--ds-text-subtle)]">
                          {f.amount.toLocaleString("de-DE")} €
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              )}
              {a.totalAdditionalTax != null && (
                <div className="mt-4 border-t border-[color:var(--ds-border)] pt-3">
                  <span className="text-sm text-[color:var(--ds-text-subtle)]">
                    Nachzahlung gesamt:{" "}
                  </span>
                  <span className="font-semibold text-[color:var(--ds-text)]">
                    {a.totalAdditionalTax.toLocaleString("de-DE")} €
                  </span>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
