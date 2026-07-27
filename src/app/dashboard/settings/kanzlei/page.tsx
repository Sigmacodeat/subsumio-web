"use client";

import { useState, useEffect } from "react";
import { Save, CheckCircle2, Loader2, Shield, MapPin } from "lucide-react";
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
  const [saving, setSaving] = useState(false);

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
    if (!settings || saving) return;
    setSaving(true);
    setError(null);
    try {
      await saveKanzleiSettings(settings);
      // Sync jurisdiction to User model so engineContext() can set the
      // x-subsumio-jurisdiction header for jurisdiction-scoped law search.
      if (settings.rechtsraumCountry) {
        await fetch("/api/settings/jurisdiction", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ jurisdiction: settings.rechtsraumCountry }),
        }).catch(() => {});
      }
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (err) {
      setError(err instanceof Error ? err.message : t("settings.kanzlei.error_save"));
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div
        className="mx-auto flex max-w-3xl items-center gap-2 p-6 text-[color:var(--ds-text-muted)]"
        role="status"
        aria-live="polite"
      >
        <Loader2 size={16} className="animate-spin" /> {t("retention.loading")}
      </div>
    );
  }

  if (!settings) {
    return (
      <div className="mx-auto max-w-3xl p-6 text-[color:var(--ds-danger-text)]">
        {error ?? t("kanzlei.err_load")}
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
        <div className="rounded-xl border border-[color:var(--ds-danger-border)] bg-[color:var(--ds-danger-bg)] px-4 py-3 text-sm text-[color:var(--ds-danger-text)]">
          {error}
        </div>
      )}

      <div className="space-y-4 rounded-xl border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] p-5">
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <Field
            label={t("kanzlei.firm_name")}
            value={settings.kanzleiName}
            onChange={(v) => update("kanzleiName", v)}
          />
          <Field
            label={t("kanzlei.street")}
            value={settings.street ?? ""}
            onChange={(v) => update("street", v)}
          />
          <Field label="PLZ" value={settings.zip ?? ""} onChange={(v) => update("zip", v)} />
          <Field
            label={t("kanzlei.city")}
            value={settings.city ?? ""}
            onChange={(v) => update("city", v)}
          />
          <Field
            label={t("kanzlei.phone")}
            value={settings.kanzleiTelefon ?? ""}
            onChange={(v) => update("kanzleiTelefon", v)}
          />
          <Field
            label="E-Mail"
            value={settings.kanzleiEmail ?? ""}
            onChange={(v) => update("kanzleiEmail", v)}
          />
          <Field
            label={t("kanzlei.website")}
            value={settings.website ?? ""}
            onChange={(v) => update("website", v)}
          />
          <Field label="USt-IdNr" value={settings.ustId} onChange={(v) => update("ustId", v)} />
          <Field
            label={t("kanzlei.tax_id")}
            value={settings.taxNumber ?? ""}
            onChange={(v) => update("taxNumber", v)}
          />
          <Field
            label={t("kanzlei.bank")}
            value={settings.bankName ?? ""}
            onChange={(v) => update("bankName", v)}
          />
          <Field label="IBAN" value={settings.iban ?? ""} onChange={(v) => update("iban", v)} />
          <Field label="BIC" value={settings.bic ?? ""} onChange={(v) => update("bic", v)} />
          <div className="md:col-span-2">
            <Field
              label={t("kanzlei.logo_url")}
              value={settings.logoUrl ?? ""}
              onChange={(v) => update("logoUrl", v)}
            />
          </div>
        </div>

        <div className="flex items-center gap-3 pt-2">
          <Button
            className="gap-2 bg-slate-600 text-sm text-white hover:bg-slate-500"
            onClick={() => void handleSave()}
            disabled={saving}
            loading={saving}
          >
            {!saving && <Save size={14} />}
            {t("settings.kanzlei.btn_save")}
          </Button>
          {saved && (
            <span className="flex items-center gap-1 text-sm text-[color:var(--ds-success-text)]">
              <CheckCircle2 size={14} />
              {t("settings.kanzlei.toast_saved")}
            </span>
          )}
        </div>
      </div>

      {/* Security: 2FA enforcement */}
      <div className="space-y-4 rounded-xl border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] p-5">
        <div className="flex items-center gap-2">
          <Shield size={16} className="text-[color:var(--ds-warning-text)]" />
          <h2 className="text-sm font-semibold text-[color:var(--ds-text)]">
            {t("settings.security.title")}
          </h2>
        </div>
        <label htmlFor="require2fa" className="flex cursor-pointer items-start gap-3">
          <input
            id="require2fa"
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
            disabled={saving}
            loading={saving}
          >
            {!saving && <Save size={14} />}
            {t("settings.kanzlei.btn_save")}
          </Button>
          {saved && (
            <span className="flex items-center gap-1 text-sm text-[color:var(--ds-success-text)]">
              <CheckCircle2 size={14} />
              {t("settings.kanzlei.toast_saved")}
            </span>
          )}
        </div>
      </div>

      {/* Rechtsraum: Land + Bundesland/Kanton */}
      <div className="space-y-4 rounded-xl border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] p-5">
        <div className="flex items-center gap-2">
          <MapPin size={16} className="text-[color:var(--ds-info-text)]" />
          <h2 className="text-sm font-semibold text-[color:var(--ds-text)]">Rechtsraum</h2>
        </div>
        <p className="text-xs text-[color:var(--ds-text-muted)]">
          Bestimmt die Feiertagsverschiebung bei der Fristenberechnung (§ 222 Abs. 2 ZPO / § 193
          BGB). Ohne Angabe werden nur Samstag/Sonntag verschoben, keine regionalen Feiertage.
        </p>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <div className="space-y-1">
            <label
              htmlFor="rechtsraum-country"
              className="text-xs text-[color:var(--ds-text-muted)]"
            >
              Land
            </label>
            <select
              id="rechtsraum-country"
              value={settings.rechtsraumCountry ?? ""}
              onChange={(e) => {
                update("rechtsraumCountry", e.target.value);
                update("rechtsraumState", "");
              }}
              className="w-full rounded-lg border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] px-3 py-2 text-sm text-[color:var(--ds-text)] focus:border-slate-500/50 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-primary)] focus-visible:ring-offset-1"
            >
              <option value="">— Bitte wählen —</option>
              <option value="DE">Deutschland</option>
              <option value="AT">Österreich</option>
              <option value="CH">Schweiz</option>
            </select>
          </div>
          <div className="space-y-1">
            <label htmlFor="rechtsraum-state" className="text-xs text-[color:var(--ds-text-muted)]">
              {settings.rechtsraumCountry === "CH"
                ? t("kanzlei.region_label")
                : t("kanzlei.region_label_de")}
            </label>
            <select
              id="rechtsraum-state"
              value={settings.rechtsraumState ?? ""}
              onChange={(e) => update("rechtsraumState", e.target.value)}
              className="w-full rounded-lg border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] px-3 py-2 text-sm text-[color:var(--ds-text)] focus:border-slate-500/50 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-primary)] focus-visible:ring-offset-1"
            >
              <option value="">— Bitte wählen —</option>
              {settings.rechtsraumCountry === "AT" && (
                <option value="AT">Österreich (bundesweit)</option>
              )}
              {settings.rechtsraumCountry === "DE" &&
                [
                  "BW",
                  "BY",
                  "BE",
                  "BB",
                  "HB",
                  "HH",
                  "HE",
                  "MV",
                  "NI",
                  "NW",
                  "RP",
                  "SL",
                  "SN",
                  "ST",
                  "SH",
                  "TH",
                ].map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              {settings.rechtsraumCountry === "CH" &&
                [
                  "ZH",
                  "BE",
                  "LU",
                  "UR",
                  "SZ",
                  "OW",
                  "NW",
                  "GL",
                  "ZG",
                  "FR",
                  "SO",
                  "BS",
                  "BL",
                  "SH",
                  "AR",
                  "AI",
                  "SG",
                  "GR",
                  "AG",
                  "TG",
                  "TI",
                  "VD",
                  "VS",
                  "NE",
                  "GE",
                  "JU",
                ].map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
            </select>
          </div>
        </div>
        <div className="flex items-center gap-3 pt-2">
          <Button
            className="gap-2 bg-slate-600 text-sm text-white hover:bg-slate-500"
            onClick={() => void handleSave()}
            disabled={saving}
            loading={saving}
          >
            {!saving && <Save size={14} />}
            {t("settings.kanzlei.btn_save")}
          </Button>
          {saved && (
            <span className="flex items-center gap-1 text-sm text-[color:var(--ds-success-text)]">
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
  const fieldId = `field-${label.replace(/\s+/g, "-").toLowerCase()}`;
  return (
    <div className="space-y-1">
      <label htmlFor={fieldId} className="text-xs text-[color:var(--ds-text-muted)]">
        {label}
      </label>
      <input
        id={fieldId}
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-lg border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] px-3 py-2 text-sm text-[color:var(--ds-text)] placeholder:text-[color:var(--ds-text-muted)] focus:border-slate-500/50 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-primary)] focus-visible:ring-offset-1"
      />
    </div>
  );
}
