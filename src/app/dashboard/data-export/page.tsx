"use client";

import { useState, useRef } from "react";
import { Download, FileJson, Shield, Loader2, Database, Upload, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/api";
import { useMe } from "@/lib/queries/auth";
import { useDataExportBackup } from "@/lib/queries/settings";
import { PageHeader } from "@/components/dashboard/page-header";
import { useLang } from "@/lib/use-lang";

export default function DataExportPage() {
  const { t } = useLang();
  const [loading, setLoading] = useState(false);
  const [backupLoading, setBackupLoading] = useState(false);
  const [restoreLoading, setRestoreLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [backupError, setBackupError] = useState<string | null>(null);
  const [restoreNotice, setRestoreNotice] = useState<string | null>(null);
  const [stats, setStats] = useState<{ total: number; byType: Record<string, number> } | null>(
    null
  );
  const fileInputRef = useRef<HTMLInputElement>(null);

  const meQuery = useMe();
  const isAdmin = meQuery.data?.user?.role === "admin";
  const backupQuery = useDataExportBackup();

  async function exportData() {
    setLoading(true);
    setError(null);
    try {
      const data = (await api.dataExport.gdpr()) as {
        statistics?: { total_pages?: number; by_type?: Record<string, number> };
      };

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
      setError(e instanceof Error ? e.message : t("dataexport.error_export"));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="mx-auto max-w-[1000px] space-y-6 p-4 md:p-6 lg:p-8">
      <PageHeader
        title={t("dataexport.title")}
        description={t("dataexport.description")}
        breadcrumbs={[
          { label: "Dashboard", href: "/dashboard" },
          { label: t("dataexport.breadcrumb") },
        ]}
      />

      <div className="space-y-4 rounded-xl border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] p-4">
        <div className="flex items-start gap-3">
          <Shield size={18} className="mt-0.5 shrink-0 text-emerald-600" />
          <div>
            <p className="text-sm font-medium text-[color:var(--ds-text)]">
              Ihre Daten gehören Ihnen
            </p>
            <p className="mt-1 text-xs text-[color:var(--ds-text-muted)]">
              Nach Art. 20 der DSGVO haben Sie das Recht, Ihre personenbezogenen Daten in einem
              strukturierten, gängigen und maschinenlesbaren Format zu erhalten. Der Export umfasst
              alle Ihre Akten, Kontakte, Rechnungen, Fristen, Zeiten, Auslagen und Dokumente aus
              Ihrem Brain.
            </p>
          </div>
        </div>

        <Button
          variant="primary"
          className="gap-2 bg-emerald-600 text-sm text-white hover:bg-emerald-500"
          onClick={exportData}
          disabled={loading}
        >
          {loading ? <Loader2 size={14} className="animate-spin" /> : <Download size={14} />}
          {loading ? t("dataexport.btn_exporting") : t("dataexport.btn_json")}
        </Button>
      </div>

      {error && (
        <div className="rounded-xl border border-red-500/20 bg-red-500/5 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {stats && (
        <div className="space-y-3 rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-4">
          <div className="flex items-center gap-2">
            <FileJson size={16} className="text-emerald-600" />
            <span className="text-sm font-medium text-emerald-600">Export erfolgreich</span>
          </div>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <div className="rounded-lg border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] p-3 text-center">
              <div className="text-xl font-bold text-[color:var(--ds-text)]">{stats.total}</div>
              <div className="text-xs text-[color:var(--ds-text-muted)]">Gesamt</div>
            </div>
            {Object.entries(stats.byType).map(([type, count]) => (
              <div
                key={type}
                className="rounded-lg border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] p-3 text-center"
              >
                <div className="text-xl font-bold text-[color:var(--ds-text)]">{count}</div>
                <div className="text-xs text-[color:var(--ds-text-muted)]">{type}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Admin-Only: Full Backup */}
      {isAdmin && (
        <div className="brand-border brand-soft/5 space-y-4 rounded-xl border p-4">
          <div className="flex items-start gap-3">
            <Database size={18} className="brand-text mt-0.5 shrink-0" />
            <div>
              <p className="text-sm font-medium text-[color:var(--ds-text)]">Voll-Backup (Admin)</p>
              <p className="mt-1 text-xs text-[color:var(--ds-text-muted)]">
                Exportiert ALLE Brain-Pages als vollständiges JSON-Backup. Nützlich für Migrationen,
                Compliance-Archivierung und Disaster Recovery.
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
                const data =
                  backupQuery.data ??
                  (await fetch("/api/data-export/backup", {
                    signal: AbortSignal.timeout(30_000),
                  }).then((r) => r.json()));
                const blob = new Blob([JSON.stringify(data, null, 2)], {
                  type: "application/json",
                });
                const url = URL.createObjectURL(blob);
                const a = document.createElement("a");
                a.href = url;
                a.download = `subsumio-backup-${new Date().toISOString().split("T")[0]}.json`;
                document.body.appendChild(a);
                a.click();
                a.remove();
                URL.revokeObjectURL(url);
              } catch (e) {
                setBackupError(e instanceof Error ? e.message : t("dataexport.error_backup"));
              } finally {
                setBackupLoading(false);
              }
            }}
            disabled={backupLoading}
          >
            {backupLoading ? (
              <Loader2 size={14} className="animate-spin" />
            ) : (
              <Download size={14} />
            )}
            {backupLoading ? t("dataexport.btn_backing_up") : t("dataexport.btn_backup")}
          </Button>
          {backupError && (
            <div className="rounded-xl border border-red-500/20 bg-red-500/5 px-4 py-3 text-sm text-red-700">
              {backupError}
            </div>
          )}

          {/* Restore */}
          <div className="border-t border-[color:var(--ds-border)] pt-4">
            <div className="flex items-start gap-3">
              <Upload size={18} className="brand-text mt-0.5 shrink-0" />
              <div className="flex-1">
                <p className="text-sm font-medium text-[color:var(--ds-text)]">
                  Backup einspielen (Restore)
                </p>
                <p className="mt-1 text-xs text-[color:var(--ds-text-muted)]">
                  Stellt ein zuvor erstelltes Voll-Backup wieder her. Vorhandene Pages mit gleichem
                  Slug werden überschrieben.
                </p>
              </div>
            </div>
            <input
              ref={fileInputRef}
              type="file"
              accept="application/json,.json"
              className="hidden"
              onChange={async (e) => {
                const file = e.target.files?.[0];
                if (!file) return;
                setRestoreLoading(true);
                setRestoreNotice(null);
                setBackupError(null);
                try {
                  const text = await file.text();
                  const data = JSON.parse(text);
                  const pages: Array<{
                    slug: string;
                    title: string;
                    type?: string;
                    content?: string;
                    frontmatter?: Record<string, unknown>;
                  }> = Array.isArray(data) ? data : (data.pages ?? []);
                  let restored = 0;
                  for (const page of pages) {
                    if (!page.slug || !page.title) continue;
                    await api.brain.createPage({
                      slug: page.slug,
                      title: page.title,
                      type: page.type,
                      content: page.content,
                      frontmatter: page.frontmatter,
                    });
                    restored++;
                  }
                  setRestoreNotice(`${restored} Pages wiederhergestellt.`);
                } catch (err) {
                  setBackupError(
                    err instanceof Error ? err.message : t("dataexport.error_restore")
                  );
                } finally {
                  setRestoreLoading(false);
                  if (fileInputRef.current) fileInputRef.current.value = "";
                }
              }}
            />
            <Button
              variant="outline"
              className="brand-border brand-text brand-bg/10 mt-3 gap-2 text-sm"
              onClick={() => fileInputRef.current?.click()}
              disabled={restoreLoading}
            >
              {restoreLoading ? (
                <Loader2 size={14} className="animate-spin" />
              ) : (
                <Upload size={14} />
              )}
              {restoreLoading ? t("dataexport.btn_restoring") : t("dataexport.btn_restore")}
            </Button>
            {restoreNotice && (
              <div className="mt-3 flex items-center gap-2 rounded-xl border border-emerald-500/20 bg-emerald-500/5 px-4 py-3 text-sm text-emerald-700">
                <CheckCircle2 size={14} />
                {restoreNotice}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
