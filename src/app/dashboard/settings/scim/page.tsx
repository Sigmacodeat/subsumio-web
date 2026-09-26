"use client";

import { useState } from "react";
import {
  RefreshCw,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  UserMinus,
  UserPlus,
  UserCheck,
  FolderTree,
  Clock,
  Copy,
  Check,
  ExternalLink,
} from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { cn, formatDate, formatDateTime } from "@/lib/utils";
import { Skeleton } from "@/components/ui/skeleton";
import { PageHeader } from "@/components/dashboard/page-header";
import { PrimaryAction } from "@/components/dashboard/primary-action";
import { useScimStatus, useScimSync, type SyncStatus } from "@/lib/queries/scim";
import { useMe } from "@/lib/queries/auth";
import { useLang } from "@/lib/use-lang";

function StatCard({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="rounded-xl border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] p-4">
      <p className="text-xs text-[color:var(--ds-text-muted)]">{label}</p>
      <p className="mt-1 text-2xl font-semibold text-[color:var(--ds-text)] tabular-nums">
        {value}
      </p>
    </div>
  );
}

function ConfigRow({
  label,
  configured,
  detail,
}: {
  label: string;
  configured: boolean;
  detail: string;
}) {
  return (
    <div className="flex items-center justify-between border-b border-[color:var(--ds-border)] py-3 last:border-0">
      <div>
        <p className="text-sm font-medium text-[color:var(--ds-text)]">{label}</p>
        <p className="mt-0.5 text-xs text-[color:var(--ds-text-muted)]">{detail}</p>
      </div>
      {configured ? (
        <Badge variant="success" className="shrink-0">
          Aktiv
        </Badge>
      ) : (
        <Badge variant="warning" className="shrink-0">
          Nicht eingerichtet
        </Badge>
      )}
    </div>
  );
}

function CopyableField({
  label,
  value,
  placeholder,
}: {
  label: string;
  value: string;
  placeholder: string;
}) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    await navigator.clipboard.writeText(value);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };
  return (
    <div className="border-b border-[color:var(--ds-border)] py-3 last:border-0">
      <p className="mb-1.5 text-sm font-medium text-[color:var(--ds-text)]">{label}</p>
      <div className="flex items-center gap-2">
        <code className="flex-1 truncate rounded-lg border border-[color:var(--ds-border)] bg-[color:var(--ds-surface-2)] px-3 py-2 font-mono text-xs text-[color:var(--ds-text-muted)]">
          {value || placeholder}
        </code>
        <button
          onClick={copy}
          disabled={!value}
          aria-label={`${label} kopieren`}
          className="shrink-0 p-2 text-[color:var(--ds-text-muted)] transition-[background-color,border-color,color] hover:text-[color:var(--ds-text)] focus-visible:ring-2 focus-visible:ring-[color:var(--brand-primary)] focus-visible:outline-none active:scale-[0.99] disabled:opacity-30 motion-reduce:transition-none"
        >
          {copied ? (
            <Check size={14} className="text-[color:var(--ds-success-text)]" />
          ) : (
            <Copy size={14} />
          )}
        </button>
      </div>
    </div>
  );
}

