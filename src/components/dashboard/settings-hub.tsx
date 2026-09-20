"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import type { LucideIcon } from "lucide-react";
import {
  AlertCircle,
  Briefcase,
  Building2,
  Cpu,
  CreditCard,
  Database,
  Download,
  FileInput,
  FileText,
  History,
  Key,
  Lock,
  Mail,
  Moon,
  Network,
  Plug,
  Radar,
  Rocket,
  Scale,
  Search,
  Shield,
  ShieldCheck,
  Timer,
  User,
  Users,
  Webhook,
  Workflow,
  Brain,
} from "lucide-react";
import { useLang } from "@/lib/use-lang";

type Bilingual = { de: string; en: string };

type SettingsTile = {
  id: string;
  label: Bilingual;
  desc: Bilingual;
  icon: LucideIcon;
  href: string;
  allowed: string[];
  /** Extra search terms (both languages) so a partner finds "UID" or "Stundensatz". */
  keywords?: string;
};

type SettingsGroup = {
  id: string;
  label: Bilingual;
  tiles: SettingsTile[];
};

const ALL = ["admin", "lawyer", "assistant", "client_viewer"];
const STAFF = ["admin", "lawyer", "assistant"];
const LEAD = ["admin", "lawyer"];
const ADMIN = ["admin"];

/**
 * The settings hub lists only things a firm configures — grouped the way a partner thinks
 * about them (Kanzlei, people, security, integrations, billing). Work surfaces (Akten,
 * Abläufe, Beobachtung …) live in the sidebar, not here.
 */
