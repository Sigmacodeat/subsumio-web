"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useLang } from "@/lib/use-lang";
import {
  ShieldAlert,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Lock,
  Loader2,
  Info,
  Archive,
  ClipboardCheck,
  EyeOff,
  Database,
  FileClock,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { api } from "@/lib/api";
import { cn } from "@/lib/utils";
import { PageHeader } from "@/components/dashboard/page-header";

type CheckStatus = "ok" | "warn" | "fail";

interface ComplianceCheck {
  id: string;
  category: string;
  label: string;
  description: string;
}

// Die Checklisten-DEFINITION ist statisch (Art./§-Katalog). Der STATUS jeder
// Position ist eine Selbsteinschätzung der Kanzlei — er wird pro Brain auf
// der Seite `legal/compliance/selbstauskunft` persistiert, nicht simuliert.
const DSGVO_CHECKS: ComplianceCheck[] = [
  {
    id: "dsgvo-1",
    category: "Rechtsgrundlage",
    label: "Rechtsgrundlage dokumentiert",
    description: "Für jede Verarbeitung ist eine Rechtsgrundlage nach Art. 6 DSGVO festgelegt",
  },
  {
    id: "dsgvo-2",
    category: "Rechtsgrundlage",
    label: "Einwilligungen nachweisbar",
    description: "Einwilligungen sind dokumentiert und widerrufbar (Art. 7 DSGVO)",
  },
  {
    id: "dsgvo-3",
    category: "Betroffenenrechte",
    label: "Auskunftsverfahren",
    description: "Verfahren für Betroffenenanfragen (Art. 15 DSGVO)",
  },
  {
    id: "dsgvo-4",
    category: "Betroffenenrechte",
    label: "Löschungsverfahren",
    description: "Verfahren für Löschungsanfragen (Art. 17 DSGVO)",
  },
  {
    id: "dsgvo-5",
    category: "Dokumentation",
    label: "Verzeichnis der Verarbeitungstätigkeiten",
    description: "Art. 30 DSGVO — Verarbeitungsverzeichnis geführt",
  },
  {
    id: "dsgvo-6",
    category: "Dokumentation",
    label: "Datenschutz-Folgenabschätzung",
    description: "DSFA bei risikoreichen Verarbeitungen (Art. 35 DSGVO)",
  },
  {
    id: "dsgvo-7",
    category: "Technisch",
    label: "Pseudonymisierung",
    description: "Technische Maßnahmen zur Pseudonymisierung (Art. 32 DSGVO)",
  },
  {
    id: "dsgvo-8",
    category: "Technisch",
    label: "Verschlüsselung",
    description: "Verschlüsselung personenbezogener Daten (Art. 32 DSGVO)",
  },
  {
    id: "dsgvo-9",
    category: "Organisatorisch",
    label: "Zugriffskontrolle",
    description: "Berechtigungskonzept implementiert",
  },
  {
    id: "dsgvo-10",
    category: "Organisatorisch",
    label: "Schulung der Mitarbeiter",
    description: "Regelmäßige Datenschutz-Schulung",
  },
];

const GWG_CHECKS: ComplianceCheck[] = [
  {
    id: "gwg-1",
    category: "Identifizierung",
    label: "Mandantenidentifizierung",
    description: "Identitätsprüfung neuer Mandanten (§ 11 GwG)",
  },
  {
    id: "gwg-2",
    category: "Identifizierung",
    label: "Wirtschaftlicher Eigentümer",
    description: "Ermittlung des wirtschaftlichen Eigentümers (§ 3 GwG)",
  },
  {
    id: "gwg-3",
    category: "Screening",
    label: "Sanktionslistenprüfung",
    description: "Prüfung gegen EU-Sanktionslisten",
  },
  {
    id: "gwg-4",
    category: "Screening",
    label: "PEP-Prüfung",
    description: "Politically Exposed Persons Screening (§ 15 GwG)",
  },
  {
    id: "gwg-5",
    category: "Dokumentation",
    label: "Verdachtsanzeigen",
    description: "Verfahren für Verdachtsmeldungen nach § 43 GwG",
  },
  {
    id: "gwg-6",
    category: "Dokumentation",
    label: "Aufbewahrungspflichten",
    description: "Unterlagen werden 5 Jahre aufbewahrt (§ 8 GwG)",
  },
];

// GoBD-Checkliste für die Steuer-Vertikale. Die Engine liefert mit gobd.ts
// bereits Bausteine (Aufbewahrungsfrist-Stempel + Hash-Manipulations-Evidenz auf
// Belegen); volle Konformität verlangt zusätzlich diese organisatorischen Punkte
// + Verfahrensdokumentation + Prüfer-Abnahme. Status ist Selbsteinschätzung.
const GOBD_CHECKS: ComplianceCheck[] = [
  {
    id: "gobd-1",
    category: "Unveränderbarkeit",
    label: "Belege unveränderbar gespeichert",
    description:
      "Nachträgliche Änderungen ausgeschlossen oder protokolliert; Belege tragen einen Inhalts-Hash (§ 146 Abs. 4 AO, GoBD Rz. 107 ff.)",
  },
  {
    id: "gobd-2",
    category: "Aufbewahrung",
    label: "10-Jahre-Aufbewahrung",
    description:
      "Buchungsbelege werden 10 Jahre aufbewahrt; Frist je Beleg vermerkt (§ 147 Abs. 3 AO)",
  },
  {
    id: "gobd-3",
    category: "Nachvollziehbarkeit",
    label: "Belegfunktion & Nachvollziehbarkeit",
    description: "Jede Buchung ist durch einen Beleg nachvollziehbar (GoBD Rz. 36 ff.)",
  },
  {
    id: "gobd-4",
    category: "Dokumentation",
    label: "Verfahrensdokumentation",
    description:
      "Verfahrensdokumentation beschreibt den DV-gestützten Ablage- und Buchungsprozess (GoBD Rz. 151 ff.)",
  },
  {
    id: "gobd-5",
    category: "Auswertbarkeit",
    label: "Maschinelle Auswertbarkeit",
    description:
      "Steuerlich relevante Daten sind maschinell auswertbar/exportierbar — z. B. DATEV-Export (GoBD Rz. 126 ff.)",
  },
  {
    id: "gobd-6",
    category: "Kontrolle",
    label: "Internes Kontrollsystem",
    description: "IKS zur Sicherung der Ordnungsmäßigkeit eingerichtet (GoBD Rz. 100 ff.)",
  },
  {
    id: "gobd-7",
    category: "Sicherheit",
    label: "Datensicherheit & Zugriffsschutz",
    description: "Schutz vor Verlust und unberechtigtem Zugriff (GoBD Rz. 103 ff.)",
  },
];

const STATE_SLUG = "legal/compliance/selbstauskunft";
const STATUS_CYCLE: CheckStatus[] = ["ok", "warn", "fail"];

const STATUS_LABEL: Record<CheckStatus, string> = { ok: "OK", warn: "Offen", fail: "Fehlt" };

export default function CompliancePage() {
  const { t } = useLang();
  const [activeTab, setActiveTab] = useState<"dsgvo" | "gwg" | "gobd">("dsgvo");
  const [statuses, setStatuses] = useState<Record<string, CheckStatus>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const page = await api.brain.getPage(STATE_SLUG);
        const fm = (page.frontmatter ?? {}) as Record<string, unknown>;
        const stored = fm.check_statuses;
        if (!cancelled && stored && typeof stored === "object") {
          setStatuses(stored as Record<string, CheckStatus>);
        }
      } catch {
        // Seite existiert noch nicht — alle Checks starten als "warn" (offen)
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const persist = useCallback(
    async (next: Record<string, CheckStatus>) => {
      setSaving(true);
      setSaveError(null);
      try {
        await api.brain.updatePage({
          slug: STATE_SLUG,
          title: "Compliance-Selbstauskunft",
          type: "document",
          frontmatter: {
            check_statuses: next,
            updated_via: "dashboard",
          },
        });
      } catch {
        setSaveError(t("compliance.error_save"));
      } finally {
        setSaving(false);
      }
    },
    [t]
  );

  function cycleStatus(id: string) {
    setStatuses((prev) => {
      const current = prev[id] ?? "warn";
      const nextStatus = STATUS_CYCLE[(STATUS_CYCLE.indexOf(current) + 1) % STATUS_CYCLE.length];
      const next = { ...prev, [id]: nextStatus };
      void persist(next);
      return next;
    });
  }

  const checks =
    activeTab === "dsgvo" ? DSGVO_CHECKS : activeTab === "gwg" ? GWG_CHECKS : GOBD_CHECKS;
  const statusOf = (c: ComplianceCheck): CheckStatus => statuses[c.id] ?? "warn";
  const okCount = checks.filter((c) => statusOf(c) === "ok").length;
  const warnCount = checks.filter((c) => statusOf(c) === "warn").length;
  const failCount = checks.filter((c) => statusOf(c) === "fail").length;

  return (
    <div className="mx-auto max-w-4xl space-y-6 p-4 md:p-8">
      <PageHeader
        title="Compliance-Selbstauskunft"
        description="DSGVO-, GwG- & GoBD-Checkliste für die Kanzlei — Status pro Punkt selbst pflegen"
        breadcrumbs={[{ label: "Dashboard", href: "/dashboard" }, { label: "Compliance" }]}
      />

      <div className="grid gap-2 sm:grid-cols-4">
        <HubLink
          href="/dashboard/verfahrensdoku"
          icon={ClipboardCheck}
          label={t("nav.verfahrensdoku")}
        />
        <HubLink
          href="/dashboard/compliance/retention"
          icon={FileClock}
          label={t("nav.retention")}
        />
        <HubLink href="/dashboard/anonymize" icon={EyeOff} label={t("nav.anonymize")} />
        <HubLink href="/dashboard/data-export" icon={Database} label={t("nav.data_export")} />
      </div>

      {/* Honest framing: this is a maintained checklist, not an automated audit */}
      <div
        className="flex items-start gap-3 rounded-xl border border-amber-500/20 bg-amber-500/5 px-4 py-3"
        role="note"
      >
        <Info size={16} className="mt-0.5 shrink-0 text-amber-600" aria-hidden="true" />
        <p className="text-xs leading-relaxed text-amber-600">
          Diese Checkliste ist eine <strong>Selbsteinschätzung</strong> und wird im Brain
          gespeichert. Sie ersetzt keine Datenschutz-Beratung und keine automatische Prüfung. Klicke
          auf einen Punkt, um den Status zu ändern (OK → Offen → Fehlt).
        </p>
      </div>

      {/* Tabs */}
      <div className="flex gap-2" role="tablist" aria-label={t("aria.compliance_area")}>
        <button
          role="tab"
          aria-selected={activeTab === "dsgvo"}
          onClick={() => setActiveTab("dsgvo")}
          className={cn(
            "flex items-center gap-2 rounded-xl border px-4 py-2 text-sm font-medium transition-[background-color,border-color,color,box-shadow,opacity,transform] duration-200 ease-[cubic-bezier(0.32,0.72,0,1)]",
            activeTab === "dsgvo"
              ? "border-emerald-500/30 bg-emerald-600/10 text-emerald-600"
              : "border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] text-[color:var(--ds-text-muted)] hover:text-[color:var(--ds-text)]"
          )}
        >
          <Lock size={14} aria-hidden="true" />
          DSGVO
        </button>
        <button
          role="tab"
          aria-selected={activeTab === "gwg"}
          onClick={() => setActiveTab("gwg")}
          className={cn(
            "flex items-center gap-2 rounded-xl border px-4 py-2 text-sm font-medium transition-[background-color,border-color,color,box-shadow,opacity,transform] duration-200 ease-[cubic-bezier(0.32,0.72,0,1)]",
            activeTab === "gwg"
              ? "border-blue-500/30 bg-blue-600/10 text-blue-600"
              : "border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] text-[color:var(--ds-text-muted)] hover:text-[color:var(--ds-text)]"
          )}
        >
          <ShieldAlert size={14} aria-hidden="true" />
          GwG
        </button>
        <button
          role="tab"
          aria-selected={activeTab === "gobd"}
          onClick={() => setActiveTab("gobd")}
          className={cn(
            "flex items-center gap-2 rounded-xl border px-4 py-2 text-sm font-medium transition-[background-color,border-color,color,box-shadow,opacity,transform] duration-200 ease-[cubic-bezier(0.32,0.72,0,1)]",
            activeTab === "gobd"
              ? "brand-soft brand-border brand-text"
              : "border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] text-[color:var(--ds-text-muted)] hover:text-[color:var(--ds-text)]"
          )}
        >
          <Archive size={14} aria-hidden="true" />
          GoBD
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-3">
        <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-3 text-center">
          <div className="text-xl font-bold text-emerald-600">{okCount}</div>
          <div className="text-xs text-[color:var(--ds-text-muted)]">OK</div>
        </div>
        <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-3 text-center">
          <div className="text-xl font-bold text-amber-600">{warnCount}</div>
          <div className="text-xs text-[color:var(--ds-text-muted)]">Offen</div>
        </div>
        <div className="rounded-xl border border-red-500/20 bg-red-500/5 p-3 text-center">
          <div className="text-xl font-bold text-red-600">{failCount}</div>
          <div className="text-xs text-[color:var(--ds-text-muted)]">Fehlt</div>
        </div>
      </div>

      {/* Save state */}
      <div aria-live="polite" className="min-h-5 text-xs">
        {saving && (
          <span className="inline-flex items-center gap-1.5 text-[color:var(--ds-text-muted)]">
            <Loader2 size={12} className="animate-spin" aria-hidden="true" /> Speichert…
          </span>
        )}
        {saveError && <span className="text-red-600">{saveError}</span>}
      </div>

      {/* Checks list */}
      {loading ? (
        <div
          className="flex items-center justify-center py-20"
          role="status"
          aria-label={t("aria.checklist_loading")}
        >
          <Loader2 size={24} className="brand-text animate-spin" aria-hidden="true" />
        </div>
      ) : (
        <div className="space-y-2">
          {checks.map((check) => {
            const status = statusOf(check);
            return (
              <button
                key={check.id}
                onClick={() => cycleStatus(check.id)}
                aria-label={`${check.label} — Status: ${STATUS_LABEL[status]}. Klicken zum Ändern.`}
                className={cn(
                  "flex w-full items-start gap-3 rounded-xl border px-4 py-3 text-left transition-[background-color,border-color,color,box-shadow,opacity,transform] duration-200 ease-[cubic-bezier(0.32,0.72,0,1)]",
                  "focus-visible:outline focus-visible:outline-2 focus-visible:outline-[color:var(--brand-primary)]",
                  status === "ok"
                    ? "border-emerald-500/20 bg-emerald-500/5 hover:border-emerald-500/40"
                    : status === "warn"
                      ? "border-amber-500/20 bg-amber-500/5 hover:border-amber-500/40"
                      : "border-red-500/20 bg-red-500/5 hover:border-red-500/40"
                )}
              >
                <div className="mt-0.5 shrink-0" aria-hidden="true">
                  {status === "ok" ? (
                    <CheckCircle2 size={16} className="text-emerald-600" />
                  ) : status === "warn" ? (
                    <AlertTriangle size={16} className="text-amber-600" />
                  ) : (
                    <XCircle size={16} className="text-red-600" />
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-[color:var(--ds-text)]">
                      {check.label}
                    </span>
                    <Badge
                      variant="default"
                      className={cn(
                        "border text-xs",
                        status === "ok"
                          ? "border-emerald-500/20 bg-emerald-500/10 text-emerald-600"
                          : status === "warn"
                            ? "border-amber-500/20 bg-amber-500/10 text-amber-600"
                            : "border-red-500/20 bg-red-500/10 text-red-600"
                      )}
                    >
                      {STATUS_LABEL[status]}
                    </Badge>
                  </div>
                  <p className="mt-1 text-xs text-[color:var(--ds-text-muted)]">
                    {check.description}
                  </p>
                </div>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

function HubLink({
  href,
  icon: Icon,
  label,
}: {
  href: string;
  icon: typeof ShieldAlert;
  label: string;
}) {
  return (
    <Link
      href={href}
      className="flex items-center gap-2 rounded-lg border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] px-3 py-2 text-sm font-medium text-[color:var(--ds-text-muted)] transition-colors hover:bg-[color:var(--ds-hover)] hover:text-[color:var(--ds-text)] focus-visible:ring-2 focus-visible:ring-[var(--brand-primary)] focus-visible:ring-offset-1 focus-visible:ring-offset-[var(--ds-surface)] focus-visible:outline-none"
    >
      <Icon size={15} className="shrink-0" />
      <span className="truncate">{label}</span>
    </Link>
  );
}
