"use client";

import { useEffect, useRef, useState, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { useForm, useWatch } from "react-hook-form";
import { useUnsavedChanges } from "@/lib/use-unsaved-changes";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  Copy,
  Check,
  Eye,
  EyeOff,
  AlertTriangle,
  ExternalLink,
  Gift,
  Euro,
  Users,
  Languages,
  RefreshCw,
  Trash2,
  CheckCircle2,
} from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import {
  loadKanzleiSettings,
  saveKanzleiSettings,
  type KanzleiSettings,
} from "@/lib/kanzlei-settings";
import {
  kanzleiSettingsSchema,
  apiKeysSchema,
  type KanzleiSettingsFormData,
  type ApiKeysFormData,
} from "@/lib/schemas/settings";
import { useMe } from "@/lib/queries/auth";
import {
  useTeam,
  useSettingsApiKeys,
  useSaveSettingsApiKeys,
  useUpdateTeamRole,
} from "@/lib/queries/settings";
import { useBrainStats } from "@/lib/queries/brain";
import { limitsFor } from "@/lib/plans-limits";
import type { Plan } from "@/lib/auth/store";
import { PageHeader } from "@/components/dashboard/page-header";
import { AclSettings } from "@/components/dashboard/acl-settings";
import { useLang } from "@/lib/use-lang";
import { api } from "@/lib/api";
import { SettingsHub } from "@/components/dashboard/settings-hub";
import { csrfFetch } from "@/lib/csrf";

/**
 * Detail views reached from the settings hub (`?tab=…`). The hub is the navigation;
 * a detail view shows one topic with its own title, breadcrumb and one-line description.
 */
const TAB_META: Record<
  string,
  { title: { de: string; en: string }; desc: { de: string; en: string }; allowed: string[] }
> = {
  account: {
    title: { de: "Mein Konto", en: "My account" },
    desc: {
      de: "Plan, Nutzung, Sprache und persönliche Bedienung.",
      en: "Plan, usage, language and personal preferences.",
    },
    allowed: ["admin", "lawyer", "assistant", "client_viewer"],
  },
  brain: {
    title: { de: "Verbindung zum Kanzleiwissen", en: "Knowledge connection" },
    desc: {
      de: "Zeigt, ob die Wissensdatenbank Ihrer Kanzlei erreichbar ist.",
      en: "Shows whether your firm's knowledge base is reachable.",
    },
    allowed: ["admin", "lawyer", "assistant"],
  },
  dream: {
    title: { de: "Nächtliche Konsolidierung", en: "Nightly consolidation" },
    desc: {
      de: "Räumt das Kanzleiwissen jede Nacht automatisch auf.",
      en: "Tidies the firm knowledge automatically every night.",
    },
    allowed: ["admin", "lawyer"],
  },
  kanzlei: {
    title: { de: "Verrechnung und E-Rechnung", en: "Billing and e-invoicing" },
    desc: {
      de: "Stundensätze, Tarif, Zahlungsziel und Versand Ihrer Honorarnoten.",
      en: "Hourly rates, tariff, payment terms and delivery of your invoices.",
    },
    allowed: ["admin", "lawyer", "assistant"],
  },
  team: {
    title: { de: "Rollen im Team", en: "Team roles" },
    desc: {
      de: "Legen Sie fest, welche Rolle jedes Teammitglied hat.",
      en: "Set the role of each team member.",
    },
    allowed: ["admin"],
  },
  api: {
    title: { de: "Zugangsschlüssel der KI-Anbieter", en: "AI provider keys" },
    desc: {
      de: "Eigene Schlüssel für KI-Anbieter hinterlegen – nur nötig, wenn Ihre Kanzlei eigene Verträge nutzt.",
      en: "Store your own AI provider keys – only needed if your firm uses its own contracts.",
    },
    allowed: ["admin"],
  },
  acls: {
    title: { de: "Zugriffsrechte", en: "Access rights" },
    desc: {
      de: "Wer welche Akten und Dokumente sehen darf, einschließlich Sperren bei Interessenkonflikten.",
      en: "Who may see which matters and documents, including conflict-of-interest walls.",
    },
    allowed: ["admin"],
  },
  scim: {
    title: { de: "Benutzerabgleich (SCIM)", en: "User sync (SCIM)" },
    desc: {
      de: "Mitarbeiter automatisch aus dem Benutzerverzeichnis Ihrer Kanzlei übernehmen.",
      en: "Take over staff automatically from your firm's user directory.",
    },
    allowed: ["admin"],
  },
};

const RATE_AREA_LABELS: Record<string, { de: string; en: string }> = {
  allgemein: { de: "Allgemein", en: "General" },
  vertragsrecht: { de: "Vertragsrecht", en: "Contract law" },
  prozessrecht: { de: "Prozessführung", en: "Litigation" },
  arbeitsrecht: { de: "Arbeitsrecht", en: "Employment law" },
  datenschutz: { de: "Datenschutz", en: "Data protection" },
  steuerrecht: { de: "Steuerrecht", en: "Tax law" },
};

function MaskedInput({
  value,
  placeholder,
  onChange,
}: {
  value: string;
  placeholder: string;
  onChange?: (value: string) => void;
}) {
  const [show, setShow] = useState(false);
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    await navigator.clipboard.writeText(value);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="relative flex items-center">
      <input
        type={show ? "text" : "password"}
        value={value || ""}
        placeholder={placeholder}
        onChange={(e) => onChange?.(e.target.value)}
        className="w-full rounded-lg border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] px-3 py-2.5 pr-20 font-mono text-sm text-[color:var(--ds-text)] transition-[background-color,border-color,color] placeholder:text-[color:var(--ds-text-muted)] focus:border-[color:var(--brand-primary)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-primary)] focus-visible:ring-offset-1 motion-reduce:transition-none"
      />
      <div className="absolute right-2 flex items-center gap-1">
        <button
          type="button"
          onClick={() => setShow(!show)}
          aria-label={show ? "Wert verbergen" : "Wert anzeigen"}
          className="rounded-md p-1.5 text-[color:var(--ds-text-muted)] transition-[color,transform] duration-[var(--ds-duration-fast)] hover:text-[color:var(--ds-text-muted)] focus-visible:ring-2 focus-visible:ring-[color:var(--brand-primary)] focus-visible:outline-none active:scale-[0.9] motion-reduce:transition-none"
        >
          {show ? <EyeOff size={13} /> : <Eye size={13} />}
        </button>
        {value && (
          <button
            type="button"
            onClick={copy}
            aria-label="Wert kopieren"
            className="rounded-md p-1.5 text-[color:var(--ds-text-muted)] transition-[color,transform] duration-[var(--ds-duration-fast)] hover:text-[color:var(--ds-text-muted)] focus-visible:ring-2 focus-visible:ring-[color:var(--brand-primary)] focus-visible:outline-none active:scale-[0.9] motion-reduce:transition-none"
          >
            {copied ? (
              <Check size={13} className="text-[color:var(--ds-success-text)]" />
            ) : (
              <Copy size={13} />
            )}
          </button>
        )}
      </div>
    </div>
  );
}

