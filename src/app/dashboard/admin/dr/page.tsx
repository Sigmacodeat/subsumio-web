"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Database,
  ShieldCheck,
  AlertTriangle,
  RefreshCw,
  HardDrive,
  Clock,
  CheckCircle2,
  XCircle,
  PlayCircle,
  RotateCcw,
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
  total_manifests: number;
  total_drills: number;
  last_backup_at: string | null;
  last_drill_at: string | null;
  last_drill_passed: boolean | null;
  all_targets_defined: boolean;
  critical_targets: number;
  rpo_max_hours: number;
  rto_max_hours: number;
}

interface BackupManifest {
  id: string;
  created_at: string;
  created_by: string;
  overall_status: string;
  total_size_bytes: number;
  rpo_met: boolean;
  rto_met: boolean;
  entries: Array<{
    target_type: string;
    target_name: string;
    status: string;
    size_bytes?: number;
    checksum?: string;
  }>;
}

interface RestoreDrill {
  id: string;
  started_at: string;
  completed_at: string;
  duration_ms: number;
  targets_tested: number;
  targets_passed: number;
  targets_failed: number;
  rpo_met: boolean;
  rto_met: boolean;
  rto_actual_hours: number;
  overall_passed: boolean;
}

interface DRResponse {
  timestamp: string;
  status: DRStatus;
  targets: BackupTarget[];
  recent_manifests: BackupManifest[];
  recent_drills: RestoreDrill[];
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return `${(bytes / Math.pow(1024, i)).toFixed(1)} ${units[i]}`;
}

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("de-AT", {
    dateStyle: "short",
    timeStyle: "short",
  });
}

