"use client";

import { useState } from "react";
import {
  RefreshCw,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Users,
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
import { cn } from "@/lib/utils";
import { PageHeader } from "@/components/dashboard/page-header";
import { useScimStatus, useScimSync, type SyncStatus } from "@/lib/queries/scim";
import { useMe } from "@/lib/queries/auth";

function StatCard({
  label,
  value,
  icon: Icon,
  color,
}: {
  label: string;
  value: number | string;
  icon: React.ComponentType<{ size?: number; className?: string }>;
  color: string;
}) {
  return (
    <div className="flex items-center gap-3 rounded-xl border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] p-4">
      <div
        className={cn(
          "w-10 h-10 rounded-lg flex items-center justify-center shrink-0",
          color,
        )}
      >
        <Icon size={18} />
      </div>
      <div className="min-w-0">
        <p className="text-2xl font-bold text-[color:var(--ds-text)] tabular-nums">
          {value}
        </p>
        <p className="text-xs text-[color:var(--ds-text-muted)]">{label}</p>
      </div>
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
    <div className="flex items-center justify-between py-3 border-b border-[color:var(--ds-border)] last:border-0">
      <div>
        <p className="text-sm font-medium text-[color:var(--ds-text)]">
          {label}
        </p>
        <p className="text-xs text-[color:var(--ds-text-muted)] mt-0.5">
          {detail}
        </p>
      </div>
      {configured ? (
        <Badge variant="success" className="shrink-0">
          <CheckCircle2 size={12} /> Aktiv
        </Badge>
      ) : (
        <Badge variant="warning" className="shrink-0">
          <XCircle size={12} /> Nicht konfiguriert
        </Badge>
      )}
    </div>
  );
}

function CopyableField({ label, value, placeholder }: { label: string; value: string; placeholder: string }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    await navigator.clipboard.writeText(value);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };
  return (
    <div className="py-3 border-b border-[color:var(--ds-border)] last:border-0">
      <p className="text-sm font-medium text-[color:var(--ds-text)] mb-1.5">{label}</p>
      <div className="flex items-center gap-2">
        <code className="flex-1 text-xs font-mono text-[color:var(--ds-text-muted)] bg-[color:var(--ds-surface-2)] border border-[color:var(--ds-border)] rounded-lg px-3 py-2 truncate">
          {value || placeholder}
        </code>
        <button
          onClick={copy}
          disabled={!value}
          className="p-2 text-[color:var(--ds-text-muted)] hover:text-[color:var(--ds-text)] disabled:opacity-30 transition-colors shrink-0"
        >
          {copied ? <Check size={14} className="text-emerald-600" /> : <Copy size={14} />}
        </button>
      </div>
    </div>
  );
}

