"use client";

import { useQuery } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Database,
  ShieldCheck,
  AlertTriangle,
  RefreshCw,
  HardDrive,
  CheckCircle2,
  XCircle,
  Server,
} from "lucide-react";
import { PageHeader } from "@/components/dashboard/page-header";
import { useLang } from "@/lib/use-lang";

interface BackupTarget {
  type: string;
  name: string;
  tool: string;
  rpo_hours: number;
  rto_hours: number;
  critical: boolean;
  description: string;
}

interface DRStatus {
  configured: boolean;
  last_backup_at: string | null;
  backup_ok: boolean;
  backup_detail: string | null;
  backup_offsite: boolean | null;
  backup_files: string | null;
  last_drill_at: string | null;
  last_drill_passed: boolean | null;
  last_drill_pages: number | null;
  critical_targets: number;
}

interface DRResponse {
  timestamp: string;
  status: DRStatus;
  targets: BackupTarget[];
}

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("de-AT", {
    dateStyle: "short",
    timeStyle: "short",
  });
}

const FILES_LABEL: Record<string, string> = {
  offsite: "offsite",
  local: "nur lokal",
  none: "nicht gesichert",
  not_mounted: "Objektspeicher",
};

export default function DRPage() {
  const { t } = useLang();

  const { data, isLoading, isError, refetch } = useQuery<DRResponse>({
    queryKey: ["dr-status"],
    queryFn: async () => {
      const res = await fetch("/api/admin/dr");
      if (!res.ok) throw new Error("Failed to fetch DR status");
      return res.json();
    },
    refetchInterval: 30_000,
  });

  const status = data?.status;
  const targets = data?.targets ?? [];

  return (
    <div className="mx-0 w-full space-y-6 p-4 md:p-6 lg:p-8">
      <PageHeader
        title={t("admin.dr.title")}
        description={t("admin.dr.desc")}
        breadcrumbs={[{ label: "Betreiber-Konsole", href: "/ops" }, { label: "DR" }]}
      />

      <div className="flex items-center justify-between">
        <p className="text-sm text-[color:var(--ds-text-muted)]">
          Auto-Refresh alle 30s ·{" "}
          {data ? `Aktualisiert: ${new Date(data.timestamp).toLocaleTimeString("de-AT")}` : "Lädt…"}
        </p>
        <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isLoading}>
          <RefreshCw className={`mr-2 h-4 w-4 ${isLoading ? "animate-spin" : ""}`} />
          Aktualisieren
        </Button>
      </div>

      {isError && (
        <div className="rounded-md border border-[color:var(--ds-danger-border)] bg-[color:var(--ds-danger-bg)] p-3 text-sm text-[color:var(--ds-danger-text)]">
          DR-Status nicht abrufbar.
        </div>
      )}

      {status && !status.configured && (
        <div className="rounded-md border border-[color:var(--ds-warning-border)] bg-[color:var(--ds-warning-bg)] p-3 text-sm text-[color:var(--ds-warning-text)]">
          Kein Backup-Status angebunden (BACKUP_STATUS_FILE fehlt) — es ist nicht nachweisbar, dass
          gesichert wird.
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <Card>
          <CardContent className="flex items-center gap-3 p-4">
            {status?.backup_ok ? (
              <CheckCircle2 className="h-8 w-8 text-[color:var(--ds-success-text)]" />
            ) : (
              <AlertTriangle className="h-8 w-8 text-[color:var(--ds-warning-text)]" />
            )}
            <div>
              <p className="text-lg font-bold">{formatDate(status?.last_backup_at ?? null)}</p>
              <p className="text-xs text-[color:var(--ds-text-muted)]">Letzte Sicherung</p>
              {status?.backup_detail && (
                <p className="mt-1 text-xs text-[color:var(--ds-text-muted)]">
                  {status.backup_detail}
                </p>
              )}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-3 p-4">
            {status?.last_drill_passed === false ? (
              <XCircle className="h-8 w-8 text-[color:var(--ds-danger-text)]" />
            ) : status?.last_drill_passed === true ? (
              <CheckCircle2 className="h-8 w-8 text-[color:var(--ds-success-text)]" />
            ) : (
              <ShieldCheck className="h-8 w-8 text-[color:var(--ds-text-muted)]" />
            )}
            <div>
              <p className="text-lg font-bold">
                {status?.last_drill_passed === true
                  ? "bestanden"
                  : status?.last_drill_passed === false
                    ? "FEHLGESCHLAGEN"
                    : "keine Angabe"}
              </p>
              <p className="text-xs text-[color:var(--ds-text-muted)]">
                Restore-Prüfung · {formatDate(status?.last_drill_at ?? null)}
                {status?.last_drill_pages != null ? ` · ${status.last_drill_pages} Seiten` : ""}
              </p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-3 p-4">
            <HardDrive className="h-8 w-8 text-[color:var(--ds-info-text)]" />
            <div>
              <div className="flex flex-wrap gap-2">
                <Badge variant="default">
                  {status?.backup_offsite === true
                    ? "Offsite"
                    : status?.backup_offsite === false
                      ? "nur lokal"
                      : "Offsite unbekannt"}
                </Badge>
                <Badge variant="default">
                  Dateien: {status?.backup_files ? (FILES_LABEL[status.backup_files] ?? "—") : "—"}
                </Badge>
              </div>
              <p className="mt-1 text-xs text-[color:var(--ds-text-muted)]">Abdeckung</p>
            </div>
          </CardContent>
        </Card>
      </div>

      <p className="text-xs text-[color:var(--ds-text-muted)]">
        Sicherung (täglich), Restore-Prüfung (wöchentlich) und Wiederherstellung laufen im
        Backup-Container auf dem Server. Diese Seite zeigt deren Ergebnisse; sie löst nichts aus.
      </p>

      <Card>
        <CardContent className="p-4">
          <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold">
            <Server className="h-4 w-4" />
            Backup-Targets
          </h3>
          <div className="space-y-2">
            {targets.map((target) => (
              <div
                key={target.type}
                className="flex items-center justify-between rounded-md border p-3"
              >
                <div className="flex items-center gap-3">
                  {target.critical ? (
                    <AlertTriangle className="h-4 w-4 text-[color:var(--ds-warning-text)]" />
                  ) : (
                    <Database className="h-4 w-4 text-[color:var(--ds-info-text)]" />
                  )}
                  <div>
                    <p className="text-sm font-medium">{target.name}</p>
                    <p className="text-xs text-[color:var(--ds-text-muted)]">
                      {target.description}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-4 text-xs">
                  <div className="text-center">
                    <p className="text-[color:var(--ds-text-muted)]">RPO</p>
                    <p className="font-mono font-medium">{target.rpo_hours}h</p>
                  </div>
                  <div className="text-center">
                    <p className="text-[color:var(--ds-text-muted)]">RTO</p>
                    <p className="font-mono font-medium">{target.rto_hours}h</p>
                  </div>
                  <Badge variant="default">{target.tool}</Badge>
                  {target.critical && (
                    <Badge className="bg-[color:var(--ds-warning-bg)] text-[color:var(--ds-warning-text)]">
                      Kritisch
                    </Badge>
                  )}
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
