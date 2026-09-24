"use client";

import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { Mail, AlertTriangle, CheckCircle2, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/components/ui/toast";
import { csrfFetch } from "@/lib/csrf";
import { useLang } from "@/lib/use-lang";

/**
 * "E-Mail-Adresse ändern" — OWASP flow: re-auth with password, then a
 * single-use confirm link is mailed to the NEW address and a notification
 * goes to the old one. The change only applies after the link is clicked.
 */
export function ChangeEmail({ currentEmail }: { currentEmail: string }) {
  const { lang } = useLang();
  const L = (de: string, en: string) => (lang === "en" ? en : de);
  const { addToast } = useToast();
  const [open, setOpen] = useState(false);
  const [newEmail, setNewEmail] = useState("");
  const [password, setPassword] = useState("");
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [devUrl, setDevUrl] = useState<string | null>(null);

  const mutation = useMutation({
    mutationFn: async () => {
      const res = await csrfFetch("/api/auth/email/request-change", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ newEmail, password }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? "generic");
      return data as { ok: boolean; devConfirmUrl?: string };
    },
    onSuccess: (data) => {
      setSent(true);
      setError(null);
      if (data.devConfirmUrl) setDevUrl(data.devConfirmUrl);
      addToast({
        type: "success",
        title: L("Bestätigungs-E-Mail gesendet", "Confirmation e-mail sent"),
        description: L(
          "Bitte öffnen Sie den Link in der Nachricht an die neue Adresse.",
          "Please open the link in the message sent to the new address."
        ),
      });
    },
    onError: (err) => {
      const key = err instanceof Error ? err.message : "generic";
      setError(
        key === "invalid_password"
          ? L("Das Passwort ist nicht korrekt.", "The password is incorrect.")
          : key === "email_taken"
            ? L(
                "Diese E-Mail-Adresse wird bereits verwendet.",
                "This e-mail address is already in use."
              )
            : key === "same_email"
              ? L("Das ist bereits Ihre aktuelle Adresse.", "This is already your current address.")
              : L(
                  "Die Anfrage konnte nicht gesendet werden. Bitte versuchen Sie es erneut.",
                  "The request could not be sent. Please try again."
                )
      );
    },
  });

  function reset() {
    setOpen(false);
    setSent(false);
    setNewEmail("");
    setPassword("");
    setError(null);
    setDevUrl(null);
  }

  return (
    <section
      aria-labelledby="change-email-heading"
      className="space-y-4 rounded-xl border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] p-5"
    >
      <div className="flex items-start gap-3">
        <Mail size={16} className="mt-0.5 shrink-0 text-[color:var(--ds-text-muted)]" />
        <div className="flex-1">
          <h2
            id="change-email-heading"
            className="text-sm font-semibold text-[color:var(--ds-text)]"
          >
            {L("E-Mail-Adresse", "E-mail address")}
          </h2>
          <p className="mt-1 text-xs text-[color:var(--ds-text-muted)]">
            {L(
              "Ihre Anmelde- und Kontaktadresse. Eine Änderung muss über einen Link an der neuen Adresse bestätigt werden.",
              "Your sign-in and contact address. A change must be confirmed via a link sent to the new address."
            )}
          </p>
        </div>
      </div>

      <div className="flex items-center justify-between gap-3 rounded-lg border border-[color:var(--ds-border)] bg-[color:var(--ds-hover)] px-3 py-2.5">
        <span className="truncate text-sm text-[color:var(--ds-text)]">{currentEmail}</span>
        {!open && (
          <Button variant="ghost" className="shrink-0 text-xs" onClick={() => setOpen(true)}>
            {L("Ändern", "Change")}
          </Button>
        )}
      </div>

      {open &&
        (sent ? (
          <div className="flex items-start gap-2 rounded-lg border border-[color:var(--ds-success-border)] bg-[color:var(--ds-success-bg)] px-3 py-3">
            <CheckCircle2
              size={16}
              className="mt-0.5 shrink-0 text-[color:var(--ds-success-text)]"
            />
            <div className="text-xs text-[color:var(--ds-text)]">
              <p>
                {L(
                  "Bestätigungslink an die neue Adresse gesendet. Die Änderung wird erst wirksam, wenn Sie den Link öffnen.",
                  "Confirmation link sent to the new address. The change only takes effect once you open the link."
                )}
              </p>
              {devUrl && (
                <p className="mt-2">
                  <a
                    href={devUrl}
                    className="font-mono break-all text-[color:var(--brand-primary)] underline"
                  >
                    Dev-Link: {devUrl}
                  </a>
                </p>
              )}
              <Button variant="ghost" className="mt-2 text-xs" onClick={reset}>
                {L("Schließen", "Close")}
              </Button>
            </div>
          </div>
        ) : (
          <form
            className="space-y-3"
            onSubmit={(e) => {
              e.preventDefault();
              mutation.mutate();
            }}
          >
            <div>
              <label
                htmlFor="new-email"
                className="mb-1 block text-xs font-medium text-[color:var(--ds-text)]"
              >
                {L("Neue E-Mail-Adresse", "New e-mail address")}
              </label>
              <Input
                id="new-email"
                type="email"
                required
                autoComplete="email"
                value={newEmail}
                onChange={(e) => setNewEmail(e.target.value)}
              />
            </div>
            <div>
              <label
                htmlFor="email-change-password"
                className="mb-1 block text-xs font-medium text-[color:var(--ds-text)]"
              >
                {L("Passwort zur Bestätigung", "Password to confirm")}
              </label>
              <Input
                id="email-change-password"
                type="password"
                required
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>

            {error && (
              <div
                role="alert"
                className="flex items-start gap-2 rounded-lg border border-[color:var(--ds-danger-border)] bg-[color:var(--ds-danger-bg)] px-3 py-2 text-xs text-[color:var(--ds-danger-text)]"
              >
                <AlertTriangle size={14} className="mt-0.5 shrink-0" />
                {error}
              </div>
            )}

            <div className="flex justify-end gap-2">
              <Button type="button" variant="ghost" className="text-sm" onClick={reset}>
                {L("Abbrechen", "Cancel")}
              </Button>
              <Button
                type="submit"
                variant="primary"
                className="gap-2 text-sm"
                disabled={mutation.isPending || !newEmail || !password}
              >
                {mutation.isPending && <Loader2 size={14} className="animate-spin" />}
                {L("Bestätigungslink senden", "Send confirmation link")}
              </Button>
            </div>
          </form>
        ))}
    </section>
  );
}
