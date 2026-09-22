"use client";

import { useState, useEffect } from "react";
import { CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  loadKanzleiSettings,
  saveKanzleiSettings,
  type KanzleiSettings,
} from "@/lib/kanzlei-settings";
import { PageHeader } from "@/components/dashboard/page-header";
import { useLang } from "@/lib/use-lang";
import { csrfFetch } from "@/lib/csrf";
import { BrainLearningCard } from "@/components/dashboard/brain-learning-card";

export default function KanzleiSettingsPage() {
  const { t, lang } = useLang();
  const L = (de: string, en: string) => (lang === "en" ? en : de);
  const [settings, setSettings] = useState<KanzleiSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadFailed, setLoadFailed] = useState(false);
  const [saveFailed, setSaveFailed] = useState(false);
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    loadKanzleiSettings()
      .then((s) => {
        setSettings({ ...s, rechtsraumCountry: "AT", rechtsraumState: "AT" });
        setLoading(false);
      })
      .catch(() => {
        setLoadFailed(true);
        setLoading(false);
      });
  }, []);

  const update = (field: keyof KanzleiSettings, value: string | boolean | number) => {
    setSettings((s) => (s ? { ...s, [field]: value } : s));
    setSaved(false);
  };

  async function handleSave() {
    if (!settings || saving) return;
    setSaving(true);
    setSaveFailed(false);
    try {
      await saveKanzleiSettings(settings);
      // Sync jurisdiction to the user record so jurisdiction-scoped law search works.
      if (settings.rechtsraumCountry) {
        await csrfFetch("/api/settings/jurisdiction", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ jurisdiction: settings.rechtsraumCountry }),
        }).catch(() => {});
      }
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch {
      setSaveFailed(true);
    } finally {
      setSaving(false);
    }
  }

  const header = (
    <PageHeader
      title={L("Kanzleiprofil", "Firm profile")}
      description={L(
        "Stammdaten Ihrer Kanzlei, die auf Rechnungen, Briefen und Schriftsätzen erscheinen.",
        "Your firm's master data as it appears on invoices, letters and briefs."
      )}
      breadcrumbs={[
        { label: t("breadcrumb.dashboard"), href: "/dashboard" },
        { label: t("settings.title"), href: "/dashboard/settings" },
        { label: L("Kanzleiprofil", "Firm profile") },
      ]}
    />
  );

  if (loading) {
    return (
      <div className="ds-page ds-page-narrow space-y-6 p-4 md:p-6 lg:p-8">
        {header}
        <div className="space-y-3" role="status" aria-label={L("Wird geladen", "Loading")}>
          <Skeleton className="h-64 w-full rounded-xl" />
          <Skeleton className="h-32 w-full rounded-xl" />
        </div>
      </div>
    );
  }

  if (!settings) {
    return (
      <div className="ds-page ds-page-narrow space-y-6 p-4 md:p-6 lg:p-8">
        {header}
        <div
          role="alert"
          className="rounded-xl border border-[color:var(--ds-danger-border)] bg-[color:var(--ds-danger-bg)] px-4 py-3 text-sm text-[color:var(--ds-danger-text)]"
        >
          {loadFailed
            ? t("kanzlei.err_load")
            : L("Keine Kanzleidaten vorhanden.", "No firm data available.")}{" "}
          {L("Bitte laden Sie die Seite neu.", "Please reload the page.")}
        </div>
      </div>
    );
  }

  return (
    <div className="ds-page ds-page-narrow space-y-6 p-4 md:p-6 lg:p-8">
      {header}

      <Section
        title={L("Kanzlei und Anschrift", "Firm and address")}
        description={L(
          "Erscheint im Briefkopf und auf jeder Rechnung.",
          "Shown in the letterhead and on every invoice."
        )}
      >
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <Field
              id="k-name"
              label={t("kanzlei.firm_name")}
              value={settings.kanzleiName}
              onChange={(v) => update("kanzleiName", v)}
            />
          </div>
          <div className="sm:col-span-2">
            <Field
              id="k-street"
              label={t("kanzlei.street")}
              value={settings.street ?? ""}
              onChange={(v) => update("street", v)}
            />
          </div>
          <Field
            id="k-zip"
            label={L("PLZ", "Postcode")}
            value={settings.zip ?? ""}
            onChange={(v) => update("zip", v)}
          />
          <Field
            id="k-city"
            label={t("kanzlei.city")}
            value={settings.city ?? ""}
            onChange={(v) => update("city", v)}
          />
          <Field
            id="k-phone"
            label={t("kanzlei.phone")}
            value={settings.kanzleiTelefon ?? ""}
            onChange={(v) => update("kanzleiTelefon", v)}
          />
          <Field
            id="k-email"
            label={L("E-Mail", "E-mail")}
            value={settings.kanzleiEmail ?? ""}
            onChange={(v) => update("kanzleiEmail", v)}
          />
          <div className="sm:col-span-2">
            <Field
              id="k-website"
              label={t("kanzlei.website")}
              value={settings.website ?? ""}
              onChange={(v) => update("website", v)}
            />
          </div>
          <Field
            id="k-aktenzeichen-prefix"
            label={L("Aktenzeichen-Kürzel (optional)", "Case-number prefix (optional)")}
            hint={L(
              "Wird automatisch vergebene Aktenzeichen vorangestellt, z. B. „MK“ → MK-26-0042.",
              "Prepended to automatically allocated case numbers, e.g. “MK” → MK-26-0042."
            )}
            value={settings.aktenzeichenPrefix ?? ""}
            onChange={(v) => update("aktenzeichenPrefix", v.toUpperCase().trim())}
          />
          <div className="sm:col-span-2">
            <Field
              id="k-logo"
              label={L("Logo (Webadresse, optional)", "Logo (web address, optional)")}
              hint={L(
                "Adresse eines Bildes Ihres Logos; es wird im Kopf von Rechnungen verwendet.",
                "Address of an image of your logo; used in the invoice header."
              )}
              value={settings.logoUrl ?? ""}
              onChange={(v) => update("logoUrl", v)}
            />
          </div>
        </div>
      </Section>

      <Section
        title={L("Steuer und Bankverbindung", "Tax and bank details")}
        description={L(
          "Pflichtangaben auf Honorarnoten nach § 11 UStG.",
          "Mandatory information on invoices under § 11 UStG."
        )}
      >
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field
            id="k-uid"
            label={L("UID-Nummer", "VAT ID")}
            value={settings.ustId}
            onChange={(v) => update("ustId", v)}
          />
          <Field
            id="k-taxno"
            label={t("kanzlei.tax_id")}
            value={settings.taxNumber ?? ""}
            onChange={(v) => update("taxNumber", v)}
          />
          <div className="sm:col-span-2">
            <Field
              id="k-bank"
              label={t("kanzlei.bank")}
              value={settings.bankName ?? ""}
              onChange={(v) => update("bankName", v)}
            />
          </div>
          <Field
            id="k-iban"
            label="IBAN"
            value={settings.iban ?? ""}
            onChange={(v) => update("iban", v)}
          />
          <Field
            id="k-bic"
            label="BIC"
            value={settings.bic ?? ""}
            onChange={(v) => update("bic", v)}
          />
        </div>
      </Section>

      <Section
        title={L("Buchhaltungsexport (BMD / RZL)", "Accounting export (BMD / RZL)")}
        description={L(
          "Debitoren- und Erlöskonto sind kanzleispezifisch — bitte einmalig mit dem Steuerberater abstimmen. Der BMD-Steuercode ist pro BMD-Mandant individuell konfiguriert, es gibt keinen allgemeingültigen Wert.",
          "Debtor and revenue accounts are firm-specific — confirm them with your tax advisor once. The BMD tax code is configured per BMD client and has no universal value."
        )}
      >
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field
            id="k-fibu-debitor"
            label={L("Debitorenkonto", "Debtor account")}
            value={settings.fibuDebitorKonto ?? ""}
            onChange={(v) => update("fibuDebitorKonto", v)}
            hint={L("z. B. 20000", "e.g. 20000")}
          />
          <Field
            id="k-fibu-erloes"
            label={L("Erlöskonto", "Revenue account")}
            value={settings.fibuErloesKonto ?? ""}
            onChange={(v) => update("fibuErloesKonto", v)}
            hint={L("z. B. 4000", "e.g. 4000")}
          />
          <Field
            id="k-fibu-bmd-20"
            label={L("BMD-Steuercode für 20 %", "BMD tax code for 20%")}
            value={settings.fibuBmdSteuercode20 ?? ""}
            onChange={(v) => update("fibuBmdSteuercode20", v)}
          />
          <Field
            id="k-fibu-bmd-13"
            label={L("BMD-Steuercode für 13 %", "BMD tax code for 13%")}
            value={settings.fibuBmdSteuercode13 ?? ""}
            onChange={(v) => update("fibuBmdSteuercode13", v)}
          />
          <Field
            id="k-fibu-bmd-10"
            label={L("BMD-Steuercode für 10 %", "BMD tax code for 10%")}
            value={settings.fibuBmdSteuercode10 ?? ""}
            onChange={(v) => update("fibuBmdSteuercode10", v)}
          />
        </div>
      </Section>

      <Section
        title={L("Anmeldung im Team", "Team sign-in")}
        description={L(
          "Gilt für alle Mitglieder Ihrer Kanzlei.",
          "Applies to every member of your firm."
        )}
      >
        <label htmlFor="require2fa" className="flex cursor-pointer items-start gap-3">
          <input
            id="require2fa"
            type="checkbox"
            checked={settings.require2FA ?? false}
            onChange={(e) => update("require2FA", e.target.checked)}
            className="mt-0.5 h-4 w-4 rounded border-[color:var(--ds-border-strong)] accent-[var(--brand-primary)]"
          />
          <div>
            <p className="text-sm font-medium text-[color:var(--ds-text)]">
              {L(
                "Zwei-Faktor-Anmeldung für alle verpflichtend",
                "Require two-factor sign-in for everyone"
              )}
            </p>
            <p className="mt-1 text-xs text-[color:var(--ds-text-muted)]">
              {L(
                "Jedes Mitglied muss bei der nächsten Anmeldung einen Code aus einer Authenticator-App einrichten.",
                "Every member must set up a code from an authenticator app at their next sign-in."
              )}
            </p>
          </div>
        </label>
      </Section>

      <Section
        title={L("Öffentliche Terminbuchung", "Public appointment booking")}
        description={L(
          "Mandanten und Interessierte können unter /termin freie Zeitfenster buchen. Belegte Termine (inkl. WhatsApp-Buchungen) werden automatisch berücksichtigt; die Kanzlei wird per E-Mail benachrichtigt.",
          "Clients and prospects can book free time slots at /termin. Booked appointments (including WhatsApp bookings) are respected automatically; the firm is notified by email."
        )}
      >
        <label htmlFor="booking-enabled" className="flex cursor-pointer items-start gap-3">
          <input
            id="booking-enabled"
            type="checkbox"
            checked={settings.bookingEnabled ?? false}
            onChange={(e) => update("bookingEnabled", e.target.checked)}
            className="mt-0.5 h-4 w-4 rounded border-[color:var(--ds-border-strong)] accent-[var(--brand-primary)]"
          />
          <div>
            <p className="text-sm font-medium text-[color:var(--ds-text)]">
              {L("Online-Terminbuchung aktivieren", "Enable online appointment booking")}
            </p>
            <p className="mt-1 text-xs text-[color:var(--ds-text-muted)]">
              {L(
                "Aktiviert die öffentliche Buchungsseite /termin für diese Kanzlei-Instanz.",
                "Enables the public booking page /termin for this firm instance."
              )}
            </p>
          </div>
        </label>
        {settings.bookingEnabled && (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <Field
              id="booking-start"
              label={L("Buchbar ab", "Bookable from")}
              value={settings.bookingStart ?? "09:00"}
              onChange={(v) => update("bookingStart", v)}
            />
            <Field
              id="booking-end"
              label={L("Buchbar bis", "Bookable until")}
              value={settings.bookingEnd ?? "17:00"}
              onChange={(v) => update("bookingEnd", v)}
            />
            <Field
              id="booking-minutes"
              label={L("Slot-Länge (Minuten)", "Slot length (minutes)")}
              value={String(settings.bookingSlotMinutes ?? 30)}
              onChange={(v) => {
                const n = Number(v);
                if (Number.isFinite(n) && n >= 15 && n <= 240) update("bookingSlotMinutes", n);
              }}
            />
          </div>
        )}
      </Section>

      <Section
        title={L("Rechtsraum", "Jurisdiction")}
        description={L(
          "Bestimmt, welche Rechtsquellen durchsucht und welche Feiertage bei Fristen berücksichtigt werden. Derzeit ist Österreich (bundesweit) fest eingestellt.",
          "Determines which legal sources are searched and which public holidays count for deadlines. Currently fixed to Austria (federal)."
        )}
      >
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="space-y-1">
            <label
              htmlFor="rechtsraum-country"
              className="text-xs text-[color:var(--ds-text-muted)]"
            >
              {L("Land", "Country")}
            </label>
            <select
              id="rechtsraum-country"
              value="AT"
              disabled
              className="w-full rounded-lg border border-[color:var(--ds-border)] bg-[color:var(--ds-surface-2)] px-3 py-2 text-sm text-[color:var(--ds-text)]"
            >
              <option value="AT">Österreich</option>
            </select>
          </div>
          <div className="space-y-1">
            <label htmlFor="rechtsraum-state" className="text-xs text-[color:var(--ds-text-muted)]">
              {L("Geltungsbereich", "Scope")}
            </label>
            <select
              id="rechtsraum-state"
              value="AT"
              disabled
              className="w-full rounded-lg border border-[color:var(--ds-border)] bg-[color:var(--ds-surface-2)] px-3 py-2 text-sm text-[color:var(--ds-text)]"
            >
              <option value="AT">Österreich (bundesweit)</option>
            </select>
          </div>
        </div>
      </Section>

      <div className="flex flex-wrap items-center gap-3 border-t border-[color:var(--ds-border)] pt-4">
        <Button onClick={() => void handleSave()} disabled={saving} loading={saving}>
          {t("settings.kanzlei.btn_save")}
        </Button>
        {saved && (
          <span
            role="status"
            className="flex items-center gap-1 text-sm text-[color:var(--ds-success-text)]"
          >
            <CheckCircle2 size={14} aria-hidden />
            {t("settings.kanzlei.toast_saved")}
          </span>
        )}
        {saveFailed && (
          <span role="alert" className="text-sm text-[color:var(--ds-danger-text)]">
            {L(
              "Speichern fehlgeschlagen. Bitte versuchen Sie es erneut.",
              "Saving failed. Please try again."
            )}
          </span>
        )}
      </div>

      {/* Saves on its own (switch), separate from the profile form above. */}
      <BrainLearningCard />
    </div>
  );
}

function Section({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-4 rounded-xl border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] p-5">
      <div>
        <h2 className="text-sm font-semibold text-[color:var(--ds-text)]">{title}</h2>
        {description && (
          <p className="mt-1 text-xs leading-relaxed text-[color:var(--ds-text-muted)]">
            {description}
          </p>
        )}
      </div>
      {children}
    </section>
  );
}

function Field({
  id,
  label,
  hint,
  value,
  onChange,
}: {
  id: string;
  label: string;
  hint?: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div className="space-y-1">
      <label htmlFor={id} className="text-xs text-[color:var(--ds-text-muted)]">
        {label}
      </label>
      <input
        id={id}
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-lg border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] px-3 py-2 text-sm text-[color:var(--ds-text)] placeholder:text-[color:var(--ds-text-muted)] focus:border-[color:var(--brand-primary)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-primary)] focus-visible:ring-offset-1"
      />
      {hint && <p className="text-xs text-[color:var(--ds-text-subtle)]">{hint}</p>}
    </div>
  );
}
