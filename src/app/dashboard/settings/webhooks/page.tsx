"use client";

import { useState, useEffect, useCallback } from "react";
import { Webhook, Trash2, Loader2, Link as LinkIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/components/ui/toast";
import { useLang } from "@/lib/use-lang";
import { csrfFetch } from "@/lib/csrf";
import { formatDateTime } from "@/lib/utils";
import { PageHeader } from "@/components/dashboard/page-header";
import { PrimaryAction } from "@/components/dashboard/primary-action";
import { EmptyState } from "@/components/dashboard/empty-state";
import { unwrapApiBody } from "@/lib/api-body";

/** Event identifiers stay technical on the wire; the UI shows what happened in the firm. */
const EVENT_LABELS: Record<string, { de: string; en: string }> = {
  "case.created": { de: "Akte angelegt", en: "Matter created" },
  "deadline.critical": { de: "Frist wird kritisch", en: "Deadline becomes critical" },
  "invoice.paid": { de: "Honorarnote bezahlt", en: "Client invoice paid" },
  "document.received": { de: "Dokument eingegangen", en: "Document received" },
  "intake.new": { de: "Neue Mandatsanfrage", en: "New client enquiry" },
};
const EVENT_TYPES = Object.keys(EVENT_LABELS);

export default function WebhooksPage() {
  const { addToast } = useToast();
  const { t, lang } = useLang();
  const L = (de: string, en: string) => (lang === "en" ? en : de);
  const eventLabel = (evt: string) => EVENT_LABELS[evt]?.[lang === "en" ? "en" : "de"] ?? evt;

  const [webhooks, setWebhooks] = useState<
    Array<{
      id: string;
      url: string;
      events: string[];
      status: string;
      created_at: string;
      needs_reregistration?: boolean;
      disabled_reason?: string | null;
      disabled_at?: string | null;
      disabled_failures?: number | null;
      disabled_last_error?: string | null;
      delivery?: {
        pending: number;
        exhausted: number;
        lastError: string | null;
        lastErrorAt: string | null;
      } | null;
    }>
  >([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [reactivating, setReactivating] = useState<string | null>(null);

  const [form, setForm] = useState({
    url: "",
    events: [] as string[],
    secret: "",
    description: "",
  });

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/webhooks/outgoing");
      if (!res.ok) throw new Error();
      const data = unwrapApiBody(await res.json());
      setWebhooks(data.webhooks ?? []);
    } catch {
      addToast({ type: "error", title: t("webhooks.err_load") });
    } finally {
      setLoading(false);
    }
  }, [addToast, t]);

  useEffect(() => {
    void load();
  }, [load]);

  async function save() {
    if (!form.url || form.events.length === 0 || !form.secret) {
      addToast({ type: "error", title: t("webhooks.err_required") });
      return;
    }
    setSaving(true);
    try {
      const res = await csrfFetch("/api/webhooks/outgoing", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      if (!res.ok) {
        const err = (await res.json().catch(() => null)) as {
          error?: string;
          code?: string;
        } | null;
        if (err?.code === "invalid_webhook_url" && err.error) {
          addToast({ type: "error", title: err.error });
          return;
        }
        throw new Error();
      }
      addToast({ type: "success", title: t("webhooks.saved") });
      setShowForm(false);
      setForm({ url: "", events: [], secret: "", description: "" });
      await load();
    } catch {
      addToast({ type: "error", title: t("webhooks.err_save") });
    } finally {
      setSaving(false);
    }
  }

  async function deleteWebhook(id: string, url: string) {
    if (
      !window.confirm(
        L(
          `Benachrichtigungen an ${url} beenden? Das Zielsystem erhält danach keine Ereignisse mehr.`,
          `Stop notifications to ${url}? The target system will no longer receive events.`
        )
      )
    )
      return;
    setDeleting(id);
    try {
      const res = await csrfFetch(`/api/webhooks/outgoing?id=${encodeURIComponent(id)}`, {
        method: "DELETE",
      });
      if (!res.ok) throw new Error();
      addToast({ type: "success", title: t("webhooks.deleted") });
      await load();
    } catch {
      addToast({ type: "error", title: t("webhooks.err_delete") });
    } finally {
      setDeleting(null);
    }
  }

  async function reactivateWebhook(id: string) {
    setReactivating(id);
    try {
      const res = await csrfFetch("/api/webhooks/outgoing", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, action: "reactivate" }),
      });
      if (!res.ok) {
        const err = (await res.json().catch(() => null)) as { error?: string } | null;
        addToast({
          type: "error",
          title: err?.error ?? L("Reaktivieren fehlgeschlagen", "Reactivation failed"),
        });
        return;
      }
      addToast({ type: "success", title: L("Webhook reaktiviert", "Webhook reactivated") });
      await load();
    } catch {
      addToast({ type: "error", title: L("Reaktivieren fehlgeschlagen", "Reactivation failed") });
    } finally {
      setReactivating(null);
    }
  }

  function toggleEvent(event: string) {
    setForm({
      ...form,
      events: form.events.includes(event)
        ? form.events.filter((e) => e !== event)
        : [...form.events, event],
    });
  }

  return (
    <div className="ds-page ds-page-narrow space-y-6 p-4 md:p-6 lg:p-8">
      <PageHeader
        title={L("Webhooks", "Webhooks")}
        description={L(
          "Benachrichtigen Sie andere Programme Ihrer Kanzlei automatisch, wenn in Subsumio etwas passiert – etwa wenn eine Akte angelegt wird.",
          "Automatically notify other programs in your firm when something happens in Subsumio – for example when a matter is created."
        )}
        breadcrumbs={[
          { label: t("breadcrumb.dashboard"), href: "/dashboard" },
          { label: t("settings.title"), href: "/dashboard/settings" },
          { label: "Webhooks" },
        ]}
        actions={
          webhooks.length > 0 && !showForm ? (
            <PrimaryAction onClick={() => setShowForm(true)}>{t("webhooks.new")}</PrimaryAction>
          ) : undefined
        }
      />

      {showForm && (
        <section className="space-y-4 rounded-xl border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] p-5">
          <h2 className="text-sm font-semibold text-[color:var(--ds-text)]">
            {t("webhooks.register_title")}
          </h2>
          <div className="space-y-4">
            <div className="space-y-1">
              <Label htmlFor="wh-url" className="text-xs text-[color:var(--ds-text-muted)]">
                {L("Zieladresse (URL)", "Target address (URL)")}
              </Label>
              <Input
                id="wh-url"
                value={form.url}
                onChange={(e) => setForm({ ...form, url: e.target.value })}
                placeholder="https://kanzlei-system.example/eingang"
              />
              <p className="text-xs text-[color:var(--ds-text-muted)]">
                {L(
                  "Die Adresse, an die Subsumio eine Nachricht schickt. Ihr IT-Dienstleister nennt Ihnen diese.",
                  "The address Subsumio sends a message to. Your IT provider can give it to you."
                )}
              </p>
            </div>
            <fieldset className="space-y-1">
              <legend className="text-xs text-[color:var(--ds-text-muted)]">
                {L("Bei welchen Ereignissen?", "For which events?")}
              </legend>
              <div className="flex flex-wrap gap-2 pt-1">
                {EVENT_TYPES.map((evt) => (
                  <button
                    key={evt}
                    type="button"
                    aria-pressed={form.events.includes(evt)}
                    onClick={() => toggleEvent(evt)}
                    className={`rounded-lg border px-3 py-1.5 text-xs transition-[background-color,border-color,color] motion-reduce:transition-none ${
                      form.events.includes(evt)
                        ? "brand-soft brand-text brand-border"
                        : "border-[color:var(--ds-border)] bg-[color:var(--ds-surface-2)] text-[color:var(--ds-text-muted)] hover:bg-[color:var(--ds-surface-3)]"
                    } focus-visible:ring-2 focus-visible:ring-[color:var(--brand-primary)] focus-visible:outline-none active:scale-[0.99]`}
                  >
                    {eventLabel(evt)}
                  </button>
                ))}
              </div>
            </fieldset>
            <div className="space-y-1">
              <Label htmlFor="wh-secret" className="text-xs text-[color:var(--ds-text-muted)]">
                {L("Signaturschlüssel", "Signing secret")}
              </Label>
              <Input
                id="wh-secret"
                type="password"
                value={form.secret}
                onChange={(e) => setForm({ ...form, secret: e.target.value })}
                placeholder={t("webhooks.secret_placeholder")}
              />
              <p className="text-xs text-[color:var(--ds-text-muted)]">
                {L(
                  "Damit prüft das Zielsystem, dass die Nachricht wirklich von Subsumio stammt.",
                  "The target system uses it to verify that the message really comes from Subsumio."
                )}
              </p>
            </div>
            <div className="space-y-1">
              <Label htmlFor="wh-desc" className="text-xs text-[color:var(--ds-text-muted)]">
                {t("webhooks.desc_label")}
              </Label>
              <Input
                id="wh-desc"
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
                placeholder={t("webhooks.desc_placeholder")}
              />
            </div>
          </div>
          <div className="flex gap-2">
            <Button onClick={() => void save()} disabled={saving} loading={saving}>
              {t("webhooks.save")}
            </Button>
            <Button onClick={() => setShowForm(false)} variant="ghost">
              {t("webhooks.cancel")}
            </Button>
          </div>
        </section>
      )}

      {loading ? (
        <div className="space-y-2" role="status" aria-label={L("Wird geladen", "Loading")}>
          {[0, 1].map((i) => (
            <Skeleton key={i} className="h-16 w-full rounded-xl" />
          ))}
        </div>
      ) : webhooks.length === 0 ? (
        !showForm && (
          <EmptyState
            icon={Webhook}
            title={t("webhooks.empty")}
            description={L(
              "Nur nötig, wenn ein anderes Programm Ihrer Kanzlei automatisch über Ereignisse informiert werden soll.",
              "Only needed if another program in your firm should be told about events automatically."
            )}
            actionLabel={t("webhooks.new")}
            onAction={() => setShowForm(true)}
          />
        )
      ) : (
        <ul className="space-y-2">
          {webhooks.map((wh) => (
            <li
              key={wh.id}
              className="flex items-center justify-between gap-3 rounded-xl border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] px-4 py-3"
            >
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <LinkIcon size={14} className="shrink-0 text-[color:var(--ds-text-muted)]" />
                  <span className="truncate text-sm font-medium text-[color:var(--ds-text)]">
                    {wh.url}
                  </span>
                </div>
                <div className="mt-1 flex flex-wrap gap-1">
                  {wh.events.map((evt) => (
                    <Badge key={evt} variant="default" className="text-xs">
                      {eventLabel(evt)}
                    </Badge>
                  ))}
                </div>
                <div className="mt-1 text-xs text-[color:var(--ds-text-subtle)] tabular-nums">
                  {t("webhooks.created")} {formatDateTime(wh.created_at)}
                </div>
                {wh.status === "disabled" && (
                  <div
                    className="mt-2 flex flex-wrap items-center gap-2 rounded-lg border border-[color:var(--ds-border)] bg-[color:var(--ds-danger-bg)] px-3 py-2"
                    role="status"
                  >
                    <Badge variant="warning">{L("Deaktiviert", "Disabled")}</Badge>
                    <p className="min-w-0 flex-1 text-xs text-[color:var(--ds-danger-text)]">
                      {wh.disabled_reason === "auto_failures"
                        ? L(
                            `Automatisch deaktiviert${wh.disabled_at ? ` am ${formatDateTime(wh.disabled_at)}` : ""}: ${wh.disabled_failures ?? "mehrere"} Zustellungen in Folge sind endgültig gescheitert${wh.disabled_last_error ? ` (zuletzt: ${wh.disabled_last_error})` : ""}. Prüfen Sie das Zielsystem und reaktivieren Sie den Webhook danach.`,
                            `Disabled automatically${wh.disabled_at ? ` on ${formatDateTime(wh.disabled_at)}` : ""}: ${wh.disabled_failures ?? "several"} deliveries in a row failed for good${wh.disabled_last_error ? ` (last: ${wh.disabled_last_error})` : ""}. Check the target system, then reactivate the webhook.`
                          )
                        : L(
                            "Deaktiviert: dieser Webhook erhält keine Ereignisse.",
                            "Disabled: this webhook receives no events."
                          )}
                    </p>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => void reactivateWebhook(wh.id)}
                      disabled={reactivating === wh.id}
                      loading={reactivating === wh.id}
                    >
                      {L("Reaktivieren", "Reactivate")}
                    </Button>
                  </div>
                )}
                {wh.needs_reregistration && (
                  <p className="mt-1 text-xs text-[color:var(--ds-danger-text)]" role="status">
                    {L(
                      "Wird nicht beliefert: bitte löschen und mit neuem Signaturschlüssel neu anlegen.",
                      "Not delivered: please delete and register again with a new signing secret."
                    )}
                  </p>
                )}
                {wh.delivery && (wh.delivery.pending > 0 || wh.delivery.exhausted > 0) && (
                  <p className="mt-1 text-xs text-[color:var(--ds-danger-text)]" role="status">
                    {wh.delivery.exhausted > 0
                      ? L(
                          `${wh.delivery.exhausted} Ereignis(se) konnten nicht zugestellt werden.`,
                          `${wh.delivery.exhausted} event(s) could not be delivered.`
                        )
                      : L(
                          `${wh.delivery.pending} Ereignis(se) warten auf erneute Zustellung.`,
                          `${wh.delivery.pending} event(s) waiting to be re-delivered.`
                        )}
                    {wh.delivery.lastError
                      ? ` ${L("Letzter Fehler", "Last error")}: ${wh.delivery.lastError}${
                          wh.delivery.lastErrorAt
                            ? ` (${formatDateTime(wh.delivery.lastErrorAt)})`
                            : ""
                        }`
                      : ""}
                  </p>
                )}
              </div>
              <Button
                onClick={() => void deleteWebhook(wh.id, wh.url)}
                disabled={deleting === wh.id}
                variant="ghost"
                size="icon"
                aria-label={L("Webhook löschen", "Delete webhook")}
                className="h-8 w-8 shrink-0 text-[color:var(--ds-danger-text)] hover:bg-[color:var(--ds-danger-bg)]"
              >
                {deleting === wh.id ? (
                  <Loader2 size={14} className="animate-spin" />
                ) : (
                  <Trash2 size={14} />
                )}
              </Button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
