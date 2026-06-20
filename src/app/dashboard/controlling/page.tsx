"use client";

import { useEffect, useState } from "react";
import { Users, Clock, Euro, TrendingUp, Loader2, BarChart3 } from "lucide-react";
import { api } from "@/lib/api";
import { caseFrontmatter, type TimeEntry } from "@/lib/legal-types";
import { PageHeader } from "@/components/dashboard/page-header";

interface LawyerStats {
  name: string;
  totalHours: number;
  totalRevenue: number;
  caseCount: number;
  billedHours: number;
  targetHours: number;
}

export default function ControllingPage() {
  const [stats, setStats] = useState<LawyerStats[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [period, setPeriod] = useState<"month" | "quarter" | "year">("month");

  useEffect(() => {
    async function load() {
      try {
        const pages = await api.brain.listPages({ type: "legal_case", limit: 500 });
        const lawyerMap = new Map<string, LawyerStats>();

        pages.forEach((p) => {
          const fm = caseFrontmatter(p);
          const lawyer = fm.own_lawyer_name || "Unbekannt";
          if (!lawyerMap.has(lawyer)) {
            lawyerMap.set(lawyer, {
              name: lawyer,
              totalHours: 0,
              totalRevenue: 0,
              caseCount: 0,
              billedHours: 0,
              targetHours: 150, // Standard-Ziel pro Monat
            });
          }
          const s = lawyerMap.get(lawyer)!;
          s.caseCount += 1;

          const entries = (fm.time_entries || []) as TimeEntry[];
          entries.forEach((entry) => {
            if (!entry.date) return;
            const d = new Date(entry.date);
            const now = new Date();
            const match =
              period === "month"
                ? d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear()
                : period === "quarter"
                ? Math.floor(d.getMonth() / 3) === Math.floor(now.getMonth() / 3) && d.getFullYear() === now.getFullYear()
                : d.getFullYear() === now.getFullYear();
            if (!match) return;

            const hours = (entry.minutes || 0) / 60;
            s.totalHours += hours;
            if (entry.billed) s.billedHours += hours;
            s.totalRevenue += hours * (entry.rate || 200);
          });
        });

        setStats(Array.from(lawyerMap.values()));
      } catch (e) {
        setLoadError(e instanceof Error ? e.message : "Daten konnten nicht geladen werden.");
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [period]);

  const totalRevenue = stats.reduce((s, l) => s + l.totalRevenue, 0);
  const totalHours = stats.reduce((s, l) => s + l.totalHours, 0);

  return (
    <div className="p-6 md:p-8 max-w-6xl mx-auto space-y-6">
      <PageHeader
        title="Leistungscontrolling"
        description="Übersicht über Anwälte, Stunden und Umsatz"
        actions={
          <div className="flex gap-2">
            {(["month", "quarter", "year"] as const).map((p) => (
              <button
                key={p}
                onClick={() => setPeriod(p)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                  period === p
                    ? "brand-soft/20 brand-text border brand-border"
                    : "bg-[color:var(--ds-hover)] text-[color:var(--ds-text-muted)] border border-[color:var(--ds-border)] hover:border-[color:var(--ds-border-strong)]"
                }`}
              >
                {p === "month" ? "Monat" : p === "quarter" ? "Quartal" : "Jahr"}
              </button>
            ))}
          </div>
        }
      />

      {loadError && (
        <div className="rounded-xl border border-red-500/20 bg-red-500/5 px-4 py-3 text-sm text-red-700">
          {loadError}
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-20" role="status" aria-label="Lädt">
          <Loader2 size={24} className="brand-text animate-spin" aria-hidden="true" />
        </div>
      ) : stats.length === 0 ? (
        <div className="flex flex-col items-center justify-center text-center py-16 px-6 rounded-xl border border-dashed border-[color:var(--ds-border-strong)] bg-[color:var(--ds-surface)]">
          <div className="w-16 h-16 rounded-2xl bg-[color:var(--ds-surface-2)] flex items-center justify-center mb-5">
            <BarChart3 size={26} className="text-[color:var(--ds-text-subtle)]" />
          </div>
          <h3 className="text-sm font-semibold text-[color:var(--ds-text)] tracking-tight">Keine Daten verfügbar</h3>
          <p className="mt-2 text-xs text-[color:var(--ds-text-muted)] max-w-sm leading-relaxed">
            Es wurden noch keine Akten mit Zeiterfassung angelegt. Lege Akten an und erfasse Zeiten, um hier Auswertungen zu sehen.
          </p>
        </div>
      ) : (
        <>
          {/* KPI Cards */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div className="rounded-xl border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] p-4">
              <div className="flex items-center gap-2 text-[color:var(--ds-text-muted)] mb-2">
                <Users size={14} />
                <span className="text-xs">Anwälte</span>
              </div>
              <div className="text-2xl font-semibold text-[color:var(--ds-text)]">{stats.length}</div>
            </div>
            <div className="rounded-xl border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] p-4">
              <div className="flex items-center gap-2 text-[color:var(--ds-text-muted)] mb-2">
                <Clock size={14} />
                <span className="text-xs">Gesamtstunden</span>
              </div>
              <div className="text-2xl font-semibold text-[color:var(--ds-text)]">{totalHours.toFixed(1)} h</div>
            </div>
            <div className="rounded-xl border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] p-4">
              <div className="flex items-center gap-2 text-[color:var(--ds-text-muted)] mb-2">
                <Euro size={14} />
                <span className="text-xs">Gesamtumsatz</span>
              </div>
              <div className="text-2xl font-semibold text-emerald-600">{totalRevenue.toLocaleString("de-DE", { style: "currency", currency: "EUR" })}</div>
            </div>
            <div className="rounded-xl border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] p-4">
              <div className="flex items-center gap-2 text-[color:var(--ds-text-muted)] mb-2">
                <TrendingUp size={14} />
                <span className="text-xs">Ø Stundensatz</span>
              </div>
              <div className="text-2xl font-semibold text-[color:var(--ds-text)]">
                {totalHours > 0 ? Math.round(totalRevenue / totalHours) : 0} €
              </div>
            </div>
          </div>

          {/* Lawyer Table */}
          <div className="rounded-xl border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[color:var(--ds-border)] text-[color:var(--ds-text-muted)]">
                  <th className="text-left px-4 py-3 font-medium">Anwalt</th>
                  <th className="text-right px-4 py-3 font-medium">Akten</th>
                  <th className="text-right px-4 py-3 font-medium">Stunden</th>
                  <th className="text-right px-4 py-3 font-medium">Abrechenbar</th>
                  <th className="text-right px-4 py-3 font-medium">Auslastung</th>
                  <th className="text-right px-4 py-3 font-medium">Umsatz</th>
                </tr>
              </thead>
              <tbody>
                {stats.map((s) => {
                  const utilization = Math.min(100, Math.round((s.totalHours / s.targetHours) * 100));
                  return (
                    <tr key={s.name} className="border-b border-[color:var(--ds-border)]/50 hover:bg-[color:var(--ds-surface)] transition-colors">
                      <td className="px-4 py-3 text-[color:var(--ds-text)]">{s.name}</td>
                      <td className="px-4 py-3 text-right text-[color:var(--ds-text-muted)]">{s.caseCount}</td>
                      <td className="px-4 py-3 text-right text-[color:var(--ds-text)]">{s.totalHours.toFixed(1)} h</td>
                      <td className="px-4 py-3 text-right text-[color:var(--ds-text)]">{s.billedHours.toFixed(1)} h</td>
                      <td className="px-4 py-3 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <div className="w-20 h-1.5 rounded-full bg-[color:var(--ds-border)] overflow-hidden">
                            <div
                              className={`h-full rounded-full ${
                                utilization >= 80 ? "bg-emerald-400" : utilization >= 50 ? "bg-amber-400" : "bg-red-400"
                              }`}
                              style={{ width: `${utilization}%` }}
                            />
                          </div>
                          <span className="text-xs text-[color:var(--ds-text-muted)]">{utilization}%</span>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-right font-medium text-emerald-600">
                        {s.totalRevenue.toLocaleString("de-DE", { style: "currency", currency: "EUR" })}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