export const SETTINGS_GROUPS: SettingsGroup[] = [
  {
    id: "kanzlei",
    label: { de: "Kanzlei", en: "Firm" },
    tiles: [
      {
        id: "kanzlei-profile",
        label: { de: "Kanzleiprofil", en: "Firm profile" },
        desc: {
          de: "Name, Anschrift, UID-Nummer und Bankverbindung für Briefkopf und Rechnungen.",
          en: "Name, address, VAT ID and bank details for letterhead and invoices.",
        },
        icon: Building2,
        href: "/dashboard/settings/kanzlei",
        allowed: LEAD,
        keywords: "stammdaten adresse uid iban logo rechtsraum gehirn lernt mit lernen",
      },
      {
        id: "billing-settings",
        label: { de: "Verrechnung und E-Rechnung", en: "Billing and e-invoicing" },
        desc: {
          de: "Stundensatz, Abrechnungstakt, Tarif nach RATG, Zahlungsziel und Rechnungsversand.",
          en: "Hourly rate, billing increment, RATG tariff, payment terms and invoice delivery.",
        },
        icon: Briefcase,
        href: "/dashboard/settings?tab=kanzlei",
        allowed: STAFF,
        keywords: "stundensatz ratg honorar rechnung zahlungsziel kleinunternehmer smtp",
      },
      {
        id: "mailbox",
        label: { de: "E-Mail-Postfach", en: "Mailbox" },
        desc: {
          de: "Kanzleipostfach verbinden: eingehende E-Mails landen automatisch in der richtigen Akte.",
          en: "Connect the firm mailbox: incoming e-mail is filed to the right matter automatically.",
        },
        icon: Mail,
        href: "/dashboard/settings/email",
        allowed: ADMIN,
        keywords: "imap outlook microsoft gmail",
      },
      {
        id: "onboarding",
        label: { de: "Ersteinrichtung", en: "Initial setup" },
        desc: {
          de: "Geführte Einrichtung in wenigen Schritten – jederzeit erneut aufrufbar.",
          en: "Guided setup in a few steps – can be reopened at any time.",
        },
        icon: Rocket,
        href: "/dashboard/onboarding",
        allowed: ADMIN,
      },
      {
        id: "import",
        label: { de: "Daten übernehmen", en: "Import data" },
        desc: {
          de: "Akten, Kontakte, Fristen und Zeiten aus Ihrer bisherigen Kanzleisoftware übernehmen.",
          en: "Import matters, contacts, deadlines and time entries from your previous software.",
        },
        icon: FileInput,
        href: "/dashboard/import-kanzlei",
        allowed: ADMIN,
        keywords: "import ra-micro advoware excel csv migration",
      },
    ],
  },
  {
    id: "people",
    label: { de: "Benutzer und Rollen", en: "Users and roles" },
    tiles: [
      {
        id: "team",
        label: { de: "Team", en: "Team" },
        desc: {
          de: "Kolleginnen und Kollegen einladen, Rollen vergeben und Zugänge entfernen.",
          en: "Invite colleagues, assign roles and remove access.",
        },
        icon: Users,
        href: "/dashboard/team",
        allowed: ADMIN,
        keywords: "mitarbeiter einladen rolle",
      },
      {
        id: "acls",
        label: { de: "Zugriffsrechte", en: "Access rights" },
        desc: {
          de: "Festlegen, wer welche Akten und Dokumente sehen darf – auch Sperren bei Interessenkonflikten.",
          en: "Define who may see which matters and documents – including conflict-of-interest walls.",
        },
        icon: Shield,
        href: "/dashboard/settings?tab=acls",
        allowed: ADMIN,
        keywords: "berechtigung ethical wall interessenkonflikt",
      },
      {
        id: "approvals",
        label: { de: "Freigaben", en: "Approvals" },
        desc: {
          de: "Vorschläge des Assistenten werden erst nach Freigabe durch eine berechtigte Person wirksam.",
          en: "Assistant suggestions take effect only after approval by an authorised person.",
        },
        icon: ShieldCheck,
        href: "/dashboard/approvals",
        allowed: LEAD,
      },
      {
        id: "scim",
        label: { de: "Benutzerabgleich (SCIM)", en: "User sync (SCIM)" },
        desc: {
          de: "Mitarbeiter automatisch aus Ihrem Benutzerverzeichnis übernehmen, etwa Microsoft Entra ID.",
          en: "Take over staff automatically from your user directory, e.g. Microsoft Entra ID.",
        },
        icon: Network,
        href: "/dashboard/settings/scim",
        allowed: ADMIN,
        keywords: "entra azure active directory workos",
      },
    ],
  },
  {
    id: "security",
    label: { de: "Sicherheit und Datenschutz", en: "Security and privacy" },
    tiles: [
      {
        id: "security",
        label: { de: "Anmeldung und Zwei-Faktor", en: "Sign-in and two-factor" },
        desc: {
          de: "Ihre Anmeldung mit einem Code aus einer Authenticator-App zusätzlich schützen.",
          en: "Protect your sign-in with an additional code from an authenticator app.",
        },
        icon: Lock,
        href: "/dashboard/settings/security",
        allowed: ALL,
        keywords: "2fa passwort totp",
      },
      {
        id: "compliance",
        label: { de: "Compliance-Selbstauskunft", en: "Compliance self-assessment" },
        desc: {
          de: "Checkliste zu DSGVO, Geldwäscheprävention (§§ 8a ff RAO) und Buchführung.",
          en: "Checklist for GDPR, anti-money-laundering (§§ 8a ff RAO) and bookkeeping.",
        },
        icon: Scale,
        href: "/dashboard/compliance",
        allowed: LEAD,
        keywords: "dsgvo rao geldwäsche",
      },
      {
        id: "retention",
        label: { de: "Aufbewahrung und Löschung", en: "Retention and deletion" },
        desc: {
          de: "Aufbewahrungsfristen Ihrer Akten nach DSGVO und BAO im Blick behalten.",
          en: "Keep track of retention periods for your matters under GDPR and BAO.",
        },
        icon: Timer,
        href: "/dashboard/compliance/retention",
        allowed: ADMIN,
        keywords: "löschfristen aufbewahrungsfrist",
      },
      {
        id: "ai-act",
        label: { de: "KI-Verordnung", en: "AI Act" },
        desc: {
          de: "Dokumentation zur Einstufung nach der EU-KI-Verordnung (VO 2024/1689).",
          en: "Documentation on classification under the EU AI Act (Reg. 2024/1689).",
        },
        icon: FileText,
        href: "/dashboard/compliance/ai-act",
        allowed: ADMIN,
        keywords: "ai act",
      },
      {
        id: "audit",
        label: { de: "Änderungsprotokoll", en: "Activity log" },
        desc: {
          de: "Nachvollziehen, wer wann was in der Kanzlei geändert hat (nur lesend).",
          en: "See who changed what and when in the firm (read-only).",
        },
        icon: History,
        href: "/dashboard/audit",
        allowed: ADMIN,
        keywords: "audit log protokoll",
      },
      {
        id: "data-export",
        label: { de: "Datenexport", en: "Data export" },
        desc: {
          de: "Strukturierte Kanzleidaten als Datei herunterladen – etwa nach Art. 20 DSGVO.",
          en: "Download structured firm data as a file – e.g. under Art. 20 GDPR.",
        },
        icon: Download,
        href: "/dashboard/data-export",
        allowed: ADMIN,
        keywords: "backup dsgvo",
      },
    ],
  },
  {
    id: "integrations",
    label: { de: "Integrationen", en: "Integrations" },
    tiles: [
      {
        id: "connectors",
        label: { de: "Verbindungen", en: "Connections" },
        desc: {
          de: "Externe Datenquellen anbinden, deren Inhalte ins Kanzleiwissen übernommen werden.",
          en: "Connect external data sources whose content flows into the firm knowledge.",
        },
        icon: Plug,
        href: "/dashboard/connectors",
        allowed: ADMIN,
        keywords: "konnektoren connector",
      },
      {
        id: "word",
        label: { de: "Word-Add-in", en: "Word add-in" },
        desc: {
          de: "Schriftsätze und Textbausteine aus Subsumio direkt in Microsoft Word einfügen.",
          en: "Insert briefs and text blocks from Subsumio directly into Microsoft Word.",
        },
        icon: FileText,
        href: "/dashboard/word-addin",
        allowed: STAFF,
        keywords: "microsoft office",
      },
      {
        id: "api-keys",
        label: { de: "Schnittstellen-Schlüssel", en: "API keys" },
        desc: {
          de: "Anderen Programmen kontrollierten Zugriff auf Subsumio geben (API-Schlüssel).",
          en: "Give other programs controlled access to Subsumio (API keys).",
        },
        icon: Key,
        href: "/dashboard/api-keys",
        allowed: ADMIN,
        keywords: "api",
      },
      {
        id: "webhooks",
        label: { de: "Webhooks", en: "Webhooks" },
        desc: {
          de: "Andere Programme automatisch benachrichtigen, wenn in Subsumio etwas passiert.",
          en: "Notify other programs automatically when something happens in Subsumio.",
        },
        icon: Webhook,
        href: "/dashboard/settings/webhooks",
        allowed: ADMIN,
      },
      {
        id: "rciid",
        label: { de: "Krypto-Forensik (RCIID)", en: "Crypto forensics (RCIID)" },
        desc: {
          de: "Status der Verbindung zum Forensik-Dienst für Krypto-Wallets in Akten.",
          en: "Status of the connection to the forensics service for crypto wallets in matters.",
        },
        icon: Radar,
        href: "/dashboard/settings/rciid",
        allowed: ADMIN,
        keywords: "wallet bitcoin",
      },
    ],
  },
  {
    id: "ai",
    label: { de: "KI und Kanzleiwissen", en: "AI and firm knowledge" },
    tiles: [
      {
        id: "ai-model",
        label: { de: "KI-Modell", en: "AI model" },
        desc: {
          de: "Welches Modell Assistent, Dokumentanalyse und Entwürfe standardmäßig verwenden.",
          en: "Which model the assistant, document analysis and drafts use by default.",
        },
        icon: Cpu,
        href: "/dashboard/settings/ai-model",
        allowed: ADMIN,
        keywords: "claude mistral modell",
      },
      {
        id: "ai-keys",
        label: { de: "Zugangsschlüssel der KI-Anbieter", en: "AI provider keys" },
        desc: {
          de: "Eigene Schlüssel für OpenAI, Anthropic oder ZeroEntropy hinterlegen (verschlüsselt gespeichert).",
          en: "Store your own keys for OpenAI, Anthropic or ZeroEntropy (stored encrypted).",
        },
        icon: Key,
        href: "/dashboard/settings?tab=api",
        allowed: ADMIN,
        keywords: "openai anthropic api key",
      },
      {
        id: "memory",
        label: { de: "Gedächtnis des Assistenten", en: "Assistant memory" },
        desc: {
          de: "Vorgaben und Fakten, die der Assistent in jedem Gespräch berücksichtigt.",
          en: "Rules and facts the assistant applies in every conversation.",
        },
        icon: Brain,
        href: "/dashboard/settings/memory",
        allowed: STAFF,
        keywords: "erinnerung präferenz anweisung",
      },
      {
        id: "dream",
        label: { de: "Nächtliche Konsolidierung", en: "Nightly consolidation" },
        desc: {
          de: "Nachts Doppelungen zusammenführen, Verweise ergänzen und das Kanzleiwissen aufräumen.",
          en: "Merge duplicates, add links and tidy the firm knowledge overnight.",
        },
        icon: Moon,
        href: "/dashboard/settings?tab=dream",
        allowed: ADMIN,
      },
      {
        id: "knowledge",
        label: { de: "Verbindung zum Kanzleiwissen", en: "Knowledge connection" },
        desc: {
          de: "Prüfen, ob die Wissensdatenbank Ihrer Kanzlei erreichbar ist.",
          en: "Check whether your firm's knowledge base is reachable.",
        },
        icon: Database,
        href: "/dashboard/settings?tab=brain",
        allowed: ADMIN,
        keywords: "brain engine",
      },
      {
        id: "workflows",
        label: { de: "Abläufe und Automatisierungen", en: "Workflows and automations" },
        desc: {
          de: "Wiederkehrende Kanzleischritte verketten – risikoreiche Schritte nur mit Freigabe.",
          en: "Chain recurring firm steps – risky steps only with approval.",
        },
        icon: Workflow,
        href: "/dashboard/workflows",
        allowed: LEAD,
        keywords: "workflow agent automatisierung",
      },
    ],
  },
  {
    id: "account",
    label: { de: "Konto und Abrechnung", en: "Account and billing" },
    tiles: [
      {
        id: "account",
        label: { de: "Mein Konto", en: "My account" },
        desc: {
          de: "Sprache, Tastaturkürzel, Nutzung Ihres Plans und Empfehlungen.",
          en: "Language, keyboard shortcuts, plan usage and referrals.",
        },
        icon: User,
        href: "/dashboard/settings?tab=account",
        allowed: ALL,
        keywords: "sprache language profil",
      },
      {
        id: "billing",
        label: { de: "Plan und Abo", en: "Plan and subscription" },
        desc: {
          de: "Abonnement, Zahlungsmethode und Rechnungen von Subsumio verwalten.",
          en: "Manage your Subsumio subscription, payment method and invoices.",
        },
        icon: CreditCard,
        href: "/dashboard/billing",
        allowed: LEAD,
        keywords: "abo zahlung upgrade",
      },
    ],
  },
];