function SyncLogView({ status }: { status: SyncStatus }) {
  const { t } = useLang();
  const result = status.lastSyncResult;
  if (!result && !status.lastSyncAt) {
    return (
      <div className="py-10 text-center">
        <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-[color:var(--ds-surface-2)]">
          <Clock size={22} className="text-[color:var(--ds-border-strong)]" />
        </div>
        <p className="text-sm text-[color:var(--ds-text-muted)]">{t("scim.no_sync")}</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {status.lastSyncAt && (
        <div className="flex items-center gap-2 text-sm text-[color:var(--ds-text-muted)]">
          <Clock size={14} />
          {t("scim.last_sync")}{" "}
          <span className="font-medium text-[color:var(--ds-text)]">
            {formatDateTime(status.lastSyncAt)}
          </span>
        </div>
      )}

      {result && (
        <>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <div className="rounded-lg border border-[color:var(--ds-border)] bg-[color:var(--ds-surface-2)] p-3">
              <p className="text-xs text-[color:var(--ds-text-muted)]">Erstellt</p>
              <p className="text-lg font-semibold text-[color:var(--ds-text)] tabular-nums">
                {result.usersCreated}
              </p>
            </div>
            <div className="rounded-lg border border-[color:var(--ds-border)] bg-[color:var(--ds-surface-2)] p-3">
              <p className="text-xs text-[color:var(--ds-text-muted)]">Aktualisiert</p>
              <p className="text-lg font-semibold text-[color:var(--ds-text)] tabular-nums">
                {result.usersUpdated}
              </p>
            </div>
            <div className="rounded-lg border border-[color:var(--ds-border)] bg-[color:var(--ds-surface-2)] p-3">
              <p className="text-xs text-[color:var(--ds-text-muted)]">Deaktiviert</p>
              <p className="text-lg font-semibold text-[color:var(--ds-text)] tabular-nums">
                {result.usersDeactivated}
              </p>
            </div>
            <div className="rounded-lg border border-[color:var(--ds-border)] bg-[color:var(--ds-surface-2)] p-3">
              <p className="text-xs text-[color:var(--ds-text-muted)]">Gruppen</p>
              <p className="text-lg font-semibold text-[color:var(--ds-text)] tabular-nums">
                {result.groupsProcessed}
              </p>
            </div>
          </div>

          {result.errors.length > 0 && (
            <div className="rounded-lg border border-[color:var(--ds-danger-border)] bg-[color:var(--ds-danger-bg)] p-4">
              <div className="mb-2 flex items-center gap-2">
                <AlertTriangle size={14} className="shrink-0 text-[color:var(--ds-danger-text)]" />
                <p className="text-sm font-medium text-[color:var(--ds-danger-text)]">
                  {result.errors.length} {t("scim.errors_count")}
                </p>
              </div>
              <ul className="max-h-40 space-y-1 overflow-y-auto">
                {result.errors.map((err, i) => (
                  <li key={i} className="font-mono text-xs text-[color:var(--ds-danger-text)]">
                    {err}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {result.errors.length === 0 && (
            <div className="flex items-center gap-2 rounded-lg border border-[color:var(--ds-success-border)] bg-[color:var(--ds-success-bg)] p-3">
              <CheckCircle2 size={14} className="shrink-0 text-[color:var(--ds-success-text)]" />
              <p className="text-sm text-[color:var(--ds-success-text)]">
                {t("scim.sync_success")}
              </p>
            </div>
          )}

          <div className="space-y-1 text-xs text-[color:var(--ds-text-muted)]">
            <p className="tabular-nums">Beginn: {formatDateTime(result.startedAt)}</p>
            <p className="tabular-nums">Ende: {formatDateTime(result.completedAt)}</p>
          </div>
        </>
      )}
    </div>
  );
}

export default function ScimSettingsPage() {
  const { t } = useLang();
  const meQuery = useMe();
  const statusQuery = useScimStatus();
  const syncMutation = useScimSync();

  const userRole = meQuery.data?.user?.role ?? "lawyer";
  const status = statusQuery.data?.data;
  const isLoading = statusQuery.isLoading;
  const isSyncing = syncMutation.isPending;

  // RBAC: Only admin can access this page
  if (userRole !== "admin") {
    return (
      <div className="ds-page ds-page-narrow space-y-6 p-4 md:p-6 lg:p-8">
        <PageHeader
          title="Benutzerabgleich (SCIM)"
          description={t("scim.description")}
          breadcrumbs={[
            { label: t("breadcrumb.dashboard"), href: "/dashboard" },
            { label: t("scim.breadcrumb_settings"), href: "/dashboard/settings" },
            { label: t("scim.breadcrumb_scim") },
          ]}
        />
        <Card>
          <div className="p-10 text-center">
            <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-[color:var(--ds-danger-bg)]">
              <XCircle size={22} className="text-[color:var(--ds-danger-text)]" />
            </div>
            <p className="text-sm font-medium text-[color:var(--ds-text)]">
              {t("scim.access_denied")}
            </p>
            <p className="mt-1 text-xs text-[color:var(--ds-text-muted)]">{t("scim.admin_only")}</p>
            <Button variant="outline" size="sm" className="mt-4" asChild>
              <Link href="/dashboard/settings">{t("scim.back_to_settings")}</Link>
            </Button>
          </div>
        </Card>
      </div>
    );
  }

  const scimBaseUrl = `${typeof window !== "undefined" ? window.location.origin : "https://subsum.io"}/api/scim`;
  const bearerTokenConfigured = status?.configured ?? false;
  const workosConfigured = status?.workosDirectorySyncConfigured ?? false;
  const anyConfigured = bearerTokenConfigured || workosConfigured;

  return (
    <div className="ds-page ds-page-narrow space-y-6 p-4 md:p-6 lg:p-8">
      <PageHeader
        title="Benutzerabgleich (SCIM)"
        description="Übernimmt Mitarbeiter und Rollen automatisch aus dem Benutzerverzeichnis Ihrer Kanzlei (z. B. Microsoft Entra ID)."
        breadcrumbs={[
          { label: t("breadcrumb.dashboard"), href: "/dashboard" },
          { label: t("scim.breadcrumb_settings"), href: "/dashboard/settings" },
          { label: t("scim.breadcrumb_scim") },
        ]}
        actions={
          workosConfigured ? (
            <PrimaryAction
              icon={<RefreshCw size={15} className={cn(isSyncing && "animate-spin")} />}
              onClick={() => syncMutation.mutate()}
              disabled={isSyncing}
              className="shrink-0"
            >
              {isSyncing ? t("scim.sync_syncing") : t("scim.sync_manual")}
            </PrimaryAction>
          ) : undefined
        }
      />

      {/* Status Overview */}
      {isLoading ? (
        <div className="space-y-3" role="status" aria-label={t("scim.loading_status")}>
          <Skeleton className="h-24 w-full rounded-xl" />
          <Skeleton className="h-40 w-full rounded-xl" />
        </div>
      ) : (
        <>
          {/* Stats — only meaningful once a directory is connected */}
          {anyConfigured && (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              <StatCard label={t("scim.label_active_users")} value={status?.activeScimUsers ?? 0} />
              <StatCard
                label={t("scim.label_disabled_users")}
                value={status?.deactivatedScimUsers ?? 0}
              />
              <StatCard
                label="Gruppen (letzter Abgleich)"
                value={status?.lastSyncResult?.groupsProcessed ?? 0}
              />
            </div>
          )}

          {/* Configuration */}
          <Card>
            <div className="border-b border-[color:var(--ds-border)] p-6">
              <h2 className="text-base font-semibold text-[color:var(--ds-text)]">Einrichtung</h2>
              <p className="mt-1 text-sm text-[color:var(--ds-text-muted)]">
                Die Zugangsdaten hinterlegt der Betreiber Ihrer Subsumio-Installation auf dem
                Server; hier sehen Sie, ob sie vorhanden sind.
              </p>
            </div>
            <div className="px-6">
              <ConfigRow
                label="Zugangsschlüssel für das Benutzerverzeichnis"
                configured={bearerTokenConfigured}
                detail={
                  bearerTokenConfigured
                    ? "Ihr Benutzerverzeichnis kann Mitarbeiter an Subsumio übertragen."
                    : "Noch nicht hinterlegt – bitte beim Betreiber anfragen."
                }
              />
              <ConfigRow
                label="Automatischer Abgleich über WorkOS"
                configured={workosConfigured}
                detail={
                  workosConfigured
                    ? "Subsumio holt Änderungen regelmäßig selbst ab."
                    : "Optional; nur nötig, wenn Ihr Verzeichnis über WorkOS angebunden wird."
                }
              />
            </div>
          </Card>

          {/* SCIM Endpoint Configuration Guide */}
          <Card>
            <div className="border-b border-[color:var(--ds-border)] p-6">
              <h2 className="text-base font-semibold text-[color:var(--ds-text)]">
                Angaben für Ihre IT
              </h2>
              <p className="mt-1 text-sm text-[color:var(--ds-text-muted)]">
                Diese Adresse trägt Ihre IT im Benutzerverzeichnis ein.
              </p>
            </div>
            <div className="px-6">
              <CopyableField
                label="Adresse für Ihr Benutzerverzeichnis (SCIM-Basis-URL)"
                value={scimBaseUrl}
                placeholder="https://subsum.io/api/scim"
              />
              <div className="border-t border-[color:var(--ds-border)] py-3">
                <a
                  href="https://workos.com/docs/directory-sync"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="brand-text inline-flex items-center gap-1 text-xs hover:underline"
                >
                  Anleitung von WorkOS (englisch) <ExternalLink size={10} />
                </a>
              </div>
            </div>
          </Card>

          {/* Sync Log */}
          <Card>
            <div className="border-b border-[color:var(--ds-border)] p-6">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-base font-semibold text-[color:var(--ds-text)]">
                    Letzter Abgleich
                  </h2>
                  <p className="mt-1 text-sm text-[color:var(--ds-text-muted)]">
                    Ergebnis und etwaige Fehler des letzten Abgleichs.
                  </p>
                </div>
                {status?.lastSyncAt && (
                  <Badge variant="info" className="shrink-0">
                    <Clock size={11} />
                    {formatDate(status.lastSyncAt)}
                  </Badge>
                )}
              </div>
            </div>
            <div className="px-6 py-4">{status && <SyncLogView status={status} />}</div>
          </Card>

          {/* How it works */}
          <Card>
            <div className="border-b border-[color:var(--ds-border)] p-6">
              <h2 className="text-base font-semibold text-[color:var(--ds-text)]">
                So funktioniert der Abgleich
              </h2>
            </div>
            <div className="space-y-3 px-6 py-4">
              {[
                {
                  icon: UserPlus,
                  text: "Neue Mitarbeiter im Verzeichnis erhalten automatisch einen Zugang zu Subsumio – zunächst mit der Rolle Sekretariat. Weitere Rechte vergibt die Inhaberin oder der Inhaber unter Team.",
                  color: "text-[color:var(--ds-text-muted)]",
                },
                {
                  icon: UserCheck,
                  text: "Namensänderungen werden übernommen. E-Mail-Adresse und Rolle werden nicht aus dem Verzeichnis übernommen – diese ändern Sie in Subsumio.",
                  color: "text-[color:var(--ds-text-muted)]",
                },
                {
                  icon: UserMinus,
                  text: "Ausgeschiedene Mitarbeiter werden gesperrt, nicht gelöscht – ihre Spuren im Änderungsprotokoll bleiben erhalten.",
                  color: "text-[color:var(--ds-text-muted)]",
                },
                {
                  icon: FolderTree,
                  text: "Gruppen aus dem Verzeichnis werden angenommen, vergeben in Subsumio aber keine Rechte und werden nicht dauerhaft gespeichert.",
                  color: "text-[color:var(--ds-text-muted)]",
                },
              ].map((item, i) => {
                const Icon = item.icon;
                return (
                  <div key={i} className="flex items-start gap-3">
                    <div className={cn("mt-0.5 shrink-0", item.color)}>
                      <Icon size={16} />
                    </div>
                    <p className="text-sm leading-relaxed text-[color:var(--ds-text-muted)]">
                      {item.text}
                    </p>
                  </div>
                );
              })}
            </div>
          </Card>

          {/* Sync error toast */}
          {syncMutation.isError && (
            <div className="fixed right-4 bottom-4 z-50 rounded-lg border border-[color:var(--ds-danger-border)] bg-[color:var(--ds-danger-bg)] px-4 py-3 shadow-lg backdrop-blur-sm">
              <div className="flex items-center gap-2">
                <AlertTriangle size={16} className="text-[color:var(--ds-danger-text)]" />
                <p className="text-sm text-[color:var(--ds-danger-text)]">
                  Der Abgleich ist fehlgeschlagen. Bitte prüfen Sie die Einrichtung oder versuchen
                  Sie es später erneut.
                </p>
              </div>
            </div>
          )}

          {/* Sync success toast */}
          {syncMutation.isSuccess && (
            <div className="fixed right-4 bottom-4 z-50 rounded-lg border border-[color:var(--ds-success-border)] bg-[color:var(--ds-success-bg)] px-4 py-3 shadow-lg backdrop-blur-sm">
              <div className="flex items-center gap-2">
                <CheckCircle2 size={16} className="text-[color:var(--ds-success-text)]" />
                <p className="text-sm text-[color:var(--ds-success-text)]">
                  Synchronisation abgeschlossen: {syncMutation.data?.data?.usersCreated ?? 0}{" "}
                  erstellt, {syncMutation.data?.data?.usersUpdated ?? 0} aktualisiert,{" "}
                  {syncMutation.data?.data?.usersDeactivated ?? 0} deaktiviert
                  {(syncMutation.data?.data?.errors?.length ?? 0) > 0 &&
                    ` · ${syncMutation.data?.data?.errors.length} Fehler`}
                </p>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
