"use client";

// Settings → Privatsphäre und Daten (DSGVO). Self-service für Art. 15/20
// (Datenexport) und Art. 17 (Kontolöschung). Die Löschung läuft über
// /api/settings/gdpr/data-deletion: Bestätigungstext "DELETE_MY_ACCOUNT" plus
// erneute Anmeldung (Passwort, bei aktiver 2FA zusätzlich der Code). Der
// Server verweigert die Löschung bei Legal Hold oder laufender
// Aufbewahrungsfrist und nennt den Grund.

import { useState } from "react";
import {
  Download,
  FileJson,
  FileText,
  Info,
  Loader2,
  ScrollText,
  ShieldAlert,
  Trash2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { PageHeader } from "@/components/dashboard/page-header";
import { useLang } from "@/lib/use-lang";
import { csrfFetch } from "@/lib/csrf";
import { useMe } from "@/lib/queries/auth";

const CONFIRM_PHRASE = "DELETE_MY_ACCOUNT";

export default function PrivacySettingsPage() {
  const { t, lang } = useLang();
  const L = (de: string, en: string) => (lang === "en" ? en : de);

  const [dialogOpen, setDialogOpen] = useState(false);
  const [confirmInput, setConfirmInput] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const { data: me } = useMe();
  const twoFactorEnabled = Boolean(
    (me as { twoFactorEnabled?: boolean } | undefined)?.twoFactorEnabled
  );
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [avvPdfLoading, setAvvPdfLoading] = useState(false);
  const [avvPdfError, setAvvPdfError] = useState<string | null>(null);

  const canConfirm = confirmInput.trim() === CONFIRM_PHRASE;

  // AVV-Muster als PDF: das Markdown unter /legal wird clientseitig mit
  // jsPDF gerendert (kein Server-Roundtrip, kein Tracking). Lazy-Import
  // hält jsPDF aus dem initialen Bundle der Settings-Seite.
  async function handleAvvPdf() {
    if (avvPdfLoading) return;
    setAvvPdfLoading(true);
    setAvvPdfError(null);
    try {
      const res = await fetch("/legal/avv-template.md");
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const content = await res.text();
      const { generateDraftPdf } = await import("@/lib/legal-draft-pdf");
      const doc = generateDraftPdf({
        title: L(
          "Auftragsverarbeitungsvertrag (Art. 28 DSGVO)",
          "Data processing agreement (Art. 28 GDPR)"
        ),
        content,
        kanzlei: { name: "Subsumio" },
        watermark: L("MUSTER", "TEMPLATE"),
      });
      doc.save("avv-muster.pdf");
    } catch (err) {
      setAvvPdfError(
        L(
          `Das PDF konnte nicht erstellt werden. ${err instanceof Error ? err.message : ""}`.trim(),
          `The PDF could not be created. ${err instanceof Error ? err.message : ""}`.trim()
        )
      );
    } finally {
      setAvvPdfLoading(false);
    }
  }

  async function handleDelete() {
    if (!canConfirm || deleting) return;
    setDeleting(true);
    setDeleteError(null);
    try {
      const res = await csrfFetch("/api/settings/gdpr/data-deletion", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          confirm: CONFIRM_PHRASE,
          ...(password ? { password } : {}),
          ...(code.trim() ? { code: code.trim() } : {}),
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        // apiError answers { error: "<Text>", code }.
        const raw = body && typeof body === "object" && "error" in body ? body.error : undefined;
        const message =
          typeof raw === "string" ? raw : (raw as { message?: string } | undefined)?.message;
        throw new Error(message || `HTTP ${res.status}`);
      }
      // Sessions are revoked and the session cookie is cleared server-side;
      // a hard navigation lands the (now anonymous) browser on the login page.
      window.location.href = "/";
    } catch (err) {
      setDeleting(false);
      const msg = err instanceof Error ? err.message : "";
      setDeleteError(
        L(
          `Das Konto konnte nicht gelöscht werden. ${msg}`.trim(),
          `The account could not be deleted. ${msg}`.trim()
        )
      );
    }
  }

  return (
    <div className="ds-page ds-page-narrow space-y-6 p-4 md:p-6 lg:p-8">
      <PageHeader
        title={L("Privatsphäre und Daten", "Privacy and data")}
        description={L(
          "Ihre Rechte nach DSGVO: Auskunft (Art. 15), Datenübertragbarkeit (Art. 20) und Löschung (Art. 17).",
          "Your rights under GDPR: access (Art. 15), portability (Art. 20) and erasure (Art. 17)."
        )}
        breadcrumbs={[
          { label: t("breadcrumb.dashboard"), href: "/dashboard" },
          { label: t("settings.title"), href: "/dashboard/settings" },
          { label: L("Privatsphäre", "Privacy") },
        ]}
      />

      <section className="space-y-4 rounded-xl border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] p-6">
        <div className="flex items-center gap-2">
          <Download size={18} className="text-[color:var(--ds-text-muted)]" aria-hidden />
          <h2 className="text-sm font-semibold text-[color:var(--ds-text)]">
            {L("Datenexport", "Data export")}
          </h2>
        </div>
        <p className="text-sm leading-relaxed text-[color:var(--ds-text-muted)]">
          {L(
            "Laden Sie Ihre personenbezogenen Daten als JSON-Datei herunter. Bei Kanzlei-Mitgliedern sind die Akten der Kanzlei nicht Teil des persönlichen Exports — sie gehören zur Kanzlei als Verantwortlicher.",
            "Download your personal data as a JSON file. For firm members, the firm's matters are not part of a personal export — they belong to the firm as the controller."
          )}
        </p>
        <div className="flex flex-wrap items-center gap-3">
          <Button variant="outline" size="sm" asChild>
            <a href="/api/export" download>
              <Download size={14} aria-hidden />
              {L("Konto-Export herunterladen", "Download account export")}
            </a>
          </Button>
          <Button variant="outline" size="sm" asChild>
            <a href="/api/settings/gdpr/data-export" download>
              <FileJson size={14} aria-hidden />
              {L("Vollständiger Export (Art. 15/20)", "Full export (Art. 15/20)")}
            </a>
          </Button>
        </div>
        <p className="text-xs text-[color:var(--ds-text-subtle)]">
          {L(
            "Der vollständige Export enthält zusätzlich Metadaten Ihrer API-Schlüssel und Ihre Kontaktanfragen über die Website.",
            "The full export additionally includes your API key metadata and contact requests sent via the website."
          )}
        </p>
      </section>

      <section className="space-y-4 rounded-xl border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] p-6">
        <div className="flex items-center gap-2">
          <ScrollText size={18} className="text-[color:var(--ds-text-muted)]" aria-hidden />
          <h2 className="text-sm font-semibold text-[color:var(--ds-text)]">
            {L("Auftragsverarbeitung (Art. 28 DSGVO)", "Data processing (Art. 28 GDPR)")}
          </h2>
        </div>
        <p className="text-sm leading-relaxed text-[color:var(--ds-text-muted)]">
          {L(
            "Kanzleien benötigen für DSGVO-Prüfungen einen Auftragsverarbeitungsvertrag (AVV) mit ihren Software-Anbietern. Laden Sie unser AVV-Muster herunter und lassen Sie es anwaltlich gegen Ihre Verhältnisse prüfen.",
            "Firms need a data processing agreement (DPA) with their software providers for GDPR reviews. Download our DPA template and have it reviewed by a lawyer against your circumstances."
          )}
        </p>
        <div className="flex flex-wrap items-center gap-3">
          <Button variant="outline" size="sm" asChild>
            <a href="/legal/avv-template.md" download="avv-muster.md">
              <FileText size={14} aria-hidden />
              {L("Markdown herunterladen", "Download Markdown")}
            </a>
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => void handleAvvPdf()}
            disabled={avvPdfLoading}
          >
            {avvPdfLoading ? (
              <Loader2 size={14} className="animate-spin" aria-hidden />
            ) : (
              <Download size={14} aria-hidden />
            )}
            {L("Als PDF herunterladen", "Download as PDF")}
          </Button>
        </div>
        {avvPdfError && (
          <p role="alert" className="text-sm text-[color:var(--ds-danger-text)]">
            {avvPdfError}
          </p>
        )}
        <p className="text-xs text-[color:var(--ds-text-subtle)]">
          {L(
            "Unverbindliches Muster — vor Verwendung durch eine Rechtsanwältin oder einen Rechtsanwalt zu prüfen und anzupassen.",
            "Non-binding template — must be reviewed and adapted by a lawyer before use."
          )}
        </p>
      </section>

      <section className="space-y-4 rounded-xl border border-[color:var(--ds-danger-border)] bg-[color:var(--ds-surface)] p-6">
        <div className="flex items-center gap-2">
          <ShieldAlert size={18} className="text-[color:var(--ds-danger-text)]" aria-hidden />
          <h2 className="text-sm font-semibold text-[color:var(--ds-text)]">
            {L("Konto löschen", "Delete account")}
          </h2>
        </div>
        <p className="text-sm leading-relaxed text-[color:var(--ds-text-muted)]">
          {L(
            "Ihr Konto wird sofort gesperrt und anonymisiert: Anmeldung, API-Schlüssel, MCP-, WebDAV- und Kalender-Zugänge enden, die Kanzleimitgliedschaft endet. Akten und Dokumente einer Kanzlei bleiben bei der Kanzlei. Arbeiten Sie allein (ohne Team), wird Ihr Datenbestand nach 30 Tagen endgültig gelöscht — das ist nur möglich, wenn keine Akte mehr offen ist, keine unter Legal Hold steht und keine abgeschlossene Akte oder kein Beleg mehr der gesetzlichen Aufbewahrungspflicht unterliegt (§ 12 RAO, § 132 BAO). Laden Sie vorher einen Export herunter.",
            "Your account is locked and anonymised at once: sign-in, API keys, MCP, WebDAV and calendar access end, and your firm membership ends. A firm's matters and documents remain with the firm. If you work alone (no team), your data is permanently deleted after 30 days — only possible if no matter is still open, none is under legal hold and no closed matter or receipt is still subject to statutory retention. Download an export first."
          )}
        </p>
        <div>
          <Button variant="danger" size="sm" onClick={() => setDialogOpen(true)}>
            <Trash2 size={14} aria-hidden />
            {L("Konto endgültig löschen", "Permanently delete account")}
          </Button>
        </div>
      </section>

      <section className="flex items-start gap-3 rounded-xl border border-[color:var(--ds-border)] bg-[color:var(--ds-surface-2)] p-4">
        <Info size={16} className="mt-0.5 shrink-0 text-[color:var(--ds-text-muted)]" aria-hidden />
        <div className="space-y-1 text-xs leading-relaxed text-[color:var(--ds-text-muted)]">
          <p className="text-sm font-medium text-[color:var(--ds-text)]">
            {L("Weitere Datenschutz-Anliegen", "Other privacy requests")}
          </p>
          <p>
            {L(
              "Auskunft zu Akten Ihrer Kanzlei, Widerspruch oder Berichtigung richten Sie an die Kanzlei als Verantwortlichen. Der Kanzlei-weite Datenexport liegt bei den Kanzlei-Admins (Einstellungen → Datenexport).",
              "For access to your firm's matters, objections or rectification, contact the firm as controller. Firm-wide export is handled by firm admins (Settings → Data export)."
            )}
          </p>
        </div>
      </section>

      <Dialog
        open={dialogOpen}
        onOpenChange={(v) => {
          if (!deleting) {
            setDialogOpen(v);
            if (!v) {
              setConfirmInput("");
              setPassword("");
              setCode("");
              setDeleteError(null);
            }
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {L("Konto endgültig löschen?", "Permanently delete account?")}
            </DialogTitle>
            <DialogDescription>
              {L(
                "Diese Aktion kann nicht rückgängig gemacht werden. Zur Bestätigung tippen Sie den folgenden Text ein:",
                "This action cannot be undone. To confirm, type the following text:"
              )}{" "}
              <code className="rounded bg-[color:var(--ds-surface-2)] px-1.5 py-0.5 font-mono text-xs">
                {CONFIRM_PHRASE}
              </code>
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Input
              value={confirmInput}
              onChange={(e) => setConfirmInput(e.target.value)}
              placeholder={CONFIRM_PHRASE}
              autoComplete="off"
              autoFocus
              disabled={deleting}
              aria-label={L("Bestätigungstext", "Confirmation text")}
            />
            <Input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder={L("Ihr Passwort", "Your password")}
              autoComplete="current-password"
              disabled={deleting}
              aria-label={L("Passwort", "Password")}
            />
            {twoFactorEnabled && (
              <Input
                value={code}
                onChange={(e) => setCode(e.target.value)}
                placeholder={L(
                  "Code aus der Authenticator-App",
                  "Code from your authenticator app"
                )}
                autoComplete="one-time-code"
                inputMode="numeric"
                disabled={deleting}
                aria-label={L("Zwei-Faktor-Code", "Two-factor code")}
              />
            )}
            {deleteError && (
              <p role="alert" className="text-sm text-[color:var(--ds-danger-text)]">
                {deleteError}
              </p>
            )}
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setDialogOpen(false)} disabled={deleting}>
              {L("Abbrechen", "Cancel")}
            </Button>
            <Button variant="danger" onClick={handleDelete} disabled={!canConfirm || deleting}>
              {deleting && <Loader2 size={14} className="animate-spin" aria-hidden />}
              {L("Endgültig löschen", "Delete permanently")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
