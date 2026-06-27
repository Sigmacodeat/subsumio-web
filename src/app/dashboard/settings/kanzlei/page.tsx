"use client";

import { useState, useEffect } from "react";
import { Save, CheckCircle2, Loader2, Shield } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  loadKanzleiSettings,
  saveKanzleiSettings,
  type KanzleiSettings,
} from "@/lib/kanzlei-settings";
import { PageHeader } from "@/components/dashboard/page-header";
import { useLang } from "@/lib/use-lang";

export default function KanzleiSettingsPage() {
  const { t } = useLang();
  const [settings, setSettings] = useState<KanzleiSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    loadKanzleiSettings()
      .then((s) => {
        setSettings(s);
        setLoading(false);
      })
      .catch((err) => {
        setError(err instanceof Error ? err.message : t("settings.kanzlei.error_save"));
        setLoading(false);
      });
  }, [t]);

  const update = (field: keyof KanzleiSettings, value: string) => {
    setSettings((s) => (s ? { ...s, [field]: value } : s));
    setSaved(false);
  };

  async function handleSave() {
    if (!settings) return;
    setError(null);
    try {
      await saveKanzleiSettings(settings);
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (err) {
      setError(err instanceof Error ? err.message : t("settings.kanzlei.error_save"));
    }
  }

  if (loading) {
    return (
      <div className="mx-auto flex max-w-3xl items-center gap-2 p-6 text-[color:var(--ds-text-muted)]">
        <Loader2 size={16} className="animate-spin" /> {t("retention.loading")}
      </div>
    );
  }

  if (!settings) {
    return (
      <div className="mx-auto max-w-3xl p-6 text-red-700">
        {error ?? "Einstellungen konnten nicht geladen werden."}
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-[900px] space-y-6 p-4 md:p-6 lg:p-8">
      <PageHeader
        title={t("settings.kanzlei.title")}
        description={t("settings.kanzlei.description")}
      />

      {error && (
        <div className="rounded-xl border border-red-500/20 bg-red-500/5 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      <div className="space-y-4 rounded-xl border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] p-5">
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <Field
            label="Kanzleiname"
            value={settings.kanzleiName}
            onChange={(v) => update("kanzleiName", v)}
          />
          <Field
            label="Straße"
            value={settings.street ?? ""}
            onChange={(v) => update("street", v)}
          />
          <Field label="PLZ" value={settings.zip ?? ""} onChange={(v) => update("zip", v)} />
          <Field label="Ort" value={settings.city ?? ""} onChange={(v) => update("city", v)} />
          <Field
            label="Telefon"
            value={settings.kanzleiTelefon ?? ""}
            onChange={(v) => update("kanzleiTelefon", v)}
          />
          <Field
            label="E-Mail"
            value={settings.kanzleiEmail ?? ""}
            onChange={(v) => update("kanzleiEmail", v)}
          />
          <Field
            label="Webseite"
            value={settings.website ?? ""}
            onChange={(v) => update("website", v)}
          />
          <Field label="USt-IdNr" value={settings.ustId} onChange={(v) => update("ustId", v)} />
          <Field
            label="Steuernummer"
            value={settings.taxNumber ?? ""}
            onChange={(v) => update("taxNumber", v)}
          />
          <Field
            label="Bank"
            value={settings.bankName ?? ""}
            onChange={(v) => update("bankName", v)}
          />
          <Field label="IBAN" value={settings.iban ?? ""} onChange={(v) => update("iban", v)} />
          <Field label="BIC" value={settings.bic ?? ""} onChange={(v) => update("bic", v)} />
          <div className="md:col-span-2">
            <Field
              label="Logo-URL (optional)"
              value={settings.logoUrl ?? ""}
              onChange={(v) => update("logoUrl", v)}
            />
          </div>
        </div>

        <div className="flex items-center gap-3 pt-2">
          <Button
            className="gap-2 bg-slate-600 text-sm text-white hover:bg-slate-500"
            onClick={() => void handleSave()}
          >
            <Save size={14} />
            {t("settings.kanzlei.btn_save")}
          </Button>
          {saved && (
            <span className="flex items-center gap-1 text-sm text-emerald-600">
              <CheckCircle2 size={14} />
              {t("settings.kanzlei.toast_saved")}
            </span>
          )}
        </div>
      </div>

      {/* Security: 2FA enforcement */}
      <div className="space-y-4 rounded-xl border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] p-5">
        <div className="flex items-center gap-2">
          <Shield size={16} className="text-amber-600" />
          <h2 className="text-sm font-semibold text-[color:var(--ds-text)]">
            {t("settings.security.title")}
          </h2>
        </div>
        <label className="flex cursor-pointer items-start gap-3">
          <input
            type="checkbox"
            checked={settings.require2FA ?? false}
            onChange={(e) => {
              setSettings((s) => (s ? { ...s, require2FA: e.target.checked } : s));
              setSaved(false);
            }}
            className="mt-0.5 h-4 w-4 rounded border-[color:var(--ds-border-strong)] accent-amber-600"
          />
          <div>
            <p className="text-sm font-medium text-[color:var(--ds-text)]">
              2FA für alle Teammitglieder verpflichtend
            </p>
            <p className="mt-1 text-xs text-[color:var(--ds-text-muted)]">
              Alle Kanzlei-Mitglieder müssen Zwei-Faktor-Authentifizierung aktivieren. Wird beim
              nächsten Login erzwungen.
            </p>
          </div>
        </label>
        <div className="flex items-center gap-3 pt-2">
          <Button
            className="gap-2 bg-slate-600 text-sm text-white hover:bg-slate-500"
            onClick={() => void handleSave()}
          >
            <Save size={14} />
            {t("settings.kanzlei.btn_save")}
          </Button>
          {saved && (
            <span className="flex items-center gap-1 text-sm text-emerald-600">
              <CheckCircle2 size={14} />
              {t("settings.kanzlei.toast_saved")}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div className="space-y-1">
      <label className="text-xs text-[color:var(--ds-text-muted)]">{label}</label>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-lg border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] px-3 py-2 text-sm text-[color:var(--ds-text)] placeholder:text-[color:var(--ds-text-muted)] focus:border-slate-500/50 focus:outline-none"
      />
    </div>
  );
}
