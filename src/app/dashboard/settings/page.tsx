"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useForm, useWatch } from "react-hook-form";
import { useUnsavedChanges } from "@/lib/use-unsaved-changes";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  Settings,
  Key,
  Database,
  Zap,
  Copy,
  Check,
  Eye,
  EyeOff,
  AlertTriangle,
  ExternalLink,
  Gift,
  Briefcase,
  Euro,
  Users,
  Network,
} from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { ENGINE_REPO_INSTALL } from "@/content/site";
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
import { PageHeader } from "@/components/dashboard/page-header";
import { useLang } from "@/lib/use-lang";
import type { DashboardKey } from "@/content/dashboard";

const ALL_TABS: { id: string; labelKey: DashboardKey; icon: typeof Database; allowed: string[] }[] =
  [
    {
      id: "brain",
      labelKey: "settings.tab_brain",
      icon: Database,
      allowed: ["admin", "lawyer", "assistant"],
    },
    { id: "api", labelKey: "settings.tab_api", icon: Key, allowed: ["admin"] },
    { id: "dream", labelKey: "settings.tab_dream", icon: Zap, allowed: ["admin", "lawyer"] },
    {
      id: "kanzlei",
      labelKey: "settings.tab_kanzlei",
      icon: Briefcase,
      allowed: ["admin", "lawyer", "assistant"],
    },
    { id: "team", labelKey: "settings.tab_team", icon: Users, allowed: ["admin"] },
    { id: "scim", labelKey: "settings.tab_scim", icon: Network, allowed: ["admin"] },
    {
      id: "account",
      labelKey: "settings.tab_account",
      icon: Settings,
      allowed: ["admin", "lawyer", "assistant", "client_viewer"],
    },
  ];

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
        className="w-full rounded-lg border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] px-3 py-2.5 pr-20 font-mono text-sm text-[color:var(--ds-text)] transition-colors placeholder:text-[color:var(--ds-text-muted)] focus:border-[color:var(--brand-primary)] focus:outline-none"
      />
      <div className="absolute right-2 flex items-center gap-1">
        <button
          onClick={() => setShow(!show)}
          className="p-1.5 text-[color:var(--ds-text-muted)] transition-colors hover:text-[color:var(--ds-text-muted)]"
        >
          {show ? <EyeOff size={13} /> : <Eye size={13} />}
        </button>
        {value && (
          <button
            onClick={copy}
            className="p-1.5 text-[color:var(--ds-text-muted)] transition-colors hover:text-[color:var(--ds-text-muted)]"
          >
            {copied ? <Check size={13} className="text-emerald-600" /> : <Copy size={13} />}
          </button>
        )}
      </div>
    </div>
  );
}

function Field({
  label,
  desc,
  children,
}: {
  label: string;
  desc?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="grid grid-cols-3 items-start gap-4 border-b border-[color:var(--ds-border)] py-4 last:border-0">
      <div>
        <p className="text-sm font-medium text-[color:var(--ds-text)]">{label}</p>
        {desc && (
          <p className="mt-0.5 text-xs leading-relaxed text-[color:var(--ds-text-muted)]">{desc}</p>
        )}
      </div>
      <div className="col-span-2">{children}</div>
    </div>
  );
}