function SyncLogView({ status }: { status: SyncStatus }) {
  const result = status.lastSyncResult;
  if (!result && !status.lastSyncAt) {
    return (
      <div className="py-10 text-center">
        <div className="w-12 h-12 rounded-2xl bg-[color:var(--ds-surface-2)] flex items-center justify-center mx-auto mb-3">
          <Clock size={22} className="text-[color:var(--ds-border-strong)]" />
        </div>
        <p className="text-sm text-[color:var(--ds-text-muted)]">
          Noch keine Synchronisation durchgeführt.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {status.lastSyncAt && (
        <div className="flex items-center gap-2 text-sm text-[color:var(--ds-text-muted)]">
          <Clock size={14} />
          Letzte Synchronisation:{" "}
          <span className="text-[color:var(--ds-text)] font-medium">
            {new Date(status.lastSyncAt).toLocaleString("de-DE")}
          </span>
        </div>
      )}

      {result && (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="rounded-lg bg-[color:var(--ds-surface-2)] border border-[color:var(--ds-border)] p-3">
              <p className="text-xs text-[color:var(--ds-text-muted)]">Erstellt</p>
              <p className="text-lg font-semibold text-emerald-600 tabular-nums">
                {result.usersCreated}
              </p>
            </div>
            <div className="rounded-lg bg-[color:var(--ds-surface-2)] border border-[color:var(--ds-border)] p-3">
              <p className="text-xs text-[color:var(--ds-text-muted)]">Aktualisiert</p>
              <p className="text-lg font-semibold text-blue-600 tabular-nums">
                {result.usersUpdated}
              </p>
            </div>
            <div className="rounded-lg bg-[color:var(--ds-surface-2)] border border-[color:var(--ds-border)] p-3">
              <p className="text-xs text-[color:var(--ds-text-muted)]">Deaktiviert</p>
              <p className="text-lg font-semibold text-amber-600 tabular-nums">
                {result.usersDeactivated}
              </p>
            </div>
            <div className="rounded-lg bg-[color:var(--ds-surface-2)] border border-[color:var(--ds-border)] p-3">
              <p className="text-xs text-[color:var(--ds-text-muted)]">Gruppen</p>
              <p className="text-lg font-semibold text-[color:var(--ds-text)] tabular-nums">
                {result.groupsProcessed}
              </p>
            </div>
          </div>

          {result.errors.length > 0 && (
            <div className="rounded-lg border border-red-500/20 bg-red-500/5 p-4">
              <div className="flex items-center gap-2 mb-2">
                <AlertTriangle size={14} className="text-red-600 shrink-0" />
                <p className="text-sm font-medium text-red-600">
                  {result.errors.length} Fehler während der Synchronisation
                </p>
              </div>
              <ul className="space-y-1 max-h-40 overflow-y-auto">
                {result.errors.map((err, i) => (
                  <li key={i} className="text-xs text-red-600/80 font-mono">
                    {err}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {result.errors.length === 0 && (
            <div className="flex items-center gap-2 rounded-lg border border-emerald-500/20 bg-emerald-500/5 p-3">
              <CheckCircle2 size={14} className="text-emerald-600 shrink-0" />
              <p className="text-sm text-emerald-600">
                Synchronisation erfolgreich abgeschlossen.
              </p>
            </div>
          )}

          <div className="text-xs text-[color:var(--ds-text-muted)] space-y-1">
            <p>
              Start: {new Date(result.startedAt).toLocaleString("de-DE")}
            </p>
            <p>
              Ende: {new Date(result.completedAt).toLocaleString("de-DE")}
            </p>
          </div>
        </>
      )}
    </div>
  );
}

export default function ScimSettingsPage() {
  const meQuery = useMe();
  const statusQuery = useScimStatus();
  const syncMutation = useScimSync();
  const [showBearerToken, setShowBearerToken] = useState(false);

  const userRole = meQuery.data?.user?.role ?? "lawyer";
  const status = statusQuery.data?.data as SyncStatus | undefined;
  const isLoading = statusQuery.isLoading;
  const isSyncing = syncMutation.isPending;

  // RBAC: Only admin can access this page
  if (userRole !== "admin") {
    return (
      <div className="p-6 md:p-8 max-w-4xl mx-auto">
        <PageHeader
          title="SCIM Directory Sync"
          description="Zugriffsverwaltung über Identity Provider"
        />
        <Card>
          <div className="p-10 text-center">
            <div className="w-12 h-12 rounded-2xl bg-red-500/10 flex items-center justify-center mx-auto mb-3">
              <XCircle size={22} className="text-red-600" />
            </div>
            <p className="text-sm font-medium text-[color:var(--ds-text)]">
              Zugriff verweigert
            </p>
            <p className="text-xs text-[color:var(--ds-text-muted)] mt-1">
              Nur Administratoren können SCIM konfigurieren.
            </p>
            <Link href="/dashboard/settings" className="inline-block mt-4">
              <Button variant="outline" size="sm">
                ← Zurück zu Einstellungen
              </Button>
            </Link>
          </div>
        </Card>
      </div>
    );
  }

  const scimBaseUrl = `${typeof window !== "undefined" ? window.location.origin : "https://subsum.eu"}/api/scim`;
  const bearerTokenConfigured = status?.configured ?? false;
  const workosConfigured = status?.workosDirectorySyncConfigured ?? false;

  return (
    <div className="p-6 md:p-8 max-w-4xl mx-auto space-y-6">
      <PageHeader
        title="SCIM Directory Sync"
        description="Automatische Benutzerbereitstellung über Identity Provider (WorkOS)"
        breadcrumbs={[
          { label: "Einstellungen", href: "/dashboard/settings" },
          { label: "SCIM" },
        ]}
        actions={
          <Button
            variant="glow"
            size="md"
            onClick={() => syncMutation.mutate()}
            disabled={isSyncing || !workosConfigured}
            className="shrink-0"
          >
            <RefreshCw size={15} className={cn(isSyncing && "animate-spin")} />
            {isSyncing ? "Synchronisiere…" : "Manuelle Sync"}
          </Button>
        }
      />

      {/* Status Overview */}
      {isLoading ? (
        <Card>
          <div className="p-10 text-center">
            <RefreshCw size={20} className="animate-spin text-[color:var(--ds-text-muted)] mx-auto" />
            <p className="text-sm text-[color:var(--ds-text-muted)] mt-2">Lade Status…</p>
          </div>
        </Card>
      ) : (
        <>
          {/* Stats */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <StatCard
              label="SCIM-Benutzer gesamt"
              value={status?.totalScimUsers ?? 0}
              icon={Users}
              color="bg-blue-500/10 text-blue-600"
            />
            <StatCard
              label="Aktive Benutzer"
              value={status?.activeScimUsers ?? 0}
              icon={UserCheck}
              color="bg-emerald-500/10 text-emerald-600"
            />
            <StatCard
              label="Deaktivierte Benutzer"
              value={status?.deactivatedScimUsers ?? 0}
              icon={UserMinus}
              color="bg-amber-500/10 text-amber-600"
            />
            <StatCard
              label="Gruppen (letzter Sync)"
              value={status?.lastSyncResult?.groupsProcessed ?? 0}
              icon={FolderTree}
              color="bg-purple-500/10 text-purple-600"
            />
          </div>

          {/* Configuration */}
          <Card>
            <div className="p-6 border-b border-[color:var(--ds-border)]">
              <h2 className="text-base font-semibold text-[color:var(--ds-text)]">
                Konfiguration
              </h2>
              <p className="text-sm text-[color:var(--ds-text-muted)] mt-1">
                SCIM-Endpoint und WorkOS Directory Sync Status
              </p>
            </div>
            <div className="px-6">
              <ConfigRow
                label="SCIM Bearer Token"
                configured={bearerTokenConfigured}
                detail={
                  bearerTokenConfigured
                    ? "Token konfiguriert — SCIM-Endpoints sind aktiv"
                    : "Setze SCIM_BEARER_TOKEN in den Umgebungsvariablen"
                }
              />
              <ConfigRow
                label="WorkOS Directory Sync"
                configured={workosConfigured}
                detail={
                  workosConfigured
                    ? "WORKOS_API_KEY und WORKOS_DIRECTORY_ID konfiguriert"
                    : "Setze WORKOS_API_KEY und WORKOS_DIRECTORY_ID für automatische Synchronisation"
                }
              />
            </div>
          </Card>

          {/* SCIM Endpoint Configuration Guide */}
          <Card>
            <div className="p-6 border-b border-[color:var(--ds-border)]">
              <h2 className="text-base font-semibold text-[color:var(--ds-text)]">
                WorkOS Setup
              </h2>
              <p className="text-sm text-[color:var(--ds-text-muted)] mt-1">
                Konfiguriere diese Werte im WorkOS Dashboard unter Directory Sync
              </p>
            </div>
            <div className="px-6">
              <CopyableField
                label="SCIM Base URL"
                value={scimBaseUrl}
                placeholder="https://subsum.eu/api/scim"
              />
              <CopyableField
                label="SCIM Bearer Token"
                value={showBearerToken ? (process.env.NEXT_PUBLIC_SCIM_TOKEN_PREVIEW || "••••••••") : "••••••••"}
                placeholder="In .env als SCIM_BEARER_TOKEN konfiguriert"
              />
              <div className="py-3">
                <button
                  onClick={() => setShowBearerToken(!showBearerToken)}
                  className="text-xs brand-text hover:underline"
                >
                  {showBearerToken ? "Token verbergen" : "Token anzeigen"}
                </button>
              </div>
              <div className="py-3 border-t border-[color:var(--ds-border)]">
                <a
                  href="https://workos.com/docs/directory-sync"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-xs brand-text hover:underline"
                >
                  WorkOS Directory Sync Dokumentation <ExternalLink size={10} />
                </a>
              </div>
            </div>
          </Card>

          {/* Sync Log */}
          <Card>
            <div className="p-6 border-b border-[color:var(--ds-border)]">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-base font-semibold text-[color:var(--ds-text)]">
                    Synchronisations-Log
                  </h2>
                  <p className="text-sm text-[color:var(--ds-text-muted)] mt-1">
                    Letzte Sync-Ergebnisse und Fehler
                  </p>
                </div>
                {status?.lastSyncAt && (
                  <Badge variant="info" className="shrink-0">
                    <Clock size={11} />
                    {new Date(status.lastSyncAt).toLocaleDateString("de-DE")}
                  </Badge>
                )}
              </div>
            </div>
            <div className="px-6 py-4">
              {status && <SyncLogView status={status} />}
            </div>
          </Card>

          {/* How it works */}
          <Card>
            <div className="p-6 border-b border-[color:var(--ds-border)]">
              <h2 className="text-base font-semibold text-[color:var(--ds-text)]">
                Wie funktioniert SCIM Directory Sync?
              </h2>
            </div>
            <div className="px-6 py-4 space-y-3">
              {[
                {
                  icon: UserPlus,
                  text: "Auto-Provisioning: Neue Benutzer im IdP werden automatisch in Subsumio erstellt.",
                  color: "text-emerald-600",
                },
                {
                  icon: UserCheck,
                  text: "Auto-Update: Änderungen an Namen, E-Mail oder Rollen werden synchronisiert.",
                  color: "text-blue-600",
                },
                {
                  icon: UserMinus,
                  text: "Auto-Deprovisioning: Gelöschte Benutzer werden deaktiviert (nicht gelöscht) — für Audit-Trail.",
                  color: "text-amber-600",
                },
                {
                  icon: FolderTree,
                  text: "Gruppen-Sync: AD/LDAP-Gruppen werden als SCIM-Gruppen abgebildet.",
                  color: "text-purple-600",
                },
              ].map((item, i) => {
                const Icon = item.icon;
                return (
                  <div key={i} className="flex items-start gap-3">
                    <div className={cn("mt-0.5 shrink-0", item.color)}>
                      <Icon size={16} />
                    </div>
                    <p className="text-sm text-[color:var(--ds-text-muted)] leading-relaxed">
                      {item.text}
                    </p>
                  </div>
                );
              })}
            </div>
          </Card>

          {/* Sync error toast */}
          {syncMutation.isError && (
            <div className="fixed bottom-4 right-4 rounded-lg border border-red-500/20 bg-red-500/10 backdrop-blur-sm px-4 py-3 shadow-lg z-50">
              <div className="flex items-center gap-2">
                <AlertTriangle size={16} className="text-red-600" />
                <p className="text-sm text-red-600">
                  Sync fehlgeschlagen:{" "}
                  {syncMutation.error instanceof Error
                    ? syncMutation.error.message
                    : "Unbekannter Fehler"}
                </p>
              </div>
            </div>
          )}

          {/* Sync success toast */}
          {syncMutation.isSuccess && (
            <div className="fixed bottom-4 right-4 rounded-lg border border-emerald-500/20 bg-emerald-500/10 backdrop-blur-sm px-4 py-3 shadow-lg z-50">
              <div className="flex items-center gap-2">
                <CheckCircle2 size={16} className="text-emerald-600" />
                <p className="text-sm text-emerald-600">
                  Synchronisation abgeschlossen:{" "}
                  {syncMutation.data?.data?.usersCreated ?? 0} erstellt,{" "}
                  {syncMutation.data?.data?.usersUpdated ?? 0} aktualisiert,{" "}
                  {syncMutation.data?.data?.usersDeactivated ?? 0} deaktiviert
                </p>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
