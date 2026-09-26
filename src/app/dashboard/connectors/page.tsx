"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useLang } from "@/lib/use-lang";
import { useToast } from "@/components/ui/toast";
import {
  Plug,
  Loader2,
  CheckCircle2,
  XCircle,
  RefreshCw,
  Info,
  Landmark,
  FileText,
  Calendar,
  Mail,
  Folder,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { api, type ConnectorStatus } from "@/lib/api";
import { useMe } from "@/lib/queries/auth";
import { cn, formatDateTime } from "@/lib/utils";
import { EmptyState } from "@/components/dashboard/empty-state";
import { Skeleton } from "@/components/dashboard/skeleton";
import { PageHeader } from "@/components/dashboard/page-header";
import { DmsBrowserDialog } from "@/components/legal/DmsBrowserDialog";
import { DmsConfigPanel } from "@/components/legal/DmsConfigPanel";
import {
  getCoverageMatrix,
  isWebSelfServiceConnector,
  type ConnectorCoverageEntry,
} from "@/lib/connector-coverage";
import type { DashboardKey } from "@/content/dashboard";

const CONNECTOR_ICONS: Record<string, React.ElementType> = {
  "google-drive": Folder,
  gmail: Mail,
  notion: FileText,
  github: FileText,
  slack: FileText,
  calendar: Calendar,
  dropbox: Folder,
  asana: FileText,
  jira: FileText,
  "legal-judgements": Landmark,
  "advokat-import": Folder,
};

const CONNECTOR_LABELS: Record<string, string> = {
  "google-drive": "Google Drive",
  gmail: "Gmail",
  notion: "Notion",
  github: "GitHub",
  slack: "Slack",
  calendar: "Kalender",
  dropbox: "Dropbox",
  asana: "Asana",
  jira: "Jira",
  "legal-judgements": "Rechtsprechung",
  "advokat-import": "ADVOKAT-Import",
};

// Jurisdiktionsgebundene Konnektoren: DE-Orgs sehen beA/DATEV/deutsche
// Rechtsprechung, AT-Orgs sehen sie nicht (und umgekehrt bei CH).
const DE_ONLY_SERVICES = new Set(["bea-import"]);
const DE_ONLY_COVERAGE_IDS = new Set(["bea-import", "datev-import", "legal-judgements-de"]);
const CH_ONLY_COVERAGE_IDS = new Set(["legal-judgements-ch"]);

function hiddenServicesFor(jurisdiction: string | null | undefined): Set<string> {
  return jurisdiction === "DE" ? new Set() : DE_ONLY_SERVICES;
}
function hiddenCoverageFor(jurisdiction: string | null | undefined): Set<string> {
  if (jurisdiction === "DE") return CH_ONLY_COVERAGE_IDS;
  if (jurisdiction === "CH") return new Set([...DE_ONLY_COVERAGE_IDS]);
  return new Set([...DE_ONLY_COVERAGE_IDS, ...CH_ONLY_COVERAGE_IDS]);
}

const PERMISSION_MESSAGE =
  "Für diese Seite fehlt Ihnen die Berechtigung. Bitte wenden Sie sich an Ihre Kanzlei-Administration.";

function isPermissionError(e: unknown): boolean {
  const status = (e as { status?: unknown } | null)?.status;
  if (status === 403) return true;
  const message = e instanceof Error ? e.message : typeof e === "string" ? e : "";
  return /not permitted|forbidden|permission|nicht berechtigt|keine berechtigung/i.test(message);
}

/** Server-Fehlertexte nie roh anzeigen — Berechtigung gesondert, sonst Klartext. */
function errorText(e: unknown, fallback: string): string {
  if (isPermissionError(e)) return PERMISSION_MESSAGE;
  return fallback;
}

const SYNC_MODE_LABEL: Record<string, string> = {
  delta: "Laufend (nur Änderungen)",
  full: "Vollständig",
  manual: "Manuell",
};

const AUTH_LABEL: Record<string, string> = {
  oauth2: "Anmeldung beim Anbieter",
  api_key: "Zugangsschlüssel",
  file_watch: "Ordnerüberwachung",
  manual_upload: "Hochladen",
  none: "Keine",
};

const CATEGORY_LABEL: Record<string, string> = {
  dms: "Dokumentenverwaltung",
  microsoft_365: "Microsoft 365",
  google_workspace: "Google Workspace",
  local_folder: "Ordner und Dienste",
  upload: "Hochladen",
  legal_database: "Rechtsdatenbank",
  bea: "beA",
  datev: "DATEV",
};

export default function ConnectorsPage() {
  const { addToast } = useToast();
  const { t } = useLang();
  const me = useMe();
  const jurisdiction = me.data?.user?.jurisdiction ?? me.data?.demo?.jurisdiction?.toUpperCase();
  const isAdmin = me.data?.user?.role === "admin";
  const [allConnectors, setConnectors] = useState<ConnectorStatus[]>([]);
  // Filtered at render: the firm's jurisdiction often arrives after the list.
  const hiddenServices = hiddenServicesFor(jurisdiction);
  const connectors = allConnectors.filter((c) => !hiddenServices.has(c.service));
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState<string | null>(null);
  const [toggling, setToggling] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showCoverage, setShowCoverage] = useState(false);
  const [showDmsBrowser, setShowDmsBrowser] = useState(false);
  const [advokatPath, setAdvokatPath] = useState("advokat");
  const [configuringAdvokat, setConfiguringAdvokat] = useState(false);
  const advokatInputRef = useRef<HTMLInputElement>(null);

  const loadConnectors = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.connectors.list();
      setConnectors(res.connectors);
    } catch (e) {
      setConnectors([]);
      setError(
        errorText(
          e,
          "Der Verbindungsstatus konnte nicht geladen werden. Bitte versuchen Sie es in einigen Minuten erneut."
        )
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadConnectors();
  }, [loadConnectors]);

  async function handleSync(service: string) {
    const label = CONNECTOR_LABELS[service] ?? service;
    setSyncing(service);
    setError(null);
    try {
      await api.connectors.sync(service);
      addToast({ type: "success", description: `Abgleich für ${label} gestartet.` });
      await loadConnectors();
    } catch (e) {
      setError(errorText(e, `Der Abgleich für ${label} konnte nicht gestartet werden.`));
    } finally {
      setSyncing(null);
    }
  }

  async function handleToggle(service: string) {
    const label = CONNECTOR_LABELS[service] ?? service;
    setToggling(service);
    setError(null);
    try {
      const res = await api.connectors.toggle(service);
      await loadConnectors();
      addToast({
        type: "success",
        description: `${label} ist jetzt ${res.enabled ? "aktiviert" : "deaktiviert"}.`,
      });
    } catch (e) {
      setError(errorText(e, `Der Status von ${label} konnte nicht geändert werden.`));
    } finally {
      setToggling(null);
    }
  }

  async function configureAdvokat() {
    setConfiguringAdvokat(true);
    setError(null);
    try {
      await api.connectors.configureFolder("advokat-import", {
        watch_dir: advokatPath,
        poll_interval_ms: 60_000,
      });
      addToast({
        type: "success",
        description: "ADVOKAT-Ordner eingebunden. Er wird jede Minute abgeglichen.",
      });
      await loadConnectors();
    } catch (e) {
      setError(
        errorText(
          e,
          "Der ADVOKAT-Ordner konnte nicht eingebunden werden. Prüfen Sie, ob der Pfad auf dem Server existiert."
        )
      );
    } finally {
      setConfiguringAdvokat(false);
    }
  }

  function lastSyncLabel(value: number | null) {
    if (!value) return t("connectors.never_synced" as DashboardKey);
    return `${t("connectors.last_sync" as DashboardKey)}: ${formatDateTime(new Date(value))}`;
  }

  return (
    <div className="ds-page space-y-6 p-4 md:p-6 lg:p-8">
      <PageHeader
        title={t("connectors.title")}
        description={t("connectors.description")}
        breadcrumbs={[
          { label: t("breadcrumb.dashboard"), href: "/dashboard" },
          { label: t("connectors.breadcrumb") },
        ]}
      />

      <div className="flex items-start gap-3 rounded-xl border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] px-4 py-3">
        <Info
          size={16}
          className="mt-0.5 shrink-0 text-[color:var(--ds-text-muted)]"
          aria-hidden="true"
        />
        <p className="text-sm text-[color:var(--ds-text-muted)]">
          Hier aktivieren Sie eingerichtete Verbindungen und stoßen einen Abgleich an. Zugangsdaten
          für eine neue Verbindung (etwa Google Drive oder Notion) hinterlegt Ihr technischer
          Betreuer auf dem Server — die Befehle stehen unten.
        </p>
      </div>

      {error && (
        <div
          role="alert"
          className="flex items-center gap-2 rounded-xl border border-[color:var(--ds-danger-border)] bg-[color:var(--ds-danger-bg)] px-4 py-3 text-sm text-[color:var(--ds-danger-text)]"
        >
          <XCircle size={16} className="shrink-0" aria-hidden="true" />
          {error}
        </div>
      )}

      {/* List */}
      {loading ? (
        <div className="space-y-2" role="status" aria-label={t("aria.loading")}>
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-16 w-full rounded-xl" />
          ))}
        </div>
      ) : connectors.length === 0 ? (
        !error && (
          <EmptyState
            icon={Plug}
            title={t("connectors.empty" as DashboardKey)}
            description="Binden Sie zum Beispiel einen ADVOKAT-Exportordner ein, damit Akten und Dokumente automatisch übernommen werden."
            actionLabel="ADVOKAT-Ordner einbinden"
            onAction={() => advokatInputRef.current?.focus()}
          />
        )
      ) : (
        <ul className="space-y-2">
          {connectors.map((c) => {
            const Icon = CONNECTOR_ICONS[c.service] || Plug;
            const label = CONNECTOR_LABELS[c.service] || c.service;

            return (
              <li
                key={c.service}
                className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-xl border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] px-4 py-3"
              >
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-[color:var(--ds-border)] bg-[color:var(--ds-surface-2)]">
                  <Icon
                    size={16}
                    className="text-[color:var(--ds-text-muted)]"
                    aria-hidden="true"
                  />
                </div>
                <div className="min-w-[12rem] flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium text-[color:var(--ds-text)]">{label}</span>
                    {!c.configured && (
                      <Badge variant="default" className="whitespace-nowrap">
                        Nicht eingerichtet
                      </Badge>
                    )}
                  </div>
                  <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-[color:var(--ds-text-muted)]">
                    <span
                      className={cn(
                        "flex items-center gap-1",
                        c.enabled && "text-[color:var(--ds-success-text)]"
                      )}
                    >
                      {c.enabled ? (
                        <CheckCircle2 size={11} aria-hidden="true" />
                      ) : (
                        <XCircle size={11} aria-hidden="true" />
                      )}
                      {c.enabled ? t("connectors.status_enabled") : t("connectors.status_disabled")}
                    </span>
                    <span
                      className={cn(
                        "flex items-center gap-1",
                        c.connected && "text-[color:var(--ds-success-text)]"
                      )}
                    >
                      {c.connected ? (
                        <CheckCircle2 size={11} aria-hidden="true" />
                      ) : (
                        <XCircle size={11} aria-hidden="true" />
                      )}
                      {c.connected
                        ? t("connectors.status_connected")
                        : t("connectors.status_disconnected")}
                    </span>
                    <span className="tabular-nums">{lastSyncLabel(c.last_sync_at)}</span>
                  </div>
                </div>
                <div className="ml-auto flex shrink-0 items-center gap-1">
                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={!c.configured || toggling === c.service}
                    onClick={() => handleToggle(c.service)}
                    className="gap-1.5 text-xs whitespace-nowrap"
                  >
                    {toggling === c.service && <Loader2 size={12} className="animate-spin" />}
                    {c.enabled ? t("connectors.btn_disable") : t("connectors.btn_enable")}
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={!c.configured || !c.enabled || syncing === c.service}
                    onClick={() => handleSync(c.service)}
                    className="gap-1.5 text-xs whitespace-nowrap"
                  >
                    {syncing === c.service ? (
                      <Loader2 size={12} className="animate-spin" />
                    ) : (
                      <RefreshCw size={12} aria-hidden="true" />
                    )}
                    Jetzt abgleichen
                  </Button>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      <section className="space-y-3 rounded-xl border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] p-4">
        <div>
          <h2 className="text-sm font-semibold text-[color:var(--ds-text)]">
            ADVOKAT-Ordner einbinden
          </h2>
          <p className="mt-1 text-xs text-[color:var(--ds-text-muted)]">
            Binden Sie einen Export- oder Dokumentenordner Ihres ADVOKAT-Servers ein. Subsumio liest
            den Ordner nur (schreibt nie hinein) und gleicht ihn jede Minute ab. Der erste
            Unterordner gilt als Aktenzeichen. Angegeben wird ein Ordner im Import-Verzeichnis Ihrer
            Kanzlei auf dem Server (z. B. „advokat“); Pfade außerhalb werden abgelehnt.
          </p>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row">
          <Input
            ref={advokatInputRef}
            value={advokatPath}
            onChange={(event) => setAdvokatPath(event.target.value)}
            placeholder="advokat"
            aria-label="ADVOKAT-Ordner im Import-Verzeichnis der Kanzlei"
          />
          <Button
            type="button"
            onClick={configureAdvokat}
            disabled={!advokatPath.trim() || configuringAdvokat}
            className="whitespace-nowrap"
          >
            {configuringAdvokat ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
            Ordner einbinden
          </Button>
        </div>
      </section>

      {/* Befehle für den technischen Betreuer */}
      <section className="space-y-3 rounded-xl border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] p-4">
        <div>
          <h2 className="text-sm font-semibold text-[color:var(--ds-text)]">
            Befehle für den technischen Betreuer
          </h2>
          <p className="mt-1 text-xs text-[color:var(--ds-text-muted)]">
            Neue Verbindungen werden auf dem Server mit dem Kommandozeilenprogramm eingerichtet.
            Diese Befehle können Sie an Ihre IT weitergeben.
          </p>
        </div>
        <ul className="space-y-2 font-mono text-xs">
          {[
            ["gbrain connector list", "Zeigt alle Verbindungen und ihren Status."],
            [
              "gbrain connector add advokat-import --watch-dir /imports/advokat",
              "Bindet einen ADVOKAT-Ordner ein.",
            ],
            ["gbrain connector sync <dienst>", "Startet einen einmaligen Abgleich."],
          ].map(([cmd, hint]) => (
            <li
              key={cmd}
              className="rounded-lg border border-[color:var(--ds-border)] bg-[color:var(--ds-surface-2)] px-3 py-2"
            >
              <div className="overflow-x-auto whitespace-nowrap text-[color:var(--ds-text)]">
                {cmd}
              </div>
              <div className="mt-0.5 font-sans text-[color:var(--ds-text-muted)]">{hint}</div>
            </li>
          ))}
        </ul>
      </section>

      {/* Übersicht der Datenquellen */}
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold text-[color:var(--ds-text)]">
            {t("connectors.coverage_matrix" as DashboardKey)}
          </h2>
          <p className="text-xs text-[color:var(--ds-text-muted)]">
            Welche Datenquellen Subsumio anbinden kann und wie.
          </p>
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setShowCoverage(!showCoverage)}
          aria-expanded={showCoverage}
          className="text-xs whitespace-nowrap"
        >
          {showCoverage
            ? t("connectors.hide" as DashboardKey)
            : t("connectors.show" as DashboardKey)}
        </Button>
      </div>

      {showCoverage && <CoverageMatrix />}

      {/* DMS-Anbindung pro Kanzlei — Einrichten/Ändern nur für Administratoren */}
      {isAdmin && <DmsConfigPanel />}

      {/* WP-8.53: OneDrive/SharePoint — DMS-Browser (Suche/Ordner/Import) */}
      <div className="flex items-center justify-between rounded-xl border [border-color:var(--ds-border)] p-4 [background:var(--ds-surface)]">
        <div>
          <h3 className="text-sm font-semibold">{t("connectors.dms_title" as DashboardKey)}</h3>
          <p className="mt-1 text-xs [color:var(--ds-text-muted)]">
            {t("connectors.dms_hint" as DashboardKey)}
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={() => setShowDmsBrowser(true)}>
          {t("connectors.dms_open" as DashboardKey)}
        </Button>
      </div>
      <DmsBrowserDialog open={showDmsBrowser} onOpenChange={setShowDmsBrowser} />
    </div>
  );
}

function CoverageMatrix() {
  const { t } = useLang();
  const me = useMe();
  const jurisdiction = me.data?.user?.jurisdiction ?? me.data?.demo?.jurisdiction?.toUpperCase();
  const hidden = hiddenCoverageFor(jurisdiction);
  const fullMatrix = getCoverageMatrix();
  const connectors = fullMatrix.connectors.filter((c) => !hidden.has(c.id));

  const statusColors: Record<string, string> = {
    available: "text-[color:var(--ds-success-text)]",
    beta: "text-[color:var(--ds-warning-text)]",
    planned: "text-[color:var(--ds-text-muted)]",
    not_applicable: "text-[color:var(--ds-text-subtle)]",
  };

  const statusLabels: Record<string, string> = {
    available: t("connectors.status_available" as DashboardKey),
    beta: "Erprobung",
    planned: t("connectors.status_planned" as DashboardKey),
    not_applicable: "Nicht anwendbar",
  };

  const check = (on: boolean) =>
    on ? (
      <CheckCircle2 size={12} className="text-[color:var(--ds-success-text)]" aria-label="Ja" />
    ) : (
      <span className="text-[color:var(--ds-text-subtle)]" aria-label="Nein">
        —
      </span>
    );

  return (
    <div className="overflow-x-auto rounded-xl border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)]">
      <table className="w-full text-xs">
        <thead>
          <tr className="border-b border-[color:var(--ds-border)] text-left text-[color:var(--ds-text-muted)]">
            <th className="px-3 py-2 font-medium">
              {t("connectors.col_connector" as DashboardKey)}
            </th>
            <th className="px-3 py-2 font-medium">Status</th>
            <th className="hidden px-3 py-2 font-medium md:table-cell">Abgleich</th>
            <th className="hidden px-3 py-2 font-medium lg:table-cell">Anbindung</th>
            <th className="hidden px-3 py-2 font-medium sm:table-cell">Personenbezogen</th>
            <th className="hidden px-3 py-2 font-medium sm:table-cell">
              {t("connectors.col_matter" as DashboardKey)}
            </th>
          </tr>
        </thead>
        <tbody>
          {connectors.map((c: ConnectorCoverageEntry) => (
            <tr key={c.id} className="border-b border-[color:var(--ds-border)] last:border-0">
              <td className="px-3 py-2">
                <div className="font-medium text-[color:var(--ds-text)]">{c.name}</div>
                <div className="text-xs text-[color:var(--ds-text-subtle)]">
                  {CATEGORY_LABEL[c.category] ?? c.category}
                </div>
              </td>
              <td className="px-3 py-2 whitespace-nowrap">
                <span className={cn("font-medium", statusColors[c.status])}>
                  {statusLabels[c.status]}
                </span>
                {c.status === "available" && (
                  <div className="mt-0.5 text-[10px] text-[color:var(--ds-text-subtle)]">
                    {isWebSelfServiceConnector(c.id)
                      ? "Im Dashboard einrichten"
                      : "Nur über IT (Kommandozeile)"}
                  </div>
                )}
              </td>
              <td className="hidden px-3 py-2 text-[color:var(--ds-text-muted)] md:table-cell">
                {SYNC_MODE_LABEL[c.sync_mode] ?? c.sync_mode}
              </td>
              <td className="hidden px-3 py-2 text-[color:var(--ds-text-muted)] lg:table-cell">
                {AUTH_LABEL[c.auth_method] ?? c.auth_method}
              </td>
              <td className="hidden px-3 py-2 sm:table-cell">{check(c.gdpr_relevant)}</td>
              <td className="hidden px-3 py-2 sm:table-cell">{check(c.matter_scope)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
