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
        <div className="relative flex-1 min-w-[200px]">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#8a8aa8]" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Audit-Log durchsuchen…"
            className="w-full bg-[#0a0a18] border border-[#1e1e3a] rounded-lg pl-9 pr-3 py-2 text-sm text-[#e8e8f0] placeholder:text-[#8a8aa8] focus:outline-none focus:border-[color:var(--brand-primary)]"
          />
        </div>
        <select
          value={filterAction}
          onChange={(e) => setFilterAction(e.target.value)}
          className="bg-[#0a0a18] border border-[#1e1e3a] rounded-lg px-3 py-2 text-sm text-[#e8e8f0] focus:outline-none focus:border-[color:var(--brand-primary)]"
        >
          <option value="">Alle Aktionen</option>
          {uniqueActions.map((a) => (
            <option key={a} value={a}>{auditLabel(a)}</option>
          ))}
        </select>
        <div className="flex items-center gap-2">
          <Calendar size={14} className="text-[#8a8aa8]" />
          <input
            type="date"
            value={filterFrom}
            onChange={(e) => setFilterFrom(e.target.value)}
            className="bg-[#0a0a18] border border-[#1e1e3a] rounded-lg px-3 py-2 text-sm text-[#e8e8f0] focus:outline-none focus:border-[color:var(--brand-primary)]"
          />
          <span className="text-[#8a8aa8] text-sm">bis</span>
          <input
            type="date"
            value={filterTo}
            onChange={(e) => setFilterTo(e.target.value)}
            className="bg-[#0a0a18] border border-[#1e1e3a] rounded-lg px-3 py-2 text-sm text-[#e8e8f0] focus:outline-none focus:border-[color:var(--brand-primary)]"
          />
        </div>
        <button
          onClick={loadEntries}
          className="px-3 py-2 rounded-lg brand-bg brand-bg text-white text-sm transition-colors"
        >
          Laden
        </button>
        <button
          onClick={exportCsv}
          disabled={filtered.length === 0}
          className="flex items-center gap-1.5 px-3 py-2 rounded-lg border border-[#1e1e3a] bg-[#0d0d1a] text-sm text-[#8888aa] hover:text-[#e8e8f0] hover:border-[#3a3a6a] transition-all disabled:opacity-50"
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
        <div className="text-center py-16 space-y-3">
          <Shield size={40} className="mx-auto text-[#1e1e3a]" />
          <p className="text-[#8888aa] text-sm">Keine Audit-Einträge gefunden.</p>
          <p className="text-[#8a8aa8] text-xs">
            Audit-Logs werden erstellt, sobald Benutzer Aktionen im Dashboard ausführen.
          </p>
        </div>
      ) : (
        <div className="rounded-xl border border-[#1e1e3a] bg-[#0d0d1a] overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-[#7878a0] uppercase tracking-wider border-b border-[#1e1e3a]">
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
                    <tr key={e.id} className="border-b border-[#1e1e3a]/50 last:border-0 hover:bg-[#12122a]/50">
                      <td className="px-4 py-3 text-xs text-[#8a8aa8] whitespace-nowrap">
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
                          <div className={cn("w-6 h-6 rounded flex items-center justify-center", `bg-${color}-500/10`)}>
                            <Icon size={12} className={cn(`text-${color}-400`)} />
                          </div>
                          <Badge variant="default" className={cn("text-[10px] border", `bg-${color}-500/5 border-${color}-500/20 text-${color}-400`)}>
                            {auditLabel(e.action)}
                          </Badge>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-[#8888aa] text-xs">{e.entityType}</td>
                      <td className="px-4 py-3 text-[#8888aa] text-xs font-mono">{e.entityId || "—"}</td>
                      <td className="px-4 py-3 text-[#8a8aa8] text-xs max-w-xs truncate">
                        {e.details ? JSON.stringify(e.details).slice(0, 80) : "—"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div className="px-4 py-3 border-t border-[#1e1e3a] text-xs text-[#7878a0]">
            {filtered.length} von {entries.length} Einträgen
          </div>
        </div>
      )}
    </div>
  );
}
