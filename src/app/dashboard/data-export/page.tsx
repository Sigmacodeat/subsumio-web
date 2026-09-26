"use client";

import { useState, useRef } from "react";
import {
  Download,
  FileJson,
  Shield,
  Loader2,
  Database,
  Upload,
  CheckCircle2,
  AlertTriangle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { api } from "@/lib/api";
import { useMe } from "@/lib/queries/auth";
import { PageHeader } from "@/components/dashboard/page-header";
import { useLang } from "@/lib/use-lang";
import { backupNotice, type BackupMetadata, type BackupNotice } from "@/lib/backup-completeness";

/** Anwaltsverständliche Namen der exportierten Datensatzarten. */
const TYPE_LABELS: Record<string, string> = {
  legal_case: "Akten",
  legal_contact: "Kontakte",
  invoice: "Rechnungen",
  deadline: "Fristen",
  legal_deadline: "Fristen",
  document_draft: "Entwürfe",
  signature_request: "Signaturanfragen",
  agent_action: "Freigaben",
  audit_log: "Protokolleinträge",
  judgement: "Entscheidungen",
};

type RestorePage = {
  slug: string;
  title: string;
  type?: string;
  content?: string;
  frontmatter?: Record<string, unknown>;
};

function downloadJson(data: unknown, filename: string) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

const today = () => new Date().toISOString().split("T")[0];

export default function DataExportPage() {
  const { t } = useLang();
  const confirm = useConfirm();
  const [loading, setLoading] = useState(false);
  const [backupLoading, setBackupLoading] = useState(false);
  const [restoreLoading, setRestoreLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [backupError, setBackupError] = useState<string | null>(null);
  const [restoreNotice, setRestoreNotice] = useState<string | null>(null);
  const [backupResult, setBackupResult] = useState<BackupNotice | null>(null);
  const [stats, setStats] = useState<{ total: number; byType: Record<string, number> } | null>(
    null
  );
  const fileInputRef = useRef<HTMLInputElement>(null);

  const meQuery = useMe();
  const isAdmin = meQuery.data?.user?.role === "admin";

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
      downloadJson(data, `subsumio-export-${today()}.json`);
    } catch {
      setError("Der Export konnte nicht erstellt werden. Bitte versuchen Sie es erneut.");
    } finally {
      setLoading(false);
    }
  }

  async function createBackup() {
    setBackupLoading(true);
    setBackupError(null);
    setBackupResult(null);
    try {
      // The server may take up to its 300 s limit for a large firm.
      const res = await fetch("/api/data-export/backup", {
        signal: AbortSignal.timeout(300_000),
      });
      if (res.status === 413) {
        // Too large for the in-request backup: the server names the full
        // export (background job, with originals) instead.
        const body = (await res.json().catch(() => null)) as { error?: string } | null;
        setBackupError(
          body?.error ??
            "Der Bestand ist zu groß für die Sofort-Sicherung. Bitte den Kanzlei-Export unter Einstellungen → Privatsphäre verwenden."
        );
        return;
      }
      if (!res.ok) throw new Error("backup_failed");
      const data = (await res.json()) as { export_metadata?: BackupMetadata };
      downloadJson(data, `subsumio-sicherung-${today()}.json`);
      setBackupResult(backupNotice(data.export_metadata));
    } catch {
      setBackupError(
        "Die Sicherung konnte nicht erstellt werden. Bitte versuchen Sie es in einigen Minuten erneut."
      );
    } finally {
      setBackupLoading(false);
    }
  }

  async function restoreFromFile(file: File) {
    setRestoreNotice(null);
    setBackupError(null);
    let pages: RestorePage[] = [];
    try {
      const data = JSON.parse(await file.text());
      pages = Array.isArray(data)
        ? data
        : Array.isArray(data?.pages)
          ? data.pages
          : Array.isArray(data?.data)
            ? data.data
            : [];
    } catch {
      setBackupError("Die Datei ist keine gültige Sicherungsdatei von Subsumio.");
      return;
    }
    // Nur Einträge mit Inhalt einspielen — ein leerer Inhalt würde vorhandene Texte löschen.
    const restorable = pages.filter(
      (p) => p?.slug && p?.title && typeof p.content === "string" && p.content.trim().length > 0
    );
    if (restorable.length === 0) {
      setBackupError(
        "Diese Datei enthält keine Dokumenttexte und kann deshalb nicht eingespielt werden. Bestehende Einträge bleiben unverändert."
      );
      return;
    }
    const ok = await confirm({
      title: "Sicherung einspielen",
      message: `${restorable.length} ${restorable.length === 1 ? "Eintrag wird" : "Einträge werden"} eingespielt. Vorhandene Einträge mit derselben Kennung werden dabei überschrieben.`,
      confirmLabel: "Einspielen",
      variant: "danger",
    });
    if (!ok) return;
    setRestoreLoading(true);
    let restored = 0;
    let failed = 0;
    for (const page of restorable) {
      try {
        await api.brain.createPage({
          slug: page.slug,
          title: page.title,
          type: page.type,
          content: page.content,
          frontmatter: page.frontmatter,
        });
        restored++;
      } catch {
        failed++;
      }
    }
    setRestoreLoading(false);
    setRestoreNotice(
      failed > 0
        ? `${restored} Einträge wiederhergestellt, ${failed} konnten nicht eingespielt werden.`
        : `${restored} ${restored === 1 ? "Eintrag" : "Einträge"} wiederhergestellt.`
    );
  }

  return (
    <div className="ds-page ds-page-narrow space-y-6 p-4 md:p-6 lg:p-8">
      <PageHeader
        title={t("dataexport.title")}
        description="Laden Sie die strukturierten Daten Ihrer Kanzlei in einem maschinenlesbaren Format herunter."
        breadcrumbs={[
          { label: t("breadcrumb.dashboard"), href: "/dashboard" },
          { label: t("dataexport.breadcrumb") },
        ]}
      />

      <section className="space-y-4 rounded-xl border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] p-4 md:p-5">
        <div className="flex items-start gap-3">
          <Shield
            size={18}
            aria-hidden
            className="mt-0.5 shrink-0 text-[color:var(--ds-text-muted)]"
          />
          <div>
            <h2 className="text-sm font-medium text-[color:var(--ds-text)]">
              Datenexport nach Art. 20 DSGVO
            </h2>
            <p className="mt-1 text-xs leading-relaxed text-[color:var(--ds-text-muted)]">
              Der Export enthält Akten, Kontakte, Rechnungen, Fristen, Entwürfe, Signaturanfragen,
              Freigaben, Protokolleinträge und gespeicherte Entscheidungen — jeweils mit Titel und
              strukturierten Angaben als JSON-Datei. Dokumenttexte und hochgeladene Dateien sind
              nicht enthalten.
            </p>
          </div>
        </div>

        <Button
          variant="primary"
          className="gap-2 whitespace-nowrap"
          onClick={exportData}
          disabled={loading || !isAdmin}
        >
          {loading ? (
            <Loader2 size={14} className="animate-spin" aria-hidden />
          ) : (
            <Download size={14} aria-hidden />
          )}
          {loading ? "Export wird erstellt …" : "Export herunterladen"}
        </Button>
        {!meQuery.isLoading && !isAdmin && (
          <p className="text-xs text-[color:var(--ds-text-muted)]">
            Der Export enthält Daten der gesamten Kanzlei und kann nur von der Kanzleiverwaltung
            erstellt werden. Ihre eigenen Kontodaten exportieren Sie unter Einstellungen → Konto.
          </p>
        )}

        {error && (
          <div
            role="alert"
            className="rounded-xl border border-[color:var(--ds-danger-border)] bg-[color:var(--ds-danger-bg)] px-4 py-3 text-sm text-[color:var(--ds-danger-text)]"
          >
            {error}
          </div>
        )}

        {stats && (
          <div
            role="status"
            className="space-y-2 rounded-lg border border-[color:var(--ds-border)] bg-[color:var(--ds-surface-2)] p-3"
          >
            <div className="flex items-center gap-2">
              <FileJson size={14} aria-hidden className="text-[color:var(--ds-success-text)]" />
              <span className="text-sm font-medium text-[color:var(--ds-text)]">
                Export heruntergeladen — <span className="tabular-nums">{stats.total}</span>{" "}
                Einträge
              </span>
            </div>
            {Object.keys(stats.byType).length > 0 && (
              <p className="text-xs text-[color:var(--ds-text-muted)] tabular-nums">
                {Object.entries(stats.byType)
                  .map(([type, count]) => `${TYPE_LABELS[type] ?? "Sonstige"}: ${count}`)
                  .join(" · ")}
              </p>
            )}
          </div>
        )}
      </section>

      {/* Nur Kanzleiverwaltung: Sicherung */}
      {isAdmin && (
        <section className="space-y-4 rounded-xl border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] p-4 md:p-5">
          <div className="flex items-start gap-3">
            <Database
              size={18}
              aria-hidden
              className="mt-0.5 shrink-0 text-[color:var(--ds-text-muted)]"
            />
            <div>
              <h2 className="text-sm font-medium text-[color:var(--ds-text)]">
                Verzeichnis-Sicherung
              </h2>
              <p className="mt-1 text-xs leading-relaxed text-[color:var(--ds-text-muted)]">
                Lädt eine Liste aller Einträge Ihres Kanzleiwissens mit Titel, Kennung und
                strukturierten Angaben herunter — etwa für die Archivierung oder einen
                Anbieterwechsel. Dokumenttexte sind darin nicht enthalten.
              </p>
            </div>
          </div>
          <Button
            variant="outline"
            className="gap-2 whitespace-nowrap"
            onClick={createBackup}
            disabled={backupLoading}
          >
            {backupLoading ? (
              <Loader2 size={14} className="animate-spin" aria-hidden />
            ) : (
              <Download size={14} aria-hidden />
            )}
            {backupLoading ? "Sicherung wird erstellt …" : "Sicherung herunterladen"}
          </Button>

          {backupResult?.kind === "complete" && (
            <div
              role="status"
              className="flex items-center gap-2 rounded-xl border border-[color:var(--ds-success-border)] bg-[color:var(--ds-success-bg)] px-4 py-3 text-sm text-[color:var(--ds-success-text)]"
            >
              <CheckCircle2 size={14} aria-hidden />
              {backupResult.message}
            </div>
          )}
          {backupResult?.kind === "incomplete" && (
            <div
              role="alert"
              className="space-y-2 rounded-xl border border-[color:var(--ds-warning-border)] bg-[color:var(--ds-warning-bg)] px-4 py-3 text-sm text-[color:var(--ds-warning-text)]"
            >
              <div className="flex items-start gap-2 font-medium">
                <AlertTriangle size={14} aria-hidden className="mt-0.5 shrink-0" />
                {backupResult.message}
              </div>
              <ul className="list-disc space-y-1 pl-6 text-xs">
                {backupResult.reasons.map((reason) => (
                  <li key={reason}>{reason}</li>
                ))}
              </ul>
            </div>
          )}

          {/* Einspielen */}
          <div className="border-t border-[color:var(--ds-border)] pt-4">
            <div className="flex items-start gap-3">
              <Upload
                size={18}
                aria-hidden
                className="mt-0.5 shrink-0 text-[color:var(--ds-text-muted)]"
              />
              <div className="flex-1">
                <h3 className="text-sm font-medium text-[color:var(--ds-text)]">
                  Sicherung einspielen
                </h3>
                <p className="mt-1 text-xs leading-relaxed text-[color:var(--ds-text-muted)]">
                  Spielt Einträge aus einer Sicherungsdatei wieder ein. Nur Einträge mit
                  Dokumenttext werden übernommen; vorhandene Einträge mit derselben Kennung werden
                  überschrieben. Vor dem Einspielen fragen wir nach.
                </p>
              </div>
            </div>
            <input
              ref={fileInputRef}
              type="file"
              accept="application/json,.json"
              className="hidden"
              aria-label="Sicherungsdatei auswählen"
              onChange={async (e) => {
                const file = e.target.files?.[0];
                if (fileInputRef.current) fileInputRef.current.value = "";
                if (file) await restoreFromFile(file);
              }}
            />
            <Button
              variant="outline"
              className="mt-3 gap-2 whitespace-nowrap"
              onClick={() => fileInputRef.current?.click()}
              disabled={restoreLoading}
            >
              {restoreLoading ? (
                <Loader2 size={14} className="animate-spin" aria-hidden />
              ) : (
                <Upload size={14} aria-hidden />
              )}
              {restoreLoading ? "Wird eingespielt …" : "Sicherungsdatei auswählen"}
            </Button>
            {restoreNotice && (
              <div
                role="status"
                className="mt-3 flex items-center gap-2 rounded-xl border border-[color:var(--ds-success-border)] bg-[color:var(--ds-success-bg)] px-4 py-3 text-sm text-[color:var(--ds-success-text)]"
              >
                <CheckCircle2 size={14} aria-hidden />
                {restoreNotice}
              </div>
            )}
          </div>

          {backupError && (
            <div
              role="alert"
              className="rounded-xl border border-[color:var(--ds-danger-border)] bg-[color:var(--ds-danger-bg)] px-4 py-3 text-sm text-[color:var(--ds-danger-text)]"
            >
              {backupError}
            </div>
          )}
        </section>
      )}
    </div>
  );
}