interface NotifHealth {
  channels: Array<{ channel: string; configured: boolean; detail?: string }>;
  all_configured: boolean;
  any_configured: boolean;
}

export function SettingsHub({ userRole }: { userRole: string }) {
  const { t, lang } = useLang();
  const pick = (b: Bilingual) => (lang === "en" ? b.en : b.de);
  const [search, setSearch] = useState("");
  const [notifHealth, setNotifHealth] = useState<NotifHealth | null>(null);

  useEffect(() => {
    fetch("/api/notifications/health")
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (data?.data) setNotifHealth(data.data as NotifHealth);
      })
      .catch(() => {});
  }, []);

  const mailWarning = notifHealth !== null && !notifHealth.all_configured;
  const q = search.toLowerCase().trim();

  const groups = SETTINGS_GROUPS.map((group) => ({
    ...group,
    tiles: group.tiles.filter((tile) => {
      if (!tile.allowed.includes(userRole)) return false;
      if (!q) return true;
      const haystack = [
        tile.label.de,
        tile.label.en,
        tile.desc.de,
        tile.desc.en,
        tile.keywords ?? "",
      ]
        .join(" ")
        .toLowerCase();
      return haystack.includes(q);
    }),
  })).filter((group) => group.tiles.length > 0);

  return (
    <div className="space-y-8">
      <div className="relative max-w-md">
        <Search
          size={16}
          aria-hidden
          className="absolute top-1/2 left-3 -translate-y-1/2 text-[color:var(--ds-text-muted)]"
        />
        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          aria-label={t("settings.hub_search_placeholder")}
          placeholder={t("settings.hub_search_placeholder")}
          className="w-full rounded-lg border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] py-2.5 pr-3 pl-9 text-sm text-[color:var(--ds-text)] transition-[background-color,border-color,color] placeholder:text-[color:var(--ds-text-muted)] focus:border-[color:var(--brand-primary)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-primary)] focus-visible:ring-offset-1 motion-reduce:transition-none"
        />
      </div>

      {groups.length === 0 && q && (
        <p className="py-8 text-center text-sm text-[color:var(--ds-text-muted)]">
          {t("settings.hub_no_results")}
        </p>
      )}

      {groups.map((group) => (
        <section
          key={group.id}
          aria-labelledby={`settings-group-${group.id}`}
          className="space-y-3"
        >
          <h2
            id={`settings-group-${group.id}`}
            className="text-xs font-semibold tracking-wide text-[color:var(--ds-text-subtle)] uppercase"
          >
            {pick(group.label)}
          </h2>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {group.tiles.map((tile) => {
              const Icon = tile.icon;
              const showMailWarning = mailWarning && tile.id === "billing-settings";
              return (
                <Link
                  key={tile.id}
                  href={tile.href}
                  className="group flex items-start gap-4 rounded-xl border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] p-4 transition-[border-color,box-shadow] duration-[var(--ds-duration-normal)] ease-[cubic-bezier(0.32,0.72,0,1)] hover:border-[color:var(--ds-border-hover)] hover:shadow-md focus-visible:ring-2 focus-visible:ring-[var(--brand-primary)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--ds-surface)] focus-visible:outline-none motion-reduce:transition-none"
                >
                  <div className="group-hover:brand-soft group-hover:brand-border flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-[color:var(--ds-border)] bg-[color:var(--ds-surface-2)] transition-[border-color,background-color] duration-[var(--ds-duration-normal)] motion-reduce:transition-none">
                    <Icon
                      size={18}
                      aria-hidden
                      className="group-hover:brand-text text-[color:var(--ds-text-muted)] transition-[color] duration-[var(--ds-duration-normal)] motion-reduce:transition-none"
                    />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-sm font-semibold text-[color:var(--ds-text)]">
                        {pick(tile.label)}
                      </p>
                      {showMailWarning && (
                        <span
                          title={t("settings.notification_warning_tooltip")}
                          className="inline-flex items-center gap-1 rounded-full border border-[color:var(--ds-warning-border)] bg-[color:var(--ds-warning-bg)] px-1.5 py-0.5 text-[10px] font-medium whitespace-nowrap text-[color:var(--ds-warning-text)]"
                        >
                          <AlertCircle size={10} aria-hidden />
                          {t("settings.notification_warning_label")}
                        </span>
                      )}
                    </div>
                    <p className="mt-1 text-xs leading-relaxed text-[color:var(--ds-text-muted)]">
                      {pick(tile.desc)}
                    </p>
                  </div>
                </Link>
              );
            })}
          </div>
        </section>
      ))}
    </div>
  );
}