export default function DRPage() {
  const { t } = useLang();
  const queryClient = useQueryClient();
  const [actionResult, setActionResult] = useState<string | null>(null);

  const { data, isLoading, refetch } = useQuery<DRResponse>({
    queryKey: ["dr-status"],
    queryFn: async () => {
      const res = await fetch("/api/admin/dr");
      if (!res.ok) throw new Error("Failed to fetch DR status");
      return res.json();
    },
    refetchInterval: 30_000,
  });

  const mutation = useMutation({
    mutationFn: async (action: "create_backup" | "run_drill" | "restore") => {
      const res = await fetch("/api/admin/dr", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, simulate: true }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || data.success === false) {
        throw new Error(data.error ?? data.hint ?? "Action not available in this context");
      }
      return data;
    },
    onSuccess: (_, action) => {
      setActionResult(`${action}: ${_.hint ?? "Erfolgreich"}`);
      queryClient.invalidateQueries({ queryKey: ["dr-status"] });
      setTimeout(() => setActionResult(null), 5000);
    },
    onError: (err: Error) => {
      setActionResult(`Fehler: ${err.message}`);
      setTimeout(() => setActionResult(null), 5000);
    },
  });

  const status = data?.status;
  const targets = data?.targets ?? [];
  const manifests = data?.recent_manifests ?? [];
  const drills = data?.recent_drills ?? [];

  return (
    <div className="container mx-auto max-w-6xl space-y-6 p-6">
      <PageHeader
        title={t("admin.dr.title")}
        description={t("admin.dr.desc")}
        breadcrumbs={[
          { label: t("breadcrumb.dashboard"), href: "/dashboard" },
          { label: "Admin", href: "/dashboard/admin" },
          { label: "DR" },
        ]}
      />

      <div className="flex items-center justify-between">
        <p className="text-muted-foreground text-sm">
          Auto-Refresh alle 30s ·{" "}
          {data ? `Aktualisiert: ${new Date(data.timestamp).toLocaleTimeString("de-AT")}` : "Lädt…"}
        </p>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => mutation.mutate("create_backup")}
            disabled={mutation.isPending}
          >
            <HardDrive className="mr-2 h-4 w-4" />
            Backup erstellen
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => mutation.mutate("run_drill")}
            disabled={mutation.isPending || manifests.length === 0}
          >
            <PlayCircle className="mr-2 h-4 w-4" />
            Restore-Drill
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => mutation.mutate("restore")}
            disabled={mutation.isPending || manifests.length === 0}
          >
            <RotateCcw className="mr-2 h-4 w-4" />
            Restore (Sim)
          </Button>
          <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isLoading}>
            <RefreshCw className={`mr-2 h-4 w-4 ${isLoading ? "animate-spin" : ""}`} />
            Aktualisieren
          </Button>
        </div>
      </div>

      {actionResult && (
        <div className="rounded-md border border-blue-200 bg-blue-50 p-3 text-sm text-blue-700">
          {actionResult}
        </div>
      )}

      {/* Summary Cards */}
      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <Card>
          <CardContent className="flex items-center gap-3 p-4">
            <Database className="h-8 w-8 text-blue-500" />
            <div>
              <p className="text-2xl font-bold">{status?.total_manifests ?? "—"}</p>
              <p className="text-muted-foreground text-xs">Backups</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-3 p-4">
            <PlayCircle className="h-8 w-8 text-purple-500" />
            <div>
              <p className="text-2xl font-bold">{status?.total_drills ?? "—"}</p>
              <p className="text-muted-foreground text-xs">Drills</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-3 p-4">
            {status?.last_drill_passed === false ? (
              <XCircle className="h-8 w-8 text-red-500" />
            ) : status?.last_drill_passed === true ? (
              <CheckCircle2 className="h-8 w-8 text-green-500" />
            ) : (
              <ShieldCheck className="text-muted-foreground h-8 w-8" />
            )}
            <div>
              <p className="text-2xl font-bold">
                {status?.last_drill_passed === true
                  ? "PASS"
                  : status?.last_drill_passed === false
                    ? "FAIL"
                    : "—"}
              </p>
              <p className="text-muted-foreground text-xs">Letzter Drill</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-3 p-4">
            <Server className="h-8 w-8 text-orange-500" />
            <div>
              <p className="text-2xl font-bold">{status?.critical_targets ?? "—"}</p>
              <p className="text-muted-foreground text-xs">Kritische Targets</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Backup Targets */}
      <Card>
        <CardContent className="p-4">
          <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold">
            <Server className="h-4 w-4" />
            Backup-Targets
          </h3>
          <div className="space-y-2">
            {targets.map((t) => (
              <div key={t.type} className="flex items-center justify-between rounded-md border p-3">
                <div className="flex items-center gap-3">
                  {t.critical ? (
                    <AlertTriangle className="h-4 w-4 text-orange-500" />
                  ) : (
                    <Database className="h-4 w-4 text-blue-500" />
                  )}
                  <div>
                    <p className="text-sm font-medium">{t.name}</p>
                    <p className="text-muted-foreground text-xs">{t.description}</p>
                  </div>
                </div>
                <div className="flex items-center gap-4 text-xs">
                  <div className="text-center">
                    <p className="text-muted-foreground">RPO</p>
                    <p className="font-mono font-medium">{t.rpo_hours}h</p>
                  </div>
                  <div className="text-center">
                    <p className="text-muted-foreground">RTO</p>
                    <p className="font-mono font-medium">{t.rto_hours}h</p>
                  </div>
                  <Badge variant="default">{t.tool}</Badge>
                  {t.critical && <Badge className="bg-orange-100 text-orange-700">Kritisch</Badge>}
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Recent Manifests */}
      <Card>
        <CardContent className="p-4">
          <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold">
            <HardDrive className="h-4 w-4" />
            Letzte Backups
          </h3>
          {manifests.length === 0 ? (
            <p className="text-muted-foreground py-4 text-center text-sm">
              Noch keine Backups erstellt. Klicke &ldquo;Backup erstellen&rdquo; um ein
              Simulations-Backup zu erzeugen.
            </p>
          ) : (
            <div className="space-y-2">
              {manifests
                .slice(-5)
                .reverse()
                .map((m) => (
                  <div
                    key={m.id}
                    className="flex items-center justify-between rounded-md border p-3"
                  >
                    <div className="flex items-center gap-3">
                      <CheckCircle2 className="h-4 w-4 text-green-500" />
                      <div>
                        <p className="text-sm font-medium">{formatDate(m.created_at)}</p>
                        <p className="text-muted-foreground text-xs">
                          {m.entries.length} Targets · {formatBytes(m.total_size_bytes)} · von{" "}
                          {m.created_by}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      {m.rpo_met ? (
                        <Badge className="bg-green-100 text-green-700">RPO ✓</Badge>
                      ) : (
                        <Badge className="bg-red-100 text-red-700">RPO ✗</Badge>
                      )}
                      {m.rto_met ? (
                        <Badge className="bg-green-100 text-green-700">RTO ✓</Badge>
                      ) : (
                        <Badge className="bg-red-100 text-red-700">RTO ✗</Badge>
                      )}
                    </div>
                  </div>
                ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Recent Drills */}
      <Card>
        <CardContent className="p-4">
          <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold">
            <PlayCircle className="h-4 w-4" />
            Letzte Restore-Drills
          </h3>
          {drills.length === 0 ? (
            <p className="text-muted-foreground py-4 text-center text-sm">
              Noch keine Drills durchgeführt. Klicke &ldquo;Restore-Drill&rdquo; um einen
              Simulations-Drill zu starten.
            </p>
          ) : (
            <div className="space-y-2">
              {drills
                .slice(-5)
                .reverse()
                .map((d) => (
                  <div
                    key={d.id}
                    className="flex items-center justify-between rounded-md border p-3"
                  >
                    <div className="flex items-center gap-3">
                      {d.overall_passed ? (
                        <CheckCircle2 className="h-4 w-4 text-green-500" />
                      ) : (
                        <XCircle className="h-4 w-4 text-red-500" />
                      )}
                      <div>
                        <p className="text-sm font-medium">{formatDate(d.completed_at)}</p>
                        <p className="text-muted-foreground text-xs">
                          {d.targets_passed}/{d.targets_tested} Targets bestanden ·{" "}
                          {(d.duration_ms / 1000).toFixed(1)}s
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="flex items-center gap-1 text-xs">
                        <Clock className="h-3 w-3" />
                        <span className="font-mono">RTO: {d.rto_actual_hours.toFixed(2)}h</span>
                      </div>
                      {d.overall_passed ? (
                        <Badge className="bg-green-100 text-green-700">PASS</Badge>
                      ) : (
                        <Badge className="bg-red-100 text-red-700">FAIL</Badge>
                      )}
                    </div>
                  </div>
                ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
