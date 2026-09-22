"use client";

// Settings → Privatsphäre und Daten (DSGVO). Self-service für Art. 15/20
// (Datenexport) und Art. 17 (Kontolöschung). Die Löschung läuft über
// /api/settings/gdpr/data-deletion, das die Server-Seite hinter dem Literal
// "DELETE_MY_ACCOUNT" absichert — der Dialog verlangt dasselbe Eintippen.

import { useState } from "react";
import { Download, FileJson, Info, Loader2, ShieldAlert, Trash2 } from "lucide-react";
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

const CONFIRM_PHRASE = "DELETE_MY_ACCOUNT";

export default function PrivacySettingsPage() {
  const { t, lang } = useLang();
  const L = (de: string, en: string) => (lang === "en" ? en : de);

  const [dialogOpen, setDialogOpen] = useState(false);
  const [confirmInput, setConfirmInput] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const canConfirm = confirmInput.trim() === CONFIRM_PHRASE;

  async function handleDelete() {
    if (!canConfirm || deleting) return;
    setDeleting(true);
    setDeleteError(null);
    try {
      const res = await csrfFetch("/api/settings/gdpr/data-deletion", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ confirm: CONFIRM_PHRASE }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        const message =
          body && typeof body === "object" && "error" in body
            ? (body.error as { message?: string })?.message
            : undefined;
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

      <section className="space-y-4 rounded-xl border border-[color:var(--ds-danger-border)] bg-[color:var(--ds-surface)] p-6">
        <div className="flex items-center gap-2">
          <ShieldAlert size={18} className="text-[color:var(--ds-danger-text)]" aria-hidden />
          <h2 className="text-sm font-semibold text-[color:var(--ds-text)]">
            {L("Konto löschen", "Delete account")}
          </h2>
        </div>
        <p className="text-sm leading-relaxed text-[color:var(--ds-text-muted)]">
          {L(
            "Ihr Konto wird unwiderruflich anonymisiert: Anmeldung, API-Schlüssel und persönliche Daten werden gelöscht. Akten und Dokumente Ihrer Kanzlei bleiben bei der Kanzlei. Gesetzlich aufzubewahrende Aufzeichnungen (z. B. Rechnungen, Änderungsprotokoll) bleiben in anonymisierter Form bestehen.",
            "Your account is irreversibly anonymised: sign-in, API keys and personal data are deleted. Your firm's matters and documents remain with the firm. Records required by law (e.g. invoices, activity log) are kept in anonymised form."
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