export default function SettingsPage() {
  const { t } = useLang();
  const searchParams = useSearchParams();
  const [activeTab, setActiveTab] = useState(() => {
    const tab = searchParams.get("tab");
    return tab ?? "brain";
  });
  const [referralUrl, setReferralUrl] = useState("");
  const [referrals, setReferrals] = useState<number | null>(null);
  const [engineStatus, setEngineStatus] = useState<"idle" | "checking" | "online" | "offline">(
    "idle"
  );
  const [keysSaved, setKeysSaved] = useState(false);
  const [kanzleiSaved, setKanzleiSaved] = useState(false);
  const [kanzleiSaveError, setKanzleiSaveError] = useState<string | null>(null);

  const [brainUrl, setBrainUrl] = useState("http://localhost:3001");
  const [searchMode, setSearchMode] = useState("balanced");
  const [dreamEnabled, setDreamEnabled] = useState(false);

  // Role & team
  const [userRole, setUserRole] = useState<string>("lawyer");
  const [teamMembers, setTeamMembers] = useState<
    Array<{ id: string; name: string; email: string; role: string }>
  >([]);

  const meQuery = useMe();
  const teamQuery = useTeam();
  const settingsKeysQuery = useSettingsApiKeys();
  const saveKeysMutation = useSaveSettingsApiKeys();
  const statsQuery = useBrainStats();
  const updateRoleMutation = useUpdateTeamRole();

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
      rechnungFooter: "Bitte überweisen Sie den Betrag unter Angabe der Rechnungsnummer.",
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
    try {
      await saveKeysMutation.mutateAsync(data);
      setKeysSaved(true);
      setTimeout(() => setKeysSaved(false), 2000);
    } catch (err) {
      console.error(
        "[settings] failed to save API keys:",
        err instanceof Error ? err.message : String(err)
      );
    }
  }

  async function saveKanzleiProfile() {
    setKanzleiSaveError(null);
    const isValid = await kanzleiForm.trigger();
    if (!isValid) return;
    const data = kanzleiForm.getValues();
    const settings: KanzleiSettings = {
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
    };
    try {
      await saveKanzleiSettings(settings);
      setKanzleiSaved(true);
      setTimeout(() => setKanzleiSaved(false), 2000);
    } catch (err) {
      setKanzleiSaveError(err instanceof Error ? err.message : t("settings.kanzlei_save_fail"));
    }
  }

  return (
    <div className="mx-auto max-w-4xl space-y-6 p-6 md:p-8">
      <PageHeader
        title={t("settings.title")}
        description={t("settings.desc")}
        breadcrumbs={[
          { label: t("nav.overview"), href: "/dashboard" },
          { label: t("settings.title") },
        ]}
      />

      {/* Tab navigation */}
      <div
        className="flex items-center gap-1 overflow-x-auto border-b border-[color:var(--ds-border)] pb-px"
        role="tablist"
        aria-label={t("settings.title")}
      >
        {ALL_TABS.filter((tab) => tab.allowed.includes(userRole)).map((tab) => {
          const Icon = tab.icon;
          return (
            <button
              key={tab.id}
              role="tab"
              id={`tab-${tab.id}`}
              aria-selected={activeTab === tab.id}
              aria-controls={`panel-${tab.id}`}
              onClick={() => setActiveTab(tab.id)}
              className={cn(
                "-mb-px flex items-center gap-2 border-b-2 px-4 py-2.5 text-sm font-medium whitespace-nowrap transition-all focus-visible:ring-2 focus-visible:ring-[var(--brand-primary)] focus-visible:outline-none",
                activeTab === tab.id
                  ? "brand-text border-[color:var(--brand-primary)]"
                  : "border-transparent text-[color:var(--ds-text-muted)] hover:text-[color:var(--ds-text)]"
              )}
            >
              <Icon size={15} />
              {t(tab.labelKey)}
            </button>
          );
        })}
      </div>

      {/* Brain Settings */}
      {activeTab === "brain" && (
        <Card role="tabpanel" id="panel-brain" aria-labelledby="tab-brain">
          <div className="border-b border-[color:var(--ds-border)] p-6">
            <h2 className="text-base font-semibold text-[color:var(--ds-text)]">
              {t("settings.brain_config")}
            </h2>
          </div>
          <div className="divide-y divide-[color:var(--ds-border)] px-6">
            <Field label={t("settings.engine_url")} desc={t("settings.engine_url_desc")}>
              <Input
                value={brainUrl}
                onChange={(e) => setBrainUrl(e.target.value)}
                placeholder="http://localhost:3001"
              />
            </Field>

            <Field label={t("settings.connection_status")} desc={t("settings.connection_desc")}>
              <div className="flex items-center gap-3">
                <div className="flex items-center gap-2">
                  <AlertTriangle
                    size={14}
                    className={engineStatus === "online" ? "text-emerald-600" : "text-amber-600"}
                  />
                  <span
                    className={cn(
                      "text-sm",
                      engineStatus === "online" ? "text-emerald-600" : "text-amber-600"
                    )}
                  >
                    {engineStatus === "checking"
                      ? t("settings.checking")
                      : engineStatus === "online"
                        ? t("settings.connected")
                        : t("settings.not_connected")}
                  </span>
                </div>
                <Button variant="secondary" size="sm" onClick={checkEngineConnection}>
                  {t("settings.connect")}
                </Button>
              </div>
            </Field>

            <Field label={t("settings.search_mode")} desc={t("settings.search_mode_desc")}>
              <div className="flex gap-2">
                {["conservative", "balanced", "tokenmax"].map((mode) => (
                  <button
                    key={mode}
                    onClick={() => setSearchMode(mode)}
                    className={cn(
                      "rounded-lg border px-4 py-2 text-sm font-medium transition-all",
                      searchMode === mode
                        ? "brand-soft brand-text brand-border"
                        : "border-[color:var(--ds-border)] text-[color:var(--ds-text-muted)] hover:border-[color:var(--ds-border-strong)]"
                    )}
                  >
                    {mode}
                  </button>
                ))}
              </div>
            </Field>

            <Field label={t("settings.start_engine")} desc={t("settings.start_engine_desc")}>
              <div className="space-y-2">
                {[
                  `bun install -g ${ENGINE_REPO_INSTALL}`,
                  "subsumio init --pglite",
                  "subsumio serve --http --with-worker --port 3001",
                ].map((cmd) => (
                  <div
                    key={cmd}
                    className="flex items-center gap-2 rounded-lg border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] px-4 py-2.5"
                  >
                    <code className="brand-text flex-1 font-mono text-xs">{cmd}</code>
                    <button
                      onClick={() => navigator.clipboard.writeText(cmd)}
                      aria-label={t("aria.copy_command")}
                      className="shrink-0 text-[color:var(--ds-text-muted)] transition-colors hover:text-[color:var(--ds-text-muted)]"
                    >
                      <Copy size={12} />
                    </button>
                  </div>
                ))}
              </div>
            </Field>
          </div>
        </Card>
      )}

      {/* API Keys */}
      {activeTab === "api" && (
        <Card role="tabpanel" id="panel-api" aria-labelledby="tab-api">
          <div className="border-b border-[color:var(--ds-border)] p-6">
            <h2 className="text-base font-semibold text-[color:var(--ds-text)]">
              {t("settings.api_keys")}
            </h2>
            <p className="mt-1 text-sm text-[color:var(--ds-text-muted)]">
              {t("settings.api_keys_desc")}
            </p>
          </div>
          <div className="divide-y divide-[color:var(--ds-border)] px-6">
            <Field label={t("settings.openai_key")} desc={t("settings.openai_key_desc")}>
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

            <Field label={t("settings.anthropic_key")} desc={t("settings.anthropic_key_desc")}>
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

            <Field label={t("settings.zeroentropy_key")} desc={t("settings.zeroentropy_key_desc")}>
              <div className="space-y-2">
                <MaskedInput
                  value={apiKeysForm.watch("zeroEntropyKey")}
                  placeholder="ze-..."
                  onChange={(v) => apiKeysForm.setValue("zeroEntropyKey", v)}
                />
                <Badge variant="info" className="text-xs">
                  {t("settings.zeroentropy_badge")}
                </Badge>
              </div>
            </Field>
          </div>
          <div className="border-t border-[color:var(--ds-border)] p-6">
            <Button variant="glow" size="md" onClick={saveApiKeys}>
              {keysSaved ? t("settings.saved") : t("settings.save_keys")}
            </Button>
          </div>
        </Card>
      )}

      {/* Dream Cycle */}
      {activeTab === "dream" && (
        <Card role="tabpanel" id="panel-dream" aria-labelledby="tab-dream">
          <div className="border-b border-[color:var(--ds-border)] p-6">
            <div className="flex items-center gap-3">
              <Zap size={18} className="text-amber-600" />
              <div>
                <h2 className="text-base font-semibold text-[color:var(--ds-text)]">
                  {t("settings.dream_title")}
                </h2>
                <p className="text-sm text-[color:var(--ds-text-muted)]">
                  {t("settings.dream_desc")}
                </p>
              </div>
              <Badge variant={dreamEnabled ? "success" : "warning"} className="ml-auto">
                {dreamEnabled ? t("settings.active") : t("settings.inactive")}
              </Badge>
            </div>
          </div>
          <div className="divide-y divide-[color:var(--ds-border)] px-6">
            <Field label={t("settings.dream_enable")} desc={t("settings.dream_enable_desc")}>
              <div className="flex items-center gap-3">
                <button
                  onClick={() => setDreamEnabled(!dreamEnabled)}
                  className={cn(
                    "relative h-6 w-10 rounded-full transition-colors",
                    dreamEnabled ? "bg-amber-500" : "bg-[color:var(--ds-border)]"
                  )}
                >
                  <span
                    className={cn(
                      "absolute top-1 h-4 w-4 rounded-full bg-white transition-transform",
                      dreamEnabled ? "translate-x-5" : "translate-x-1"
                    )}
                  />
                </button>
                <span className="text-sm text-[color:var(--ds-text-muted)]">
                  {dreamEnabled ? t("settings.dream_running") : t("settings.dream_disabled")}
                </span>
              </div>
            </Field>
            <Field label={t("settings.dream_what")} desc="">
              <ul className="space-y-2">
                {[
                  t("settings.dream_task_1"),
                  t("settings.dream_task_2"),
                  t("settings.dream_task_3"),
                  t("settings.dream_task_4"),
                  t("settings.dream_task_5"),
                ].map((item) => (
                  <li
                    key={item}
                    className="flex items-start gap-2 text-sm text-[color:var(--ds-text-muted)]"
                  >
                    <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-amber-500/50" />
                    {item}
                  </li>
                ))}
              </ul>
            </Field>
          </div>
        </Card>
      )}

      {/* Kanzlei */}
      {activeTab === "kanzlei" && (
        <Card role="tabpanel" id="panel-kanzlei" aria-labelledby="tab-kanzlei">
          <div className="border-b border-[color:var(--ds-border)] p-6">
            <h2 className="text-base font-semibold text-[color:var(--ds-text)]">
              {t("settings.kanzlei_title")}
            </h2>
            <p className="mt-1 text-sm text-[color:var(--ds-text-muted)]">
              {t("settings.kanzlei_desc")}
            </p>
          </div>
          <div className="divide-y divide-[color:var(--ds-border)] px-6">
            <Field label={t("settings.kanzlei_name")} desc={t("settings.kanzlei_name_desc")}>
              <Input
                {...kanzleiForm.register("kanzleiName")}
                placeholder="Muster Rechtsanwälte Partnerschaft mbB"
              />
              {kanzleiForm.formState.errors.kanzleiName && (
                <p className="mt-1 text-xs text-red-600">
                  {kanzleiForm.formState.errors.kanzleiName.message}
                </p>
              )}
            </Field>

            <Field label={t("settings.anwalt_name")} desc={t("settings.anwalt_name_desc")}>
              <Input
                {...kanzleiForm.register("anwaltName")}
                placeholder="Dr. Max Mustermann, Rechtsanwalt"
              />
              {kanzleiForm.formState.errors.anwaltName && (
                <p className="mt-1 text-xs text-red-600">
                  {kanzleiForm.formState.errors.anwaltName.message}
                </p>
              )}
            </Field>

            <Field label={t("settings.kanzlei_address")} desc={t("settings.kanzlei_address_desc")}>
              <textarea
                {...kanzleiForm.register("kanzleiAdresse")}
                placeholder={"Musterstraße 1\n1010 Wien"}
                rows={3}
                className="w-full rounded-lg border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] px-3 py-2.5 text-sm text-[color:var(--ds-text)] placeholder:text-[color:var(--ds-text-muted)] focus:border-[color:var(--brand-primary)] focus:outline-none"
              />
            </Field>

            <Field label={t("settings.contact")} desc={t("settings.contact_desc")}>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                <Input
                  {...kanzleiForm.register("kanzleiEmail")}
                  placeholder="kanzlei@example.com"
                />
                <Input {...kanzleiForm.register("kanzleiTelefon")} placeholder="+43 ..." />
                <Input {...kanzleiForm.register("kammerNummer")} placeholder="RAK / Register" />
              </div>
            </Field>

            <Field label={t("settings.ust_id")} desc={t("settings.ust_id_desc")}>
              <Input {...kanzleiForm.register("ustId")} placeholder="DEXXXXXXXXX" />
            </Field>

            <Field label={t("settings.tarif_model")} desc={t("settings.tarif_model_desc")}>
              <div className="flex gap-2">
                {(
                  [
                    { key: "custom", label: t("settings.tarif_custom") },
                    { key: "rvg", label: t("settings.tarif_rvg") },
                    { key: "ratg", label: t("settings.tarif_ratg") },
                  ] as const
                ).map((opt) => (
                  <button
                    key={opt.key}
                    onClick={() => kanzleiForm.setValue("tarifModell", opt.key)}
                    className={cn(
                      "rounded-lg border px-4 py-2 text-sm font-medium transition-all",
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
                <Field label={t("settings.hourly_rate")} desc={t("settings.hourly_rate_desc")}>
                  <div className="flex flex-wrap items-center gap-2">
                    <Euro size={14} className="text-[color:var(--ds-text-muted)]" />
                    <Input
                      type="number"
                      {...kanzleiForm.register("stundensatz")}
                      placeholder="200"
                      className="w-32"
                    />
                    <span className="text-sm text-[color:var(--ds-text-muted)]">
                      {t("settings.per_hour")}
                    </span>
                    <Input
                      type="number"
                      {...kanzleiForm.register("abrechnungstakt")}
                      placeholder="15"
                      className="ml-2 w-24"
                    />
                    <span className="text-sm text-[color:var(--ds-text-muted)]">
                      {t("settings.billing_increment")}
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
                        <span className="w-32 text-sm text-[color:var(--ds-text-muted)] capitalize">
                          {gebiet}
                        </span>
                        <Euro size={12} className="text-[color:var(--ds-text-muted)]" />
                        <input
                          type="number"
                          value={String(satz)}
                          onChange={(e) => {
                            const updated = {
                              ...(rechtsgebietSaetzeWatch ?? {}),
                              [gebiet]: parseInt(e.target.value, 10) || 0,
                            };
                            kanzleiForm.setValue("rechtsgebietSaetze", updated);
                          }}
                          className="w-24 rounded-lg border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] px-3 py-1.5 text-sm text-[color:var(--ds-text)] focus:border-[color:var(--brand-primary)] focus:outline-none"
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
                <div className="flex items-start gap-3 rounded-lg border border-amber-500/20 bg-amber-500/5 px-3 py-2">
                  <AlertTriangle size={14} className="mt-0.5 shrink-0 text-amber-600" />
                  <p className="text-xs text-amber-600">
                    {tarifModellWatch === "rvg" ? t("settings.rvg_info") : t("settings.ratg_info")}
                  </p>
                </div>
              </div>
            )}

            <Field label={t("settings.bank_details")} desc={t("settings.bank_details_desc")}>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                <Input {...kanzleiForm.register("bankName")} placeholder="Bank" />
                <Input {...kanzleiForm.register("iban")} placeholder="IBAN" />
                <Input {...kanzleiForm.register("bic")} placeholder="BIC" />
              </div>
            </Field>

            <Field label={t("settings.payment_terms")} desc={t("settings.payment_terms_desc")}>
              <div className="flex items-center gap-2">
                <Input
                  type="number"
                  {...kanzleiForm.register("zahlungszielTage")}
                  placeholder="14"
                  className="w-24"
                />
                <span className="text-sm text-[color:var(--ds-text-muted)]">
                  {t("settings.days_net")}
                </span>
              </div>
            </Field>

            <Field label={t("settings.invoice_footer")} desc={t("settings.invoice_footer_desc")}>
              <textarea
                {...kanzleiForm.register("rechnungFooter")}
                rows={3}
                className="w-full rounded-lg border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] px-3 py-2.5 text-sm text-[color:var(--ds-text)] placeholder:text-[color:var(--ds-text-muted)] focus:border-[color:var(--brand-primary)] focus:outline-none"
              />
            </Field>

            <Field label={t("settings.datev_chart")} desc={t("settings.datev_chart_desc")}>
              <div className="flex gap-2">
                {(
                  [
                    { key: "SKR03", label: "SKR03 (DE)" },
                    { key: "SKR04", label: "SKR04 (DE)" },
                    { key: "SKR49", label: "SKR49 (AT)" },
                  ] as const
                ).map((opt) => (
                  <button
                    key={opt.key}
                    onClick={() => kanzleiForm.setValue("datevKontenrahmen", opt.key)}
                    className={cn(
                      "rounded-lg border px-4 py-2 text-sm font-medium transition-all",
                      kanzleiForm.watch("datevKontenrahmen") === opt.key
                        ? "border-emerald-500/30 bg-emerald-600/15 text-emerald-600"
                        : "border-[color:var(--ds-border)] text-[color:var(--ds-text-muted)] hover:border-[color:var(--ds-border-strong)]"
                    )}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </Field>

            <Field
              label={t("settings.datev_consultant")}
              desc={t("settings.datev_consultant_desc")}
            >
              <Input {...kanzleiForm.register("datevBeraterNr")} placeholder="12345" />
            </Field>

            <Field label={t("settings.datev_client")} desc={t("settings.datev_client_desc")}>
              <Input {...kanzleiForm.register("datevMandantenNr")} placeholder="67890" />
            </Field>

            <Field label={t("settings.smtp_server")} desc={t("settings.smtp_server_desc")}>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-4">
                <Input
                  {...kanzleiForm.register("smtpHost")}
                  placeholder="mail.example.com"
                  className="sm:col-span-2"
                />
                <Input {...kanzleiForm.register("smtpPort")} placeholder="587" className="w-24" />
                <label className="flex items-center gap-2 text-sm text-[color:var(--ds-text-muted)]">
                  <input
                    type="checkbox"
                    {...kanzleiForm.register("smtpSecure")}
                    className="accent-[var(--brand-primary)]"
                  />
                  {t("settings.tls")}
                </label>
              </div>
            </Field>

            <Field label={t("settings.smtp_user")} desc={t("settings.smtp_user_desc")}>
              <Input {...kanzleiForm.register("smtpUser")} placeholder="kanzlei@example.com" />
            </Field>

            <Field label={t("settings.smtp_password")} desc={t("settings.smtp_password_desc")}>
              <Input
                type="password"
                {...kanzleiForm.register("smtpPassword")}
                placeholder="••••••"
              />
            </Field>

            <Field label={t("settings.email_from")} desc={t("settings.email_from_desc")}>
              <Input {...kanzleiForm.register("emailFrom")} placeholder="kanzlei@example.com" />
            </Field>
          </div>
          <div className="border-t border-[color:var(--ds-border)] p-6">
            {kanzleiSaveError && (
              <p className="mb-3 text-sm text-red-600">
                {t("settings.save_fail")} {kanzleiSaveError}
              </p>
            )}
            <Button variant="glow" size="md" onClick={saveKanzleiProfile}>
              {kanzleiSaved ? t("settings.saved") : t("settings.save")}
            </Button>
          </div>
        </Card>
      )}

      {/* Team */}
      {activeTab === "team" && (
        <Card role="tabpanel" id="panel-team" aria-labelledby="tab-team">
          <div className="border-b border-[color:var(--ds-border)] p-6">
            <h2 className="text-base font-semibold tracking-tight text-[color:var(--ds-text)]">
              {t("settings.team_title")}
            </h2>
            <p className="mt-1 text-sm leading-relaxed text-[color:var(--ds-text-muted)]">
              {t("settings.team_desc")}
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
                        {member.name.charAt(0).toUpperCase()}
                      </span>
                    </div>
                    <div>
                      <div className="text-sm font-medium text-[color:var(--ds-text)]">
                        {member.name}
                      </div>
                      <div className="mt-0.5 text-xs text-[color:var(--ds-text-muted)]">
                        {member.email}
                      </div>
                    </div>
                  </div>
                  <select
                    value={member.role}
                    onChange={async (e) => {
                      try {
                        await updateRoleMutation.mutateAsync({
                          userId: member.id,
                          role: e.target.value,
                        });
                        setTeamMembers((prev) =>
                          prev.map((m) => (m.id === member.id ? { ...m, role: e.target.value } : m))
                        );
                      } catch (err) {
                        console.error(
                          "[team] failed to update role:",
                          err instanceof Error ? err.message : String(err)
                        );
                      }
                    }}
                    className="rounded-lg border border-[color:var(--ds-border)] bg-[color:var(--ds-surface-2)] px-3 py-1.5 text-sm text-[color:var(--ds-text)] transition-all focus:border-[color:var(--brand-primary)] focus:ring-2 focus:ring-[var(--brand-primary)] focus:ring-offset-1 focus:ring-offset-[var(--ds-surface)] focus:outline-none"
                  >
                    <option value="admin">{t("settings.role_admin")}</option>
                    <option value="lawyer">{t("settings.role_lawyer")}</option>
                    <option value="assistant">{t("settings.role_assistant")}</option>
                    <option value="client_viewer">{t("settings.role_client_viewer")}</option>
                  </select>
                </div>
              ))
            )}
          </div>
        </Card>
      )}

      {/* SCIM Directory Sync */}
      {activeTab === "scim" && (
        <Card role="tabpanel" id="panel-scim" aria-labelledby="tab-scim">
          <div className="border-b border-[color:var(--ds-border)] p-6">
            <div className="flex items-center gap-3">
              <Network size={18} className="text-[color:var(--ds-text-muted)]" />
              <div>
                <h2 className="text-base font-semibold tracking-tight text-[color:var(--ds-text)]">
                  {t("settings.scim_title")}
                </h2>
                <p className="mt-1 text-sm leading-relaxed text-[color:var(--ds-text-muted)]">
                  {t("settings.scim_desc")}
                </p>
              </div>
            </div>
          </div>
          <div className="divide-y divide-[color:var(--ds-border)] px-6">
            <Field label={t("settings.scim_endpoint")} desc={t("settings.scim_endpoint_desc")}>
              <code className="block rounded-lg border border-[color:var(--ds-border)] bg-[color:var(--ds-surface-2)] px-3 py-2 font-mono text-xs text-[color:var(--ds-text-muted)]">
                {typeof window !== "undefined" ? window.location.origin : "https://subsum.eu"}
                /api/scim
              </code>
            </Field>
            <Field label={t("settings.scim_features")} desc={t("settings.scim_features_desc")}>
              <ul className="space-y-2">
                {[
                  t("settings.scim_feature_1"),
                  t("settings.scim_feature_2"),
                  t("settings.scim_feature_3"),
                  t("settings.scim_feature_4"),
                ].map((item) => (
                  <li
                    key={item}
                    className="flex items-start gap-2 text-sm text-[color:var(--ds-text-muted)]"
                  >
                    <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-500/50" />
                    {item}
                  </li>
                ))}
              </ul>
            </Field>
            <Field label={t("settings.scim_manage")} desc={t("settings.scim_manage_desc")}>
              <Link href="/dashboard/settings/scim">
                <Button variant="outline" size="sm">
                  {t("settings.scim_manage_button")}
                </Button>
              </Link>
            </Field>
          </div>
        </Card>
      )}

      {/* Account */}
      {activeTab === "account" && (
        <Card role="tabpanel" id="panel-account" aria-labelledby="tab-account">
          <div className="border-b border-[color:var(--ds-border)] p-6">
            <h2 className="text-base font-semibold tracking-tight text-[color:var(--ds-text)]">
              {t("settings.account_title")}
            </h2>
          </div>
          <div className="divide-y divide-[color:var(--ds-border)] px-6">
            <Field label={t("settings.plan")} desc={t("settings.plan_desc")}>
              <div className="flex items-center gap-3">
                <Badge variant="accent" className="px-3 py-1 text-sm">
                  Free
                </Badge>
                <Link href="/dashboard/billing">
                  <Button variant="outline" size="sm">
                    {t("settings.upgrade")}
                  </Button>
                </Link>
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
                      0 / 100
                    </span>
                  </div>
                  <div className="h-1.5 overflow-hidden rounded-full bg-[color:var(--ds-border)]">
                    <div className="brand-bg h-full w-0 rounded-full" />
                  </div>
                </div>
                <div>
                  <div className="mb-1.5 flex justify-between text-xs">
                    <span className="text-[color:var(--ds-text-muted)]">
                      {t("settings.usage_queries")}
                    </span>
                    <span className="font-mono text-[color:var(--ds-text)] tabular-nums">
                      0 / 50
                    </span>
                  </div>
                  <div className="h-1.5 overflow-hidden rounded-full bg-[color:var(--ds-border)]">
                    <div className="brand-bg h-full w-0 rounded-full" />
                  </div>
                </div>
              </div>
            </Field>
            <Field label={t("settings.referral")} desc={t("settings.referral_desc")}>
              <div className="space-y-3">
                <div className="flex items-center gap-2 rounded-lg border border-amber-500/20 bg-gradient-to-r from-amber-500/10 to-transparent px-4 py-3">
                  <Gift size={15} className="shrink-0 text-amber-600" />
                  <p className="text-xs leading-relaxed text-[color:var(--ds-text-muted)]">
                    {t("settings.referral_info")}
                    {referrals !== null && (
                      <span className="font-medium text-amber-600">
                        {" "}
                        {t("settings.referral_so_far")} {referrals}.
                      </span>
                    )}
                  </p>
                </div>
                <MaskedInput value={referralUrl} placeholder={t("settings.referral_loading")} />
                <Link
                  href="/partners"
                  className="brand-text inline-flex items-center gap-1 text-xs hover:underline"
                >
                  {t("settings.partner_link")} <ExternalLink size={10} />
                </Link>
              </div>
            </Field>
            <Field label={t("settings.data_export")} desc={t("settings.data_export_desc")}>
              <a href="/api/export" download>
                <Button variant="outline" size="sm">
                  {t("settings.export_button")}
                </Button>
              </a>
            </Field>
          </div>
        </Card>
      )}
    </div>
  );
}
