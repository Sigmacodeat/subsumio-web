"use client";

import { useState } from "react";
import { Download, FileJson, Shield, Loader2, Database } from "lucide-react";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/api";
import { useMe } from "@/lib/queries/auth";
import { useDataExportBackup } from "@/lib/queries/settings";
import { PageHeader } from "@/components/dashboard/page-header";

export default function DataExportPage() {
  const [loading, setLoading] = useState(false);
  const [backupLoading, setBackupLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [backupError, setBackupError] = useState<string | null>(null);
  const [stats, setStats] = useState<{ total: number; byType: Record<string, number> } | null>(null);

  const meQuery = useMe();
  const isAdmin = meQuery.data?.user?.role === "admin";
  const backupQuery = useDataExportBackup();

  async function exportData() {
    setLoading(true);
    setError(null);
    try {
      const data = await api.dataExport.gdpr() as { statistics?: { total_pages?: number; by_type?: Record<string, number> } };

      setStats({
        total: data.statistics?.total_pages ?? 0,
        byType: data.statistics?.by_type ?? {},
      });

      // Download as JSON file
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `subsumio-export-${new Date().toISOString().split("T")[0]}.json`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Export fehlgeschlagen");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="p-6 md:p-8 max-w-4xl mx-auto space-y-6">
      <PageHeader
        title="Datenexport"
        description="DSGVO Art. 20 — Recht auf Datenübertragbarkeit"
      />

      <div className="rounded-xl border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] p-4 space-y-4">
        <div className="flex items-start gap-3">
          <Shield size={18} className="text-emerald-600 shrink-0 mt-0.5" />
          <div>
            <p className="text-sm text-[color:var(--ds-text)] font-medium">Ihre Daten gehören Ihnen</p>
            <p className="text-xs text-[color:var(--ds-text-muted)] mt-1">
              Nach Art. 20 der DSGVO haben Sie das Recht, Ihre personenbezogenen Daten in einem
              strukturierten, gängigen und maschinenlesbaren Format zu erhalten.
              Der Export umfasst alle Ihre Akten, Kontakte, Rechnungen, Fristen, Zeiten,
              Auslagen und Dokumente aus Ihrem Brain.
            </p>
          </div>
        </div>

        <Button
          variant="primary"
          className="bg-emerald-600 hover:bg-emerald-500 text-white gap-2 text-sm"
          onClick={exportData}
          disabled={loading}
        >
          {loading ? <Loader2 size={14} className="animate-spin" /> : <Download size={14} />}
          {loading ? "Exportiere…" : "JSON-Export herunterladen"}
        </Button>
      </div>

      {error && (
        <div className="rounded-xl border border-red-500/20 bg-red-500/5 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {stats && (
        <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-4 space-y-3">
          <div className="flex items-center gap-2">
            <FileJson size={16} className="text-emerald-600" />
            <span className="text-sm font-medium text-emerald-600">Export erfolgreich</span>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div className="rounded-lg border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] p-3 text-center">
              <div className="text-xl font-bold text-[color:var(--ds-text)]">{stats.total}</div>
              <div className="text-xs text-[color:var(--ds-text-muted)]">Gesamt</div>
            </div>
            {Object.entries(stats.byType).map(([type, count]) => (
              <div key={type} className="rounded-lg border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] p-3 text-center">
                <div className="text-xl font-bold text-[color:var(--ds-text)]">{count}</div>
                <div className="text-xs text-[color:var(--ds-text-muted)]">{type}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Admin-Only: Full Backup */}
      {isAdmin && (
        <div className="rounded-xl border brand-border brand-soft/5 p-4 space-y-4">
          <div className="flex items-start gap-3">
            <Database size={18} className="brand-text shrink-0 mt-0.5" />
            <div>
              <p className="text-sm text-[color:var(--ds-text)] font-medium">Voll-Backup (Admin)</p>
              <p className="text-xs text-[color:var(--ds-text-muted)] mt-1">
                Exportiert ALLE Brain-Pages als vollständiges JSON-Backup.
                Nützlich für Migrationen, Compliance-Archivierung und Disaster Recovery.
              </p>
            </div>
          </div>
          <Button
            variant="outline"
            className="brand-border brand-text brand-bg/10 gap-2 text-sm"
            onClick={async () => {
              setBackupLoading(true);
              setBackupError(null);
              try {
                const data = backupQuery.data ?? await fetch("/api/data-export/backup").then((r) => r.json());
                const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
                const url = URL.createObjectURL(blob);
                const a = document.createElement("a");
                a.href = url;
                a.download = `subsumio-backup-${new Date().toISOString().split("T")[0]}.json`;
                document.body.appendChild(a);
                a.click();
                a.remove();
                URL.revokeObjectURL(url);
              } catch (e) {
                setBackupError(e instanceof Error ? e.message : "Backup fehlgeschlagen");
              } finally {
                setBackupLoading(false);
              }
            }}
            disabled={backupLoading}
          >
            {backupLoading ? <Loader2 size={14} className="animate-spin" /> : <Download size={14} />}
            {backupLoading ? "Erstelle Backup…" : "Voll-Backup herunterladen"}
          </Button>
          {backupError && (
            <div className="rounded-xl border border-red-500/20 bg-red-500/5 px-4 py-3 text-sm text-red-700">
              {backupError}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
