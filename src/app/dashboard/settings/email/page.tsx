"use client";

// Settings → E-Mail-Postfach. Connect the firm's own mailbox (IMAP for
// incoming, SMTP for outgoing). Incoming mail is fetched every five minutes,
// assigned to matters and triaged; replies go out from the firm's address.

import { useCallback, useEffect, useState } from "react";
import {
  Inbox,
  Loader2,
  Mail,
  Pause,
  Play,
  Plus,
  RefreshCw,
  ShieldCheck,
  Trash2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/components/ui/toast";
import { PageHeader } from "@/components/dashboard/page-header";
import { EmptyState } from "@/components/dashboard/empty-state";
import { PageSkeleton } from "@/components/dashboard/page-skeleton";
import { csrfFetch } from "@/lib/csrf";
import { unwrapApiBody } from "@/lib/api-body";

interface Account {
  id: string;
  label: string;
  email: string;
  imapHost: string;
  folder: string;
  smtpHost: string | null;
  enabled: boolean;
  lastSyncAt: string | null;
  lastError: string | null;
}

const PRESETS: Record<string, { label: string; imapHost: string; smtpHost: string }> = {
  custom: { label: "Eigener Server", imapHost: "", smtpHost: "" },
  microsoft: {
    label: "Microsoft 365 / Outlook",
    imapHost: "outlook.office365.com",
    smtpHost: "smtp.office365.com",
  },
  google: {
    label: "Google Workspace / Gmail",
    imapHost: "imap.gmail.com",
    smtpHost: "smtp.gmail.com",
  },
  world4you: { label: "world4you", imapHost: "imap.world4you.com", smtpHost: "smtp.world4you.com" },
  easyname: { label: "easyname", imapHost: "imap.easyname.com", smtpHost: "smtp.easyname.com" },
};

const EMPTY = {
  preset: "custom",
  label: "",
  email: "",
  imapHost: "",
  imapPort: "993",
  imapUser: "",
  imapPassword: "",
  smtpHost: "",
  smtpPort: "465",
};

function formatWhen(iso: string | null): string {
  if (!iso) return "noch nie";
  return new Date(iso).toLocaleString("de-AT", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function EmailSettingsPage() {
  const { addToast } = useToast();
  const [accounts, setAccounts] = useState<Account[] | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(EMPTY);
  const [saving, setSaving] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/email/accounts");
      if (!res.ok) throw new Error();
      const data = unwrapApiBody(await res.json());
      setAccounts(data.accounts ?? []);
    } catch {
      setAccounts([]);
      addToast({ type: "error", title: "Postfächer konnten nicht geladen werden" });
    }
  }, [addToast]);

  useEffect(() => {
    void load();
  }, [load]);

  function applyPreset(key: string) {
    const p = PRESETS[key] ?? PRESETS.custom;
    setForm((f) => ({ ...f, preset: key, imapHost: p.imapHost, smtpHost: p.smtpHost }));
  }

  async function connect(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      const res = await csrfFetch("/api/email/accounts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          label: form.label || undefined,
          email: form.email,
          imapHost: form.imapHost,
          imapPort: Number(form.imapPort) || 993,
          imapSecure: true,
          imapUser: form.imapUser || form.email,
          imapPassword: form.imapPassword,
          smtpHost: form.smtpHost || null,
          smtpPort: form.smtpHost ? Number(form.smtpPort) || 465 : null,
          smtpSecure: (Number(form.smtpPort) || 465) === 465,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        addToast({
          type: "error",
          title: "Verbindung fehlgeschlagen",
          description: data?.message ?? data?.error ?? "Bitte prüfen Sie die Angaben.",
        });
        return;
      }
      addToast({
        type: "success",
        title: "Postfach verbunden",
        description: "Die E-Mails der letzten 14 Tage werden jetzt abgerufen.",
      });
      setForm(EMPTY);
      setShowForm(false);
      await load();
    } finally {
      setSaving(false);
    }
  }

  async function act(id: string, kind: "sync" | "toggle" | "delete", enabled?: boolean) {
    setBusy(`${kind}:${id}`);
    try {
      const res =
        kind === "sync"
          ? await csrfFetch(`/api/email/accounts/${id}/sync`, { method: "POST" })
          : kind === "toggle"
            ? await csrfFetch(`/api/email/accounts/${id}`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ enabled: !enabled }),
              })
            : await csrfFetch(`/api/email/accounts/${id}`, { method: "DELETE" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        addToast({ type: "error", title: "Aktion fehlgeschlagen", description: data?.message });
      } else if (kind === "sync") {
        const r = unwrapApiBody(data).result;
        addToast({
          type: "success",
          title: "Postfach abgerufen",
          description: `${r?.stored ?? 0} neue E-Mails, ${r?.assigned ?? 0} einer Akte zugeordnet.`,
        });
      }
      await load();
    } finally {
      setBusy(null);
    }
  }

  if (accounts === null) return <PageSkeleton rows={4} className="mx-auto max-w-[900px]" />;

  return (
    <div className="mx-auto max-w-[900px] space-y-6 p-4 md:p-6 lg:p-8">
      <PageHeader
        title="E-Mail-Postfach"
        description="Verbinden Sie das Postfach Ihrer Kanzlei. Eingehende E-Mails werden alle fünf Minuten abgerufen, der passenden Akte zugeordnet und auf Fristen geprüft. Antworten gehen über Ihren eigenen Mailserver hinaus."
        breadcrumbs={[
          { label: "Einstellungen", href: "/dashboard/settings" },
          { label: "E-Mail-Postfach" },
        ]}
        actions={
          !showForm ? (
            <Button variant="primary" size="sm" className="gap-2" onClick={() => setShowForm(true)}>
              <Plus size={14} /> Postfach verbinden
            </Button>
          ) : undefined
        }
      />

      <div className="flex items-start gap-3 rounded-xl border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] p-4 text-sm text-[color:var(--ds-text-muted)]">
        <ShieldCheck size={18} className="mt-0.5 shrink-0 text-[color:var(--brand-primary)]" />
        <p className="m-0">
          Das Passwort wird verschlüsselt gespeichert und nie wieder angezeigt. Subsumio liest Ihr
          Postfach nur: Auf dem Mailserver wird nichts verschoben, gelöscht oder als gelesen
          markiert. Nichts wird ohne Ihre Freigabe versendet. Verwenden Sie nach Möglichkeit ein
          App-Passwort Ihres Anbieters.
        </p>
      </div>

      {showForm && (
        <form
          onSubmit={connect}
          className="space-y-4 rounded-xl border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] p-5"
        >
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <Label htmlFor="mail-preset" className="mb-1.5 block text-xs">
                Anbieter
              </Label>
              <select
                id="mail-preset"
                value={form.preset}
                onChange={(e) => applyPreset(e.target.value)}
                className="h-10 w-full rounded-lg border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] px-3 text-sm"
              >
                {Object.entries(PRESETS).map(([k, p]) => (
                  <option key={k} value={k}>
                    {p.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <Label htmlFor="mail-email" className="mb-1.5 block text-xs">
                E-Mail-Adresse *
              </Label>
              <Input
                id="mail-email"
                type="email"
                required
                autoComplete="off"
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
                placeholder="kanzlei@beispiel.at"
              />
            </div>
            <div>
              <Label htmlFor="mail-label" className="mb-1.5 block text-xs">
                Anzeigename
              </Label>
              <Input
                id="mail-label"
                value={form.label}
                onChange={(e) => setForm({ ...form, label: e.target.value })}
                placeholder="Kanzlei Huber"
              />
            </div>
            <div>
              <Label htmlFor="mail-imap-host" className="mb-1.5 block text-xs">
                Posteingangsserver (IMAP) *
              </Label>
              <Input
                id="mail-imap-host"
                required
                value={form.imapHost}
                onChange={(e) => setForm({ ...form, imapHost: e.target.value })}
                placeholder="imap.beispiel.at"
              />
            </div>
            <div>
              <Label htmlFor="mail-imap-port" className="mb-1.5 block text-xs">
                Port (TLS)
              </Label>
              <Input
                id="mail-imap-port"
                inputMode="numeric"
                value={form.imapPort}
                onChange={(e) => setForm({ ...form, imapPort: e.target.value })}
              />
            </div>
            <div>
              <Label htmlFor="mail-user" className="mb-1.5 block text-xs">
                Benutzername
              </Label>
              <Input
                id="mail-user"
                autoComplete="off"
                value={form.imapUser}
                onChange={(e) => setForm({ ...form, imapUser: e.target.value })}
                placeholder="leer = E-Mail-Adresse"
              />
            </div>
            <div>
              <Label htmlFor="mail-password" className="mb-1.5 block text-xs">
                Passwort oder App-Passwort *
              </Label>
              <Input
                id="mail-password"
                type="password"
                required
                autoComplete="new-password"
                value={form.imapPassword}
                onChange={(e) => setForm({ ...form, imapPassword: e.target.value })}
              />
            </div>
            <div>
              <Label htmlFor="mail-smtp-host" className="mb-1.5 block text-xs">
                Postausgangsserver (SMTP)
              </Label>
              <Input
                id="mail-smtp-host"
                value={form.smtpHost}
                onChange={(e) => setForm({ ...form, smtpHost: e.target.value })}
                placeholder="leer = Versand über Subsumio"
              />
            </div>
            <div>
              <Label htmlFor="mail-smtp-port" className="mb-1.5 block text-xs">
                SMTP-Port (465 = TLS, 587 = STARTTLS)
              </Label>
              <Input
                id="mail-smtp-port"
                inputMode="numeric"
                value={form.smtpPort}
                onChange={(e) => setForm({ ...form, smtpPort: e.target.value })}
              />
            </div>
          </div>
          <div className="flex items-center justify-end gap-2">
            <Button type="button" variant="ghost" onClick={() => setShowForm(false)}>
              Abbrechen
            </Button>
            <Button type="submit" variant="primary" disabled={saving} className="gap-2">
              {saving ? <Loader2 size={14} className="animate-spin" /> : <Mail size={14} />}
              Verbindung prüfen und speichern
            </Button>
          </div>
        </form>
      )}

      {accounts.length === 0 && !showForm ? (
        <EmptyState
          icon={Inbox}
          title="Noch kein Postfach verbunden"
          description="Mit einem verbundenen Postfach landen E-Mails automatisch in der richtigen Akte."
          actionLabel="Postfach verbinden"
          onAction={() => setShowForm(true)}
        />
      ) : (
        <ul className="m-0 grid list-none gap-3 p-0">
          {accounts.map((a) => (
            <li
              key={a.id}
              className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] p-4"
            >
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="truncate font-medium text-[color:var(--ds-text)]">
                    {a.email}
                  </span>
                  <Badge variant={a.lastError ? "danger" : a.enabled ? "success" : "default"}>
                    {a.lastError ? "Fehler" : a.enabled ? "Aktiv" : "Pausiert"}
                  </Badge>
                  {a.smtpHost && <Badge variant="info">Versand über Ihr Postfach</Badge>}
                </div>
                <div className="mt-1 text-xs text-[color:var(--ds-text-muted)] tabular-nums">
                  {a.imapHost} · Ordner {a.folder} · zuletzt abgerufen: {formatWhen(a.lastSyncAt)}
                </div>
                {a.lastError && (
                  <div className="mt-1 text-xs text-[color:var(--ds-danger-text)]">
                    {a.lastError}
                  </div>
                )}
              </div>
              <div className="flex items-center gap-1.5">
                <Button
                  variant="outline"
                  size="sm"
                  className="gap-1.5"
                  disabled={busy !== null}
                  onClick={() => act(a.id, "sync")}
                >
                  {busy === `sync:${a.id}` ? (
                    <Loader2 size={13} className="animate-spin" />
                  ) : (
                    <RefreshCw size={13} />
                  )}
                  Jetzt abrufen
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className="gap-1.5"
                  disabled={busy !== null}
                  onClick={() => act(a.id, "toggle", a.enabled)}
                >
                  {a.enabled ? <Pause size={13} /> : <Play size={13} />}
                  {a.enabled ? "Pausieren" : "Fortsetzen"}
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  aria-label={`Postfach ${a.email} trennen`}
                  disabled={busy !== null}
                  onClick={() => {
                    if (
                      window.confirm(
                        `Postfach ${a.email} trennen? Bereits importierte E-Mails bleiben in den Akten.`
                      )
                    )
                      void act(a.id, "delete");
                  }}
                >
                  <Trash2 size={13} />
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
