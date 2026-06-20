"use client";

import { useCallback, useEffect, useState } from "react";
import {
  Shield,
  Search,
  Calendar,
  Clock,
  FileText,
  User,
  AlertTriangle,
  CheckCircle2,
  Loader2,
  Download,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { auditLabel } from "@/lib/audit-labels";

interface AuditEntry {
  id: string;
  action: string;
  entityType: string;
  entityId?: string;
  timestamp: string;
  details?: Record<string, unknown>;
}

const ACTION_COLORS: Record<string, string> = {
  "user.login": "emerald",
  "user.logout": "gray",
  "user.signup": "blue",
  "case.create": "violet",
  "case.update": "amber",
  "case.delete": "red",
  "invoice.create": "emerald",
  "invoice.update": "amber",
  "document.upload": "blue",
  "deadline.create": "orange",
  "evidence.create": "violet",
  "drafting.generate": "cyan",
  "query.submit": "pink",
  "settings.update": "gray",
  "billing.upgrade": "emerald",
};

function actionColor(action: string): string {
  return ACTION_COLORS[action] || "gray";
}

function actionIcon(action: string) {
  if (action.startsWith("user.")) return User;
  if (action.startsWith("case.")) return FileText;
  if (action.startsWith("invoice.")) return CheckCircle2;
  if (action.startsWith("document.")) return FileText;
  if (action.startsWith("deadline.")) return Clock;
  if (action.startsWith("evidence.")) return Shield;
  if (action.startsWith("drafting.")) return FileText;
  if (action.startsWith("query.")) return Search;
  if (action.startsWith("settings.")) return Shield;
  if (action.startsWith("billing.")) return CheckCircle2;
  return AlertTriangle;
}

export default function AuditTrail() {
  const [entries, setEntries] = useState<AuditEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [filterAction, setFilterAction] = useState("");
  const [filterFrom, setFilterFrom] = useState("");
  const [filterTo, setFilterTo] = useState("");

  const loadEntries = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (filterAction) params.set("action", filterAction);
      if (filterFrom) params.set("from", filterFrom);
      if (filterTo) params.set("to", filterTo);
      params.set("limit", "200");
      const res = await fetch(`/api/audit?${params.toString()}`);
      if (res.ok) {
        const data = (await res.json()) as { entries: AuditEntry[] };
        setEntries(data.entries || []);
      }
    } catch {
      setEntries([]);
    } finally {
      setLoading(false);
    }
  }, [filterAction, filterFrom, filterTo]);

  useEffect(() => {
    loadEntries();
  }, [loadEntries]);

  function exportCsv() {
    const lines = [
      "timestamp,action,entityType,entityId,details",
      ...filtered.map((e) => {
        const ts = new Date(e.timestamp).toISOString();
        const action = auditLabel(e.action);
        const details = e.details ? JSON.stringify(e.details).replace(/,/g, ";") : "";
        return `"${ts}","${action}","${e.entityType}","${e.entityId || ""}","${details}"`;
      }),
    ];
    const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `audit-trail-${new Date().toISOString().split("T")[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  const filtered = entries.filter((e) => {
    const s = search.toLowerCase();
    if (!s) return true;
    return (
      e.action.toLowerCase().includes(s) ||
      auditLabel(e.action).toLowerCase().includes(s) ||
      e.entityType.toLowerCase().includes(s) ||
      (e.entityId || "").toLowerCase().includes(s)
    );
  });

  const uniqueActions = Array.from(new Set(entries.map((e) => e.action)));

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative min-w-[200px] flex-1">
          <Search
            size={14}
            className="absolute top-1/2 left-3 -translate-y-1/2 text-[color:var(--ds-text-subtle)]"
          />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Audit-Log durchsuchen…"
            className="w-full rounded-lg border border-[color:var(--ds-border)] bg-[color:var(--ds-surface-2)] py-2 pr-3 pl-9 text-sm text-[color:var(--ds-text)] placeholder:text-[color:var(--ds-text-subtle)] focus:border-[color:var(--brand-primary)] focus:outline-none"
          />
        </div>
        <select
          value={filterAction}
          onChange={(e) => setFilterAction(e.target.value)}
          className="rounded-lg border border-[color:var(--ds-border)] bg-[color:var(--ds-surface-2)] px-3 py-2 text-sm text-[color:var(--ds-text)] focus:border-[color:var(--brand-primary)] focus:outline-none"
        >
          <option value="">Alle Aktionen</option>
          {uniqueActions.map((a) => (
            <option key={a} value={a}>
              {auditLabel(a)}
            </option>
          ))}
        </select>
        <div className="flex items-center gap-2">
          <Calendar size={14} className="text-[color:var(--ds-text-subtle)]" />
          <input
            type="date"
            value={filterFrom}
            onChange={(e) => setFilterFrom(e.target.value)}
            className="rounded-lg border border-[color:var(--ds-border)] bg-[color:var(--ds-surface-2)] px-3 py-2 text-sm text-[color:var(--ds-text)] focus:border-[color:var(--brand-primary)] focus:outline-none"
          />
          <span className="text-sm text-[color:var(--ds-text-subtle)]">bis</span>
          <input
            type="date"
            value={filterTo}
            onChange={(e) => setFilterTo(e.target.value)}
            className="rounded-lg border border-[color:var(--ds-border)] bg-[color:var(--ds-surface-2)] px-3 py-2 text-sm text-[color:var(--ds-text)] focus:border-[color:var(--brand-primary)] focus:outline-none"
          />
        </div>
        <button
          onClick={loadEntries}
          className="brand-bg brand-bg rounded-lg px-3 py-2 text-sm text-white transition-colors"
        >
          Laden
        </button>
        <button
          onClick={exportCsv}
          disabled={filtered.length === 0}
          className="flex items-center gap-1.5 rounded-lg border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] px-3 py-2 text-sm text-[color:var(--ds-text-muted)] transition-all hover:border-[color:var(--ds-border-strong)] hover:text-[color:var(--ds-text)] disabled:opacity-50"
        >
          <Download size={14} />
          CSV
        </button>
      </div>

      {/* Table */}
      {loading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 size={24} className="brand-text animate-spin" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="space-y-3 py-16 text-center">
          <Shield size={40} className="mx-auto text-[color:var(--ds-border)]" />
          <p className="text-sm text-[color:var(--ds-text-muted)]">
            Keine Audit-Einträge gefunden.
          </p>
          <p className="text-xs text-[color:var(--ds-text-subtle)]">
            Audit-Logs werden erstellt, sobald Benutzer Aktionen im Dashboard ausführen.
          </p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)]">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[color:var(--ds-border)] text-left text-xs tracking-wider text-[color:var(--ds-text-subtle)] uppercase">
                  <th className="px-4 py-3 font-medium">Zeitpunkt</th>
                  <th className="px-4 py-3 font-medium">Aktion</th>
                  <th className="px-4 py-3 font-medium">Typ</th>
                  <th className="px-4 py-3 font-medium">Entität</th>
                  <th className="px-4 py-3 font-medium">Details</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((e) => {
                  const color = actionColor(e.action);
                  const Icon = actionIcon(e.action);
                  return (
                    <tr
                      key={e.id}
                      className="border-b border-[color:var(--ds-border)]/50 last:border-0 hover:bg-[color:var(--ds-hover)]/50"
                    >
                      <td className="px-4 py-3 text-xs whitespace-nowrap text-[color:var(--ds-text-subtle)]">
                        {new Date(e.timestamp).toLocaleString("de-DE", {
                          day: "2-digit",
                          month: "2-digit",
                          year: "numeric",
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <div
                            className={cn(
                              "flex h-6 w-6 items-center justify-center rounded",
                              `bg-${color}-500/10`
                            )}
                          >
                            <Icon size={12} className={cn(`text-${color}-400`)} />
                          </div>
                          <Badge
                            variant="default"
                            className={cn(
                              "border text-xs",
                              `bg-${color}-500/5 border-${color}-500/20 text-${color}-400`
                            )}
                          >
                            {auditLabel(e.action)}
                          </Badge>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-xs text-[color:var(--ds-text-muted)]">
                        {e.entityType}
                      </td>
                      <td className="px-4 py-3 font-mono text-xs text-[color:var(--ds-text-muted)]">
                        {e.entityId || "—"}
                      </td>
                      <td className="max-w-xs truncate px-4 py-3 text-xs text-[color:var(--ds-text-subtle)]">
                        {e.details ? JSON.stringify(e.details).slice(0, 80) : "—"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div className="border-t border-[color:var(--ds-border)] px-4 py-3 text-xs text-[color:var(--ds-text-subtle)]">
            {filtered.length} von {entries.length} Einträgen
          </div>
        </div>
      )}
    </div>
  );
}