function Field({
  label,
  desc,
  id,
  children,
}: {
  label: string;
  desc?: string;
  id?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="grid grid-cols-1 items-start gap-4 border-b border-[color:var(--ds-border)] py-4 last:border-0 sm:grid-cols-3">
      <div>
        {id ? (
          <label htmlFor={id} className="text-sm font-medium text-[color:var(--ds-text)]">
            {label}
          </label>
        ) : (
          <p className="text-sm font-medium text-[color:var(--ds-text)]">{label}</p>
        )}
        {desc && (
          <p className="mt-0.5 text-xs leading-relaxed text-[color:var(--ds-text-muted)]">{desc}</p>
        )}
      </div>
      <div className="col-span-2">{children}</div>
    </div>
  );
}

export default function SettingsPage() {
  return (
    <Suspense fallback={<div className="p-6" />}>
      <SettingsPageInner />
    </Suspense>
  );
}

function SettingsPageInner() {
  const { t, lang, setLang } = useLang();
  const L = (de: string, en: string) => (lang === "en" ? en : de);
  const searchParams = useSearchParams();
  // Derived from the URL so hub links (?tab=…) switch the view on client-side navigation.
  const activeTab = searchParams.get("tab");
  const [referralUrl, setReferralUrl] = useState("");
  const [referrals, setReferrals] = useState<number | null>(null);
  const [engineStatus, setEngineStatus] = useState<"idle" | "checking" | "online" | "offline">(
    "idle"
  );
  const [keysSaved, setKeysSaved] = useState(false);
  const [kanzleiSaved, setKanzleiSaved] = useState(false);
  const [kanzleiSaveError, setKanzleiSaveError] = useState(false);
  const [keysSaveError, setKeysSaveError] = useState(false);
  // Full saved settings — the billing form only edits a subset, the rest must survive a save.
  const savedKanzleiRef = useRef<KanzleiSettings | null>(null);
  const [dreamDone, setDreamDone] = useState(false);
  const [dreamRunning, setDreamRunning] = useState(false);
  const [dreamError, setDreamError] = useState(false);
  const [singleKeyShortcuts, setSingleKeyShortcuts] = useState(() => {
    if (typeof window === "undefined") return true;
    return localStorage.getItem("single-key-shortcuts") !== "false";
  });

  // Role & team
  const [userRole, setUserRole] = useState<string>("lawyer");
  const [teamMembers, setTeamMembers] = useState<
    Array<{ id: string; name: string | null; email: string; role: string }>
  >([]);

  const meQuery = useMe();
  const teamQuery = useTeam();
  const settingsKeysQuery = useSettingsApiKeys();
  const saveKeysMutation = useSaveSettingsApiKeys();
  const statsQuery = useBrainStats();
  const updateRoleMutation = useUpdateTeamRole();

  const runDreamCycle = async () => {
    setDreamRunning(true);
    setDreamError(false);
    setDreamDone(false);
    try {
      const response = await csrfFetch("/api/brain/dream-cycle", { method: "POST" });
      if (!response.ok) throw new Error(String(response.status));
      setDreamDone(true);
    } catch {
      setDreamError(true);
    } finally {
      setDreamRunning(false);
    }
  };

  // Kanzlei form — RHF + Zod
  const kanzleiForm = useForm<KanzleiSettingsFormData>({
    resolver: zodResolver(kanzleiSettingsSchema) as never,
    defaultValues: {
      kanzleiName: "",
      anwaltName: "",
      kanzleiAdresse: "",
      kanzleiEmail: "",
      kanzleiTelefon: "",
      kammerNummer: "",
      ustId: "",
      stundensatz: "200",
      abrechnungstakt: "15",
      bankName: "",
      iban: "",
      bic: "",
      zahlungszielTage: "14",
      rechnungFooter: t("settings.invoice_footer_default"),
      tarifModell: "custom",
      datevKontenrahmen: "SKR03",
      datevBeraterNr: "",
      datevMandantenNr: "",
      smtpHost: "",
      smtpPort: "587",
      smtpUser: "",
      smtpPassword: "",
      smtpSecure: false,
      emailFrom: "",
      rechtsgebietSaetze: {
        allgemein: 200,
        vertragsrecht: 220,
        prozessrecht: 250,
        arbeitsrecht: 230,
        datenschutz: 280,
        steuerrecht: 260,
      },
      kleinunternehmer: false,
      eInvoiceProfile: "BASIC",
    },
  });

  // API Keys form — RHF + Zod
  const apiKeysForm = useForm<ApiKeysFormData>({
    resolver: zodResolver(apiKeysSchema) as never,
    defaultValues: {
      openaiKey: "",
      anthropicKey: "",
      zeroEntropyKey: "",
    },
  });

  const tarifModellWatch = useWatch({ control: kanzleiForm.control, name: "tarifModell" });

  useUnsavedChanges(kanzleiForm.formState.isDirty || apiKeysForm.formState.isDirty);
  const rechtsgebietSaetzeWatch = useWatch({
    control: kanzleiForm.control,
    name: "rechtsgebietSaetze",
  });

  useEffect(() => {
    if (meQuery.data?.user?.referralCode) {
      setReferralUrl(`${window.location.origin}/?ref=${meQuery.data.user.referralCode}`);
      setReferrals(typeof meQuery.data.referrals === "number" ? meQuery.data.referrals : 0);
    }
    if (meQuery.data?.user?.role) {
      setUserRole(meQuery.data.user.role);
    }
  }, [meQuery.data]);

  useEffect(() => {
    if (teamQuery.data?.members) {
      setTeamMembers(teamQuery.data.members);
    }
  }, [teamQuery.data]);

  useEffect(() => {
    loadKanzleiSettings()
      .then((saved) => {
        savedKanzleiRef.current = saved;
        kanzleiForm.reset({
          kanzleiName: saved.kanzleiName,
          anwaltName: saved.anwaltName,
          kanzleiAdresse: saved.kanzleiAdresse ?? "",
          kanzleiEmail: saved.kanzleiEmail ?? "",
          kanzleiTelefon: saved.kanzleiTelefon ?? "",
          kammerNummer: saved.kammerNummer ?? "",
          ustId: saved.ustId,
          stundensatz: saved.stundensatz,
          abrechnungstakt: saved.abrechnungstakt ?? "15",
          bankName: saved.bankName ?? "",
          iban: saved.iban ?? "",
          bic: saved.bic ?? "",
          zahlungszielTage: saved.zahlungszielTage ?? "14",
          rechnungFooter: saved.rechnungFooter ?? "",
          tarifModell: saved.tarifModell ?? "custom",
          datevKontenrahmen: saved.datevKontenrahmen ?? "SKR03",
          datevBeraterNr: saved.datevBeraterNr ?? "",
          datevMandantenNr: saved.datevMandantenNr ?? "",
          smtpHost: saved.smtpHost ?? "",
          smtpPort: saved.smtpPort ?? "587",
          smtpUser: saved.smtpUser ?? "",
          smtpPassword: saved.smtpPassword ?? "",
          smtpSecure: saved.smtpSecure ?? false,
          emailFrom: saved.emailFrom ?? "",
          rechtsgebietSaetze: saved.rechtsgebietSaetze,
          kleinunternehmer: saved.kleinunternehmer ?? false,
          eInvoiceProfile: saved.eInvoiceProfile ?? "BASIC",
        });
      })
      .catch((err) => {
        console.error(
          "[settings] failed to load saved settings:",
          err instanceof Error ? err.message : String(err)
        );
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (settingsKeysQuery.data) {
      apiKeysForm.reset({
        openaiKey: settingsKeysQuery.data.openaiKey ?? "",
        anthropicKey: settingsKeysQuery.data.anthropicKey ?? "",
        zeroEntropyKey: settingsKeysQuery.data.zeroEntropyKey ?? "",
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settingsKeysQuery.data]);

  useEffect(() => {
    if (activeTab === "brain" && engineStatus === "idle") void checkEngineConnection();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab]);

  async function checkEngineConnection() {
    setEngineStatus("checking");
    try {
      const stats = statsQuery.data ?? (await statsQuery.refetch());
      setEngineStatus(stats ? "online" : "offline");
    } catch (err) {
      console.error(
        "[settings] engine check failed:",
        err instanceof Error ? err.message : String(err)
      );
      setEngineStatus("offline");
    }
  }

  async function saveApiKeys() {
    const data = apiKeysForm.getValues();
    setKeysSaveError(false);
    try {
      const res = (await saveKeysMutation.mutateAsync(data)) as { ok?: boolean } | undefined;
      if (!res?.ok) throw new Error("save_failed");
      setKeysSaved(true);
      setTimeout(() => setKeysSaved(false), 2000);
    } catch (err) {
      setKeysSaveError(true);
      console.error(
        "[settings] failed to save API keys:",
        err instanceof Error ? err.message : String(err)
      );
    }
  }

  async function saveKanzleiProfile() {
    setKanzleiSaveError(false);
    const isValid = await kanzleiForm.trigger();
    if (!isValid) return;
    const data = kanzleiForm.getValues();
    const settings: KanzleiSettings = {
      ...(savedKanzleiRef.current ?? {}),
      kanzleiName: data.kanzleiName,
      anwaltName: data.anwaltName,
      kanzleiAdresse: data.kanzleiAdresse,
      kanzleiEmail: data.kanzleiEmail,
      kanzleiTelefon: data.kanzleiTelefon,
      kammerNummer: data.kammerNummer,
      ustId: data.ustId,
      stundensatz: data.stundensatz,
      abrechnungstakt: data.abrechnungstakt,
      tarifModell: data.tarifModell,
      rechtsgebietSaetze: data.rechtsgebietSaetze,
      bankName: data.bankName,
      iban: data.iban,
      bic: data.bic,
      zahlungszielTage: data.zahlungszielTage,
      rechnungFooter: data.rechnungFooter,
      datevKontenrahmen: data.datevKontenrahmen,
      datevBeraterNr: data.datevBeraterNr,
      datevMandantenNr: data.datevMandantenNr,
      smtpHost: data.smtpHost,
      smtpPort: data.smtpPort,
      smtpUser: data.smtpUser,
      smtpPassword: data.smtpPassword,
      smtpSecure: data.smtpSecure,
      emailFrom: data.emailFrom,
      kleinunternehmer: data.kleinunternehmer,
      eInvoiceProfile: data.eInvoiceProfile,
    };
    try {
      await saveKanzleiSettings(settings);
      savedKanzleiRef.current = settings;
      kanzleiForm.reset(data);
      setKanzleiSaved(true);
      setTimeout(() => setKanzleiSaved(false), 2000);
    } catch {
      setKanzleiSaveError(true);
    }
  }

  const meta = activeTab ? TAB_META[activeTab] : undefined;
  const tabAllowed = meta ? meta.allowed.includes(userRole) : false;
  const kanzleiErrors = kanzleiForm.formState.errors;

  return (
    <div
      className={cn(
        "mx-auto space-y-6 p-4 md:p-6 lg:p-8",
        activeTab ? "max-w-[720px]" : "max-w-[1200px]"
      )}
    >
      <PageHeader
        title={meta ? L(meta.title.de, meta.title.en) : t("settings.title")}
        description={meta ? L(meta.desc.de, meta.desc.en) : t("settings.hub_desc")}
        breadcrumbs={[
          { label: t("nav.overview"), href: "/dashboard" },
          ...(meta
            ? [
                { label: t("settings.title"), href: "/dashboard/settings" },
                { label: L(meta.title.de, meta.title.en) },
              ]
            : [{ label: t("settings.title") }]),
        ]}
      />

      {/* Hub view — grouped tiles when no topic is selected */}
      {!activeTab && <SettingsHub userRole={userRole} />}

      {activeTab && (!meta || (!tabAllowed && meQuery.data)) && (
        <div className="rounded-xl border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] p-6 text-sm text-[color:var(--ds-text-muted)]">
          {meta
            ? L(
                "Diese Einstellung ist Ihrer Rolle nicht freigegeben. Wenden Sie sich an die Kanzleiverwaltung.",
                "This setting is not available for your role. Please contact your firm administrator."
              )
            : L("Diese Einstellung gibt es nicht.", "This setting does not exist.")}{" "}
          <Link href="/dashboard/settings" className="brand-text hover:underline">
            {L("Zu allen Einstellungen", "All settings")}
          </Link>
        </div>
      )}

      {/* Detail view — one topic */}
      {activeTab && meta && (tabAllowed || !meQuery.data) && (
        <>
          {/* Knowledge connection */}
          {activeTab === "brain" && (
            <Card>
              <div className="px-6">
                <Field
                  label={t("settings.connection_status")}
                  desc={L(
                    "Ohne Verbindung können Assistent, Suche und Dokumentanalyse nicht arbeiten.",
                    "Without a connection the assistant, search and document analysis cannot work."
                  )}
                >
                  <div className="flex flex-wrap items-center gap-3">
                    {engineStatus === "checking" || engineStatus === "idle" ? (
                      <span className="flex items-center gap-2 text-sm text-[color:var(--ds-text-muted)]">
                        <RefreshCw size={14} className="animate-spin" aria-hidden />
                        {t("settings.checking")}
                      </span>
                    ) : (
                      <span
                        role="status"
                        className={cn(
                          "flex items-center gap-2 text-sm",
                          engineStatus === "online"
                            ? "text-[color:var(--ds-success-text)]"
                            : "text-[color:var(--ds-warning-text)]"
                        )}
                      >
                        {engineStatus === "online" ? (
                          <CheckCircle2 size={14} aria-hidden />
                        ) : (
                          <AlertTriangle size={14} aria-hidden />
                        )}
                        {engineStatus === "online"
                          ? t("settings.connected")
                          : t("settings.not_connected")}
                      </span>
                    )}
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={checkEngineConnection}
                      disabled={engineStatus === "checking"}
                    >
                      {L("Erneut prüfen", "Check again")}
                    </Button>
                  </div>
                  {engineStatus === "offline" && (
                    <p className="mt-2 text-xs leading-relaxed text-[color:var(--ds-text-muted)]">
                      {L(
                        "Die Wissensdatenbank antwortet nicht. Versuchen Sie es in einigen Minuten erneut; besteht das Problem weiter, informieren Sie den Betreiber Ihrer Subsumio-Installation.",
                        "The knowledge base is not responding. Try again in a few minutes; if the problem persists, inform the operator of your Subsumio installation."
                      )}
                    </p>
                  )}
                </Field>
                {statsQuery.data && (
                  <Field
                    label={L("Umfang", "Size")}
                    desc={L(
                      "Anzahl der Einträge im Kanzleiwissen.",
                      "Number of entries in the firm knowledge."
                    )}
                  >
                    <p className="text-sm text-[color:var(--ds-text)] tabular-nums">
                      {(statsQuery.data.total_pages ?? 0).toLocaleString("de-AT")}{" "}
                      {L("Einträge", "entries")}
                    </p>
                  </Field>
                )}
              </div>
            </Card>
          )}

          {/* API Keys */}
          {activeTab === "api" && (
            <Card>
              <div className="border-b border-[color:var(--ds-border)] p-6">
                <p className="text-sm leading-relaxed text-[color:var(--ds-text-muted)]">
                  {L(
                    "Die Schlüssel werden verschlüsselt auf dem Server gespeichert und danach nur gekürzt angezeigt. Leer lassen, wenn Subsumio die Anbieter für Sie abrechnet.",
                    "Keys are stored encrypted on the server and shown only truncated afterwards. Leave empty if Subsumio bills the providers for you."
                  )}
                </p>
              </div>
              <div className="divide-y divide-[color:var(--ds-border)] px-6">
                <Field
                  label={L("OpenAI-Schlüssel", "OpenAI key")}
                  desc={L(
                    "Für die Aufbereitung von Dokumenten für die Suche.",
                    "Used to prepare documents for search."
                  )}
                >
                  <div className="space-y-2">
                    <MaskedInput
                      value={apiKeysForm.watch("openaiKey")}
                      placeholder="sk-..."
                      onChange={(v) => apiKeysForm.setValue("openaiKey", v)}
                    />
                    <a
                      href="https://platform.openai.com/api-keys"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="brand-text inline-flex items-center gap-1 text-xs hover:underline"
                    >
                      {t("settings.create_key")} <ExternalLink size={10} />
                    </a>
                  </div>
                </Field>

                <Field
                  label={L("Anthropic-Schlüssel", "Anthropic key")}
                  desc={L(
                    "Für Antworten des Assistenten und Entwürfe (Claude-Modelle).",
                    "Used for assistant answers and drafts (Claude models)."
                  )}
                >
                  <div className="space-y-2">
                    <MaskedInput
                      value={apiKeysForm.watch("anthropicKey")}
                      placeholder="sk-ant-..."
                      onChange={(v) => apiKeysForm.setValue("anthropicKey", v)}
                    />
                    <a
                      href="https://console.anthropic.com/keys"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="brand-text inline-flex items-center gap-1 text-xs hover:underline"
                    >
                      {t("settings.create_key")} <ExternalLink size={10} />
                    </a>
                  </div>
                </Field>

                <Field
                  label={L("ZeroEntropy-Schlüssel (optional)", "ZeroEntropy key (optional)")}
                  desc={L(
                    "Ordnet Suchtreffer genauer nach Relevanz.",
                    "Ranks search results more precisely by relevance."
                  )}
                >
                  <div className="space-y-2">
                    <MaskedInput
                      value={apiKeysForm.watch("zeroEntropyKey")}
                      placeholder="ze-..."
                      onChange={(v) => apiKeysForm.setValue("zeroEntropyKey", v)}
                    />
                  </div>
                </Field>
              </div>
              <div className="flex flex-wrap items-center gap-3 border-t border-[color:var(--ds-border)] p-6">
                <Button
                  variant="glow"
                  size="md"
                  onClick={saveApiKeys}
                  loading={saveKeysMutation.isPending}
                >
                  {keysSaved ? t("settings.saved") : L("Schlüssel speichern", "Save keys")}
                </Button>
                {keysSaveError && (
                  <p role="alert" className="text-sm text-[color:var(--ds-danger-text)]">
                    {L(
                      "Speichern fehlgeschlagen. Bitte prüfen Sie, dass jeder Schlüssel vollständig eingefügt ist (nicht die gekürzte Anzeige).",
                      "Saving failed. Please make sure each key is pasted in full (not the truncated display)."
                    )}
                  </p>
                )}
              </div>
            </Card>
          )}

          {/* Nightly consolidation */}
          {activeTab === "dream" && (
            <Card>
              <div className="divide-y divide-[color:var(--ds-border)] px-6">
                <Field
                  label={L("Was nachts passiert", "What happens overnight")}
                  desc={L(
                    "Läuft automatisch täglich um 3:00 Uhr.",
                    "Runs automatically every day at 3:00 AM."
                  )}
                >
                  <ul className="space-y-2">
                    {[
                      L(
                        "Doppelte Einträge zu Personen und Unternehmen erkennen und zusammenführen",
                        "Detect and merge duplicate entries for people and companies"
                      ),
                      L(
                        "Fehlerhafte Verweise und Zitate reparieren",
                        "Repair broken references and citations"
                      ),
                      L(
                        "Einträge nach Bedeutung für Ihre laufenden Akten gewichten",
                        "Weight entries by relevance to your open matters"
                      ),
                      L("Widersprüchliche Angaben markieren", "Flag contradictory information"),
                      L("Aufgaben für den nächsten Tag vorbereiten", "Prepare tasks for the next day"),
                    ].map((item) => (
                      <li
                        key={item}
                        className="flex items-start gap-2 text-sm text-[color:var(--ds-text-muted)]"
                      >
                        <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-[color:var(--ds-border-strong)]" />
                        {item}
                      </li>
                    ))}
                  </ul>
                </Field>
                <Field
                  label={L("Sofort ausführen", "Run now")}
                  desc={L(
                    "Nur nötig nach einem größeren Import; kann einige Minuten dauern.",
                    "Only needed after a large import; can take a few minutes."
                  )}
                >
                  <div className="space-y-2">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => void runDreamCycle()}
                      disabled={dreamRunning}
                    >
                      <RefreshCw
                        size={14}
                        className={cn(dreamRunning && "animate-spin")}
                        aria-hidden
                      />
                      {dreamRunning ? t("sidebar.dream_running") : t("sidebar.dream_run_now")}
                    </Button>
                    {dreamDone && (
                      <p role="status" className="text-xs text-[color:var(--ds-success-text)]">
                        {L("Konsolidierung abgeschlossen.", "Consolidation finished.")}
                      </p>
                    )}
                    {dreamError && (
                      <p role="alert" className="text-xs text-[color:var(--ds-danger-text)]">
                        {t("sidebar.dream_error")}
                      </p>
                    )}
                  </div>
                </Field>
              </div>
            </Card>
          )}

          {/* Kanzlei */}
          {activeTab === "kanzlei" && (
            <>
              <Card>
                <div className="border-b border-[color:var(--ds-border)] px-6 py-4">
                  <p className="text-sm text-[color:var(--ds-text-muted)]">
                    {L(
                      "Anschrift, UID-Nummer und Bankverbindung pflegen Sie im ",
                      "Address, VAT ID and bank details are maintained in the "
                    )}
                    <Link href="/dashboard/settings/kanzlei" className="brand-text hover:underline">
                      {L("Kanzleiprofil", "firm profile")}
                    </Link>
                    .
                  </p>
                </div>
                <div className="divide-y divide-[color:var(--ds-border)] px-6">
                  <Field
                    id="settings-anwalt-name"
                    label={t("settings.anwalt_name")}
                    desc={t("settings.anwalt_name_desc")}
                  >
                    <Input
                      id="settings-anwalt-name"
                      error={kanzleiForm.formState.errors.anwaltName?.message}
                      {...kanzleiForm.register("anwaltName")}
                      placeholder={t("settings.signatory_placeholder")}
                    />
                  </Field>

                  <Field
                    label={L("Kleinunternehmerregelung", "Small-business exemption")}
                    desc={L(
                      "Honorarnoten ohne Umsatzsteuer nach § 6 Abs 1 Z 27 UStG.",
                      "Invoices without VAT under § 6 Abs 1 Z 27 UStG."
                    )}
                  >
                    <label className="flex items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        {...kanzleiForm.register("kleinunternehmer")}
                        className="h-4 w-4 rounded border-[color:var(--ds-border)]"
                      />
                      <span>
                        {L(
                          "Kleinunternehmerregelung anwenden",
                          "Apply the small-business exemption"
                        )}
                      </span>
                    </label>
                  </Field>

                  <Field
                    label={L("Umfang der E-Rechnung", "E-invoice detail level")}
                    desc={L(
                      "Wie viele Angaben die maschinenlesbare Rechnung enthält. Im Zweifel „Basis“.",
                      "How much detail the machine-readable invoice contains. If unsure, “Basic”."
                    )}
                  >
                    <div className="flex flex-wrap gap-2">
                      {(["BASIC", "COMFORT", "EXTENDED"] as const).map((prof) => (
                        <button
                          key={prof}
                          type="button"
                          aria-pressed={kanzleiForm.watch("eInvoiceProfile") === prof}
                          onClick={() =>
                            kanzleiForm.setValue("eInvoiceProfile", prof, { shouldDirty: true })
                          }
                          className={cn(
                            "rounded-lg border px-4 py-2 text-sm font-medium transition-[background-color,border-color,color] motion-reduce:transition-none",
                            kanzleiForm.watch("eInvoiceProfile") === prof
                              ? "brand-soft brand-text brand-border"
                              : "border-[color:var(--ds-border)] text-[color:var(--ds-text-muted)] hover:border-[color:var(--ds-border-strong)]"
                          )}
                        >
                          {prof === "BASIC"
                            ? L("Basis", "Basic")
                            : prof === "COMFORT"
                              ? L("Erweitert", "Comfort")
                              : L("Vollständig", "Extended")}
                        </button>
                      ))}
                    </div>
                  </Field>

                  <Field label={t("settings.tarif_model")} desc={t("settings.tarif_model_desc")}>
                    <div className="flex gap-2">
                      {(
                        [
                          { key: "custom", label: t("settings.tarif_custom") },
                          { key: "ratg", label: t("settings.tarif_ratg") },
                        ] as const
                      ).map((opt) => (
                        <button
                          key={opt.key}
                          type="button"
                          aria-pressed={tarifModellWatch === opt.key}
                          onClick={() =>
                            kanzleiForm.setValue("tarifModell", opt.key, { shouldDirty: true })
                          }
                          className={cn(
                            "rounded-lg border px-4 py-2 text-sm font-medium transition-[background-color,border-color,color,transform] duration-[var(--ds-duration-normal)] ease-[cubic-bezier(0.32,0.72,0,1)] focus-visible:ring-2 focus-visible:ring-[color:var(--brand-primary)] focus-visible:outline-none active:scale-[0.97] motion-reduce:transition-none",
                            tarifModellWatch === opt.key
                              ? "brand-soft brand-text brand-border"
                              : "border-[color:var(--ds-border)] text-[color:var(--ds-text-muted)] hover:border-[color:var(--ds-border-strong)]"
                          )}
                        >
                          {opt.label}
                        </button>
                      ))}
                    </div>
                  </Field>

                  {tarifModellWatch === "custom" && (
                    <>
                      <Field
                        label={t("settings.hourly_rate")}
                        desc={t("settings.hourly_rate_desc")}
                      >
                        <div className="flex flex-wrap items-center gap-2">
                          <Euro size={14} className="text-[color:var(--ds-text-muted)]" />
                          <Input
                            type="number"
                            inputMode="numeric"
                            aria-label={L("Stundensatz in Euro", "Hourly rate in euros")}
                            {...kanzleiForm.register("stundensatz")}
                            placeholder="200"
                            className="w-28"
                          />
                          <span className="text-sm text-[color:var(--ds-text-muted)]">
                            {t("settings.per_hour")}
                          </span>
                          <Input
                            type="number"
                            inputMode="numeric"
                            aria-label={L("Abrechnungstakt in Minuten", "Billing increment in minutes")}
                            {...kanzleiForm.register("abrechnungstakt")}
                            placeholder="15"
                            className="w-20 sm:ml-2"
                          />
                          <span className="text-sm text-[color:var(--ds-text-muted)]">
                            {L("Minuten-Takt", "minute increment")}
                          </span>
                        </div>
                      </Field>

                      <Field
                        label={t("settings.rates_per_area")}
                        desc={t("settings.rates_per_area_desc")}
                      >
                        <div className="space-y-2">
                          {Object.entries(rechtsgebietSaetzeWatch ?? {}).map(([gebiet, satz]) => (
                            <div key={gebiet} className="flex items-center gap-3">
                              <span className="w-32 text-sm text-[color:var(--ds-text-muted)]">
                                {RATE_AREA_LABELS[gebiet]
                                  ? L(RATE_AREA_LABELS[gebiet].de, RATE_AREA_LABELS[gebiet].en)
                                  : gebiet}
                              </span>
                              <Euro size={12} className="text-[color:var(--ds-text-muted)]" />
                              <input
                                type="number"
                                inputMode="numeric"
                                aria-label={`${
                                  RATE_AREA_LABELS[gebiet]
                                    ? L(RATE_AREA_LABELS[gebiet].de, RATE_AREA_LABELS[gebiet].en)
                                    : gebiet
                                }: ${L("Stundensatz in Euro", "hourly rate in euros")}`}
                                value={String(satz)}
                                onChange={(e) => {
                                  const updated = {
                                    ...(rechtsgebietSaetzeWatch ?? {}),
                                    [gebiet]: parseInt(e.target.value, 10) || 0,
                                  };
                                  kanzleiForm.setValue("rechtsgebietSaetze", updated, {
                                    shouldDirty: true,
                                  });
                                }}
                                className="w-24 rounded-lg border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] px-3 py-1.5 text-sm text-[color:var(--ds-text)] focus:border-[color:var(--brand-primary)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-primary)] focus-visible:ring-offset-1"
                              />
                              <span className="text-xs text-[color:var(--ds-text-muted)]">
                                {t("settings.per_hour_short")}
                              </span>
                            </div>
                          ))}
                        </div>
                      </Field>
                    </>
                  )}

                  {(tarifModellWatch === "rvg" || tarifModellWatch === "ratg") && (
                    <div className="py-4">
                      <div className="flex items-start gap-3 rounded-lg border border-[color:var(--ds-warning-border)] bg-[color:var(--ds-warning-bg)] px-3 py-2">
                        <AlertTriangle
                          size={14}
                          className="mt-0.5 shrink-0 text-[color:var(--ds-warning-text)]"
                        />
                        <p className="text-xs text-[color:var(--ds-warning-text)]">
                          {tarifModellWatch === "rvg"
                            ? t("settings.rvg_info")
                            : t("settings.ratg_info")}
                        </p>
                      </div>
                    </div>
                  )}

                  <Field
                    id="settings-zahlungsziel-tage"
                    label={t("settings.payment_terms")}
                    desc={t("settings.payment_terms_desc")}
                  >
                    <div className="flex items-center gap-2">
                      <Input
                        id="settings-zahlungsziel-tage"
                        type="number"
                        inputMode="numeric"
                        {...kanzleiForm.register("zahlungszielTage")}
                        placeholder="14"
                        className="w-24"
                      />
                      <span className="text-sm text-[color:var(--ds-text-muted)]">
                        {t("settings.days_net")}
                      </span>
                    </div>
                  </Field>

                  <Field
                    label={t("settings.invoice_footer")}
                    desc={t("settings.invoice_footer_desc")}
                  >
                    <textarea
                      aria-label={t("settings.invoice_footer")}
                      {...kanzleiForm.register("rechnungFooter")}
                      rows={3}
                      className="w-full rounded-lg border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] px-3 py-2.5 text-sm text-[color:var(--ds-text)] placeholder:text-[color:var(--ds-text-muted)] focus:border-[color:var(--brand-primary)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-primary)] focus-visible:ring-offset-1"
                    />
                  </Field>

                  <Field
                    label={L("Versand von Honorarnoten", "Sending invoices")}
                    desc={L(
                      "Postausgangsserver (SMTP) Ihres E-Mail-Anbieters, über den Rechnungen an Mandanten gehen. Die Angaben erhalten Sie von Ihrem Anbieter.",
                      "Outgoing mail server (SMTP) of your e-mail provider used to send invoices to clients. Your provider can give you these details."
                    )}
                  >
                    <div className="grid grid-cols-1 items-center gap-2 sm:grid-cols-[1fr_5.5rem_auto]">
                      <Input
                        id="settings-smtp-host"
                        aria-label={t("settings.aria_smtp_host")}
                        {...kanzleiForm.register("smtpHost")}
                        placeholder="mail.example.com"
                      />
                      <Input
                        id="settings-smtp-port"
                        aria-label={t("settings.aria_smtp_port")}
                        {...kanzleiForm.register("smtpPort")}
                        placeholder="587"
                      />
                      <label className="flex items-center gap-2 text-sm whitespace-nowrap text-[color:var(--ds-text-muted)]">
                        <input
                          type="checkbox"
                          {...kanzleiForm.register("smtpSecure")}
                          className="accent-[var(--brand-primary)]"
                        />
                        {L("Verschlüsselt", "Encrypted")}
                      </label>
                    </div>
                  </Field>

                  <Field
                    id="settings-smtp-user"
                    label={L("Benutzername für den Versand", "Sending user name")}
                    desc={L("Meist Ihre E-Mail-Adresse.", "Usually your e-mail address.")}
                  >
                    <Input
                      id="settings-smtp-user"
                      {...kanzleiForm.register("smtpUser")}
                      placeholder="kanzlei@example.com"
                    />
                  </Field>

                  <Field
                    id="settings-smtp-password"
                    label={L("Passwort für den Versand", "Sending password")}
                    desc={t("settings.smtp_password_desc")}
                  >
                    <Input
                      id="settings-smtp-password"
                      type="password"
                      {...kanzleiForm.register("smtpPassword")}
                      placeholder="••••••"
                    />
                  </Field>

                  <Field
                    id="settings-email-from"
                    label={t("settings.email_from")}
                    desc={L(
                      "Diese Adresse sieht der Mandant als Absender.",
                      "The address the client sees as sender."
                    )}
                  >
                    <Input
                      id="settings-email-from"
                      {...kanzleiForm.register("emailFrom")}
                      placeholder="kanzlei@example.com"
                    />
                  </Field>
                </div>
                <div className="border-t border-[color:var(--ds-border)] p-6">
                  {kanzleiSaveError && (
                    <p role="alert" className="mb-3 text-sm text-[color:var(--ds-danger-text)]">
                      {L(
                        "Speichern fehlgeschlagen. Bitte versuchen Sie es erneut.",
                        "Saving failed. Please try again."
                      )}
                    </p>
                  )}
                  {(kanzleiErrors.kanzleiName || kanzleiErrors.anwaltName) && (
                    <p role="alert" className="mb-3 text-sm text-[color:var(--ds-danger-text)]">
                      {kanzleiErrors.kanzleiName
                        ? L(
                            "Bitte tragen Sie zuerst den Kanzleinamen im Kanzleiprofil ein.",
                            "Please enter the firm name in the firm profile first."
                          )
                        : L(
                            "Bitte geben Sie den Rechnungssteller an.",
                            "Please enter the invoicing lawyer."
                          )}
                    </p>
                  )}
                  <Button variant="glow" size="md" onClick={saveKanzleiProfile}>
                    {kanzleiSaved ? t("settings.saved") : t("settings.save")}
                  </Button>
                </div>
              </Card>
              <DemoDataCard />
            </>
          )}

          {/* Team */}
          {activeTab === "team" && (
            <Card>
              <div className="border-b border-[color:var(--ds-border)] px-6 py-4">
                <p className="text-sm text-[color:var(--ds-text-muted)]">
                  {L("Mitglieder einladen oder entfernen Sie unter ", "Invite or remove members under ")}
                  <Link href="/dashboard/team" className="brand-text hover:underline">
                    {L("Team", "Team")}
                  </Link>
                  .
                </p>
              </div>
              <div className="divide-y divide-[color:var(--ds-border)] px-6">
                {teamMembers.length === 0 ? (
                  <div className="py-10 text-center">
                    <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-[color:var(--ds-surface-2)]">
                      <Users size={22} className="text-[color:var(--ds-border-strong)]" />
                    </div>
                    <p className="text-sm text-[color:var(--ds-text-muted)]">
                      {t("settings.team_empty")}
                    </p>
                  </div>
                ) : (
                  teamMembers.map((member) => (
                    <div key={member.id} className="flex items-center justify-between gap-4 py-4">
                      <div className="flex items-center gap-3">
                        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-[color:var(--ds-border)] bg-[color:var(--ds-hover)]">
                          <span className="text-xs font-semibold text-[color:var(--ds-text-muted)]">
                            {(member.name ?? member.email ?? "?").charAt(0).toUpperCase()}
                          </span>
                        </div>
                        <div>
                          <div className="text-sm font-medium text-[color:var(--ds-text)]">
                            {member.name ?? member.email}
                          </div>
                          <div className="mt-0.5 text-xs text-[color:var(--ds-text-muted)]">
                            {member.email}
                          </div>
                        </div>
                      </div>
                      <select
                        aria-label={L(`Rolle von ${member.name ?? member.email}`, `Role of ${member.name ?? member.email}`)}
                        value={member.role}
                        onChange={async (e) => {
                          try {
                            await updateRoleMutation.mutateAsync({
                              userId: member.id,
                              role: e.target.value,
                            });
                            setTeamMembers((prev) =>
                              prev.map((m) =>
                                m.id === member.id ? { ...m, role: e.target.value } : m
                              )
                            );
                          } catch (err) {
                            console.error(
                              "[team] failed to update role:",
                              err instanceof Error ? err.message : String(err)
                            );
                          }
                        }}
                        className="rounded-lg border border-[color:var(--ds-border)] bg-[color:var(--ds-surface-2)] px-3 py-1.5 text-sm text-[color:var(--ds-text)] transition-[background-color,border-color,color,box-shadow,opacity,transform] duration-[var(--ds-duration-normal)] ease-[cubic-bezier(0.32,0.72,0,1)] focus:border-[color:var(--brand-primary)] focus:ring-2 focus:ring-[var(--brand-primary)] focus:ring-offset-1 focus:ring-offset-[var(--ds-surface)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-primary)] focus-visible:ring-offset-1 motion-reduce:transition-none"
                      >
                        <option value="admin">{t("settings.role_admin")}</option>
                        <option value="lawyer">{t("settings.role_lawyer")}</option>
                        <option value="assistant">{t("settings.role_assistant")}</option>
                        <option value="client_viewer">{L("Mandant (nur lesen)", "Client (read-only)")}</option>
                      </select>
                    </div>
                  ))
                )}
              </div>
            </Card>
          )}

          {/* ACLs — Document-Level Access Control */}
          {activeTab === "acls" && (
            <AclSettings />
          )}

          {/* SCIM — the full page lives at /dashboard/settings/scim */}
          {activeTab === "scim" && (
            <Card className="flex flex-wrap items-center justify-between gap-4 p-6">
              <p className="text-sm text-[color:var(--ds-text-muted)]">
                {L(
                  "Einrichtung, Status und Protokoll des Abgleichs finden Sie auf einer eigenen Seite.",
                  "Setup, status and log of the sync are on a dedicated page."
                )}
              </p>
              <Button variant="outline" size="sm" asChild>
                <Link href="/dashboard/settings/scim">{L("Öffnen", "Open")}</Link>
              </Button>
            </Card>
          )}

          {/* Account */}
          {activeTab === "account" && (
            <Card>
              <div className="divide-y divide-[color:var(--ds-border)] px-6">
                <Field label={t("settings.plan")} desc={t("settings.plan_desc")}>
                  <div className="flex items-center gap-3">
                    <Badge variant="accent" className="px-3 py-1 text-sm capitalize">
                      {(meQuery.data?.user?.plan ?? "free") === "free"
                        ? L("Kostenlos", "Free")
                        : meQuery.data?.user?.plan}
                    </Badge>
                    <Button variant="outline" size="sm" asChild>
                      <Link href="/dashboard/billing">{L("Plan verwalten", "Manage plan")}</Link>
                    </Button>
                  </div>
                </Field>
                <Field label={t("settings.usage")} desc={t("settings.usage_desc")}>
                  <div className="space-y-3">
                    <div>
                      <div className="mb-1.5 flex justify-between text-xs">
                        <span className="text-[color:var(--ds-text-muted)]">
                          {t("settings.usage_pages")}
                        </span>
                        <span className="font-mono text-[color:var(--ds-text)] tabular-nums">
                          {(statsQuery.data?.total_pages ?? 0).toLocaleString("de-AT")} /{" "}
                          {limitsFor((meQuery.data?.user?.plan ?? "free") as Plan).pages.toLocaleString(
                            "de-AT"
                          )}
                        </span>
                      </div>
                      {(() => {
                        const used = statsQuery.data?.total_pages ?? 0;
                        const limit = limitsFor((meQuery.data?.user?.plan ?? "free") as Plan).pages;
                        const pct = limit > 0 ? Math.min(100, (used / limit) * 100) : 0;
                        return (
                          <div className="h-1.5 overflow-hidden rounded-full bg-[color:var(--ds-border)]">
                            <div
                              className="brand-bg h-full rounded-full transition-[width] duration-[var(--ds-duration-normal)] motion-reduce:transition-none"
                              style={{ width: `${pct}%` }}
                            />
                          </div>
                        );
                      })()}
                    </div>
                    <div>
                      <div className="mb-1.5 flex justify-between text-xs">
                        <span className="text-[color:var(--ds-text-muted)]">
                          {L("Anfragen an den Assistenten", "Assistant requests")}
                        </span>
                        <span className="font-mono text-[color:var(--ds-text)] tabular-nums">
                          {(statsQuery.data?.total_queries ?? 0).toLocaleString("de-AT")} /{" "}
                          {limitsFor(
                            (meQuery.data?.user?.plan ?? "free") as Plan
                          ).queriesPerMonth.toLocaleString("de-AT")}
                        </span>
                      </div>
                      {(() => {
                        const used = statsQuery.data?.total_queries ?? 0;
                        const limit = limitsFor(
                          (meQuery.data?.user?.plan ?? "free") as Plan
                        ).queriesPerMonth;
                        const pct = limit > 0 ? Math.min(100, (used / limit) * 100) : 0;
                        return (
                          <div className="h-1.5 overflow-hidden rounded-full bg-[color:var(--ds-border)]">
                            <div
                              className="brand-bg h-full rounded-full transition-[width] duration-[var(--ds-duration-normal)] motion-reduce:transition-none"
                              style={{ width: `${pct}%` }}
                            />
                          </div>
                        );
                      })()}
                    </div>
                  </div>
                </Field>
                <Field label={t("settings.referral")} desc={t("settings.referral_desc")}>
                  <div className="space-y-3">
                    <div className="flex items-center gap-2 rounded-lg border border-[color:var(--ds-border)] bg-[color:var(--ds-surface-2)] px-4 py-3">
                      <Gift size={15} className="shrink-0 text-[color:var(--ds-text-muted)]" />
                      <p className="text-xs leading-relaxed text-[color:var(--ds-text-muted)]">
                        {t("settings.referral_info")}
                        {referrals !== null && (
                          <span className="font-medium text-[color:var(--ds-text)]">
                            {" "}
                            {t("settings.referral_so_far")} {referrals}.
                          </span>
                        )}
                      </p>
                    </div>
                    {referralUrl ? (
                      <MaskedInput value={referralUrl} placeholder="" />
                    ) : meQuery.isLoading ? (
                      <Skeleton className="h-10 w-full" />
                    ) : null}
                    <Link
                      href="/partners"
                      className="brand-text inline-flex items-center gap-1 text-xs hover:underline"
                    >
                      {t("settings.partner_link")} <ExternalLink size={10} />
                    </Link>
                  </div>
                </Field>
                <Field label={t("settings.language")} desc={t("settings.language_desc")}>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => setLang("de")}
                      className={cn(
                        "flex items-center gap-2 rounded-lg border px-4 py-2 text-sm font-medium transition-[background-color,border-color,color,box-shadow,opacity,transform] duration-[var(--ds-duration-normal)] ease-[cubic-bezier(0.32,0.72,0,1)] motion-reduce:transition-none",
                        lang === "de"
                          ? "brand-soft brand-text brand-border"
                          : "border-[color:var(--ds-border)] text-[color:var(--ds-text-muted)] hover:border-[color:var(--ds-border-strong)]"
                      )}
                      aria-pressed={lang === "de"}
                    >
                      <Languages size={14} className="shrink-0" />
                      Deutsch
                    </button>
                    <button
                      type="button"
                      onClick={() => setLang("en")}
                      className={cn(
                        "flex items-center gap-2 rounded-lg border px-4 py-2 text-sm font-medium transition-[background-color,border-color,color,box-shadow,opacity,transform] duration-[var(--ds-duration-normal)] ease-[cubic-bezier(0.32,0.72,0,1)] motion-reduce:transition-none",
                        lang === "en"
                          ? "brand-soft brand-text brand-border"
                          : "border-[color:var(--ds-border)] text-[color:var(--ds-text-muted)] hover:border-[color:var(--ds-border-strong)]"
                      )}
                      aria-pressed={lang === "en"}
                    >
                      <Languages size={14} className="shrink-0" />
                      English
                    </button>
                  </div>
                </Field>
                <Field
                  label={t("settings.accessibility")}
                  desc={L(
                    "Tastaturbedienung an Ihre Arbeitsweise anpassen.",
                    "Adapt keyboard use to the way you work."
                  )}
                >
                  <label className="flex cursor-pointer items-center gap-3">
                    <input
                      type="checkbox"
                      checked={singleKeyShortcuts}
                      onChange={(e) => {
                        setSingleKeyShortcuts(e.target.checked);
                        localStorage.setItem("single-key-shortcuts", String(e.target.checked));
                      }}
                      className="h-4 w-4 rounded border-[color:var(--ds-border)] accent-[var(--brand-primary)]"
                    />
                    <span className="text-sm text-[color:var(--ds-text)]">
                      {L("Kürzel mit einzelnen Tasten erlauben", "Allow single-key shortcuts")}
                    </span>
                  </label>
                  <p className="mt-1.5 text-xs text-[color:var(--ds-text-subtle)]">
                    {t("settings.single_key_shortcuts_hint")}
                  </p>
                </Field>
                <Field label={t("settings.data_export")} desc={t("settings.data_export_desc")}>
                  <Button variant="outline" size="sm" asChild>
                    <a href="/api/export" download>
                      {L("Meine Daten herunterladen", "Download my data")}
                    </a>
                  </Button>
                </Field>
              </div>
            </Card>
          )}
        </>
      )}
    </div>
  );
}

function DemoDataCard() {
  const { t } = useLang();
  const [state, setState] = useState<"loading" | "present" | "absent">("loading");
  const [removing, setRemoving] = useState(false);
  const [result, setResult] = useState<"removed" | "error" | null>(null);

  useEffect(() => {
    api.demoData
      .status()
      .then((r) => setState(r.present ? "present" : "absent"))
      .catch(() => setState("absent"));
  }, []);

  if (state !== "present" && result !== "removed") return null;

  const remove = async () => {
    if (!window.confirm(t("settings.demo_confirm"))) return;
    setRemoving(true);
    setResult(null);
    try {
      const res = await api.demoData.remove();
      if (res.failed.length > 0) {
        setResult("error");
      } else {
        setResult("removed");
        setState("absent");
      }
    } catch {
      setResult("error");
    } finally {
      setRemoving(false);
    }
  };

  return (
    <Card className="mt-4">
      <div className="flex items-start justify-between gap-4 p-6">
        <div>
          <h2 className="text-base font-semibold text-[color:var(--ds-text)]">
            {t("settings.demo_title")}
          </h2>
          <p className="mt-1 text-sm leading-relaxed text-[color:var(--ds-text-muted)]">
            {result === "removed" ? t("settings.demo_removed") : t("settings.demo_desc")}
          </p>
          {result === "error" && (
            <p className="mt-2 text-sm text-[color:var(--ds-danger-text)]">
              {t("settings.demo_fail")}
            </p>
          )}
        </div>
        {state === "present" && (
          <Button
            variant="outline"
            size="sm"
            onClick={remove}
            disabled={removing}
            className="shrink-0"
          >
            {removing ? <RefreshCw size={14} className="animate-spin" /> : <Trash2 size={14} />}
            {t("settings.demo_remove")}
          </Button>
        )}
      </div>
    </Card>
  );
}
