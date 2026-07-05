"use client";

import { useState, useEffect, useCallback } from "react";
import { Webhook, Plus, Trash2, Loader2, Link as LinkIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/components/ui/toast";

export default function WebhooksPage() {
  const { addToast } = useToast();

  const [webhooks, setWebhooks] = useState<
    Array<{
      id: string;
      url: string;
      events: string[];
      status: string;
      created_at: string;
    }>
  >([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);

  const [form, setForm] = useState({
    url: "",
    events: [] as string[],
    secret: "",
    description: "",
  });

  const eventTypes = [
    "case.created",
    "deadline.critical",
    "invoice.paid",
    "document.received",
    "intake.new",
  ];

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/webhooks/outgoing");
      if (!res.ok) throw new Error();
      const data = await res.json();
      setWebhooks(data.webhooks ?? []);
    } catch {
      addToast({ type: "error", title: "Fehler beim Laden" });
    } finally {
      setLoading(false);
    }
  }, [addToast]);

  useEffect(() => {
    void load();
  }, [load]);

  async function save() {
    if (!form.url || form.events.length === 0 || !form.secret) {
      addToast({ type: "error", title: "URL, Events und Secret erforderlich" });
      return;
    }
    setSaving(true);
    try {
      const res = await fetch("/api/webhooks/outgoing", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      if (!res.ok) throw new Error();
      addToast({ type: "success", title: "Webhook registriert" });
      setShowForm(false);
      setForm({ url: "", events: [], secret: "", description: "" });
      await load();
    } catch {
      addToast({ type: "error", title: "Fehler beim Speichern" });
    } finally {
      setSaving(false);
    }
  }

  async function deleteWebhook(id: string) {
    setDeleting(id);
    try {
      const res = await fetch(`/api/webhooks/outgoing?id=${encodeURIComponent(id)}`, {
        method: "DELETE",
      });
      if (!res.ok) throw new Error();
      addToast({ type: "success", title: "Webhook gelöscht" });
      await load();
    } catch {
      addToast({ type: "error", title: "Fehler beim Löschen" });
    } finally {
      setDeleting(null);
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

  if (loading) {
    return (
      <div className="flex justify-center py-20">
        <Loader2 size={24} className="animate-spin text-[color:var(--ds-text-muted)]" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Webhook size={20} className="text-[color:var(--ds-text)]" />
          <h1 className="text-lg font-semibold text-[color:var(--ds-text)]">Webhooks</h1>
        </div>
        <Button onClick={() => setShowForm(!showForm)} variant="secondary" className="gap-2">
          <Plus size={14} />
          Neuer Webhook
        </Button>
      </div>

      {showForm && (
        <div className="space-y-4 rounded-xl border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] p-4">
          <h2 className="text-sm font-semibold text-[color:var(--ds-text)]">
            Webhook registrieren
          </h2>
          <div className="space-y-3">
            <div className="space-y-1">
              <Label className="text-xs text-[color:var(--ds-text-muted)]">URL *</Label>
              <Input
                value={form.url}
                onChange={(e) => setForm({ ...form, url: e.target.value })}
                placeholder="https://yourserver.com/webhook"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-[color:var(--ds-text-muted)]">Events *</Label>
              <div className="flex flex-wrap gap-2">
                {eventTypes.map((evt) => (
                  <button
                    key={evt}
                    onClick={() => toggleEvent(evt)}
                    className={`rounded-lg border px-3 py-1.5 text-xs transition-colors ${
                      form.events.includes(evt)
                        ? "border-violet-500/20 bg-violet-600/15 text-violet-300"
                        : "border-[color:var(--ds-border)] bg-[color:var(--ds-surface-2)] text-[color:var(--ds-text-muted)] hover:bg-[color:var(--ds-surface-3)]"
                    }`}
                  >
                    {evt}
                  </button>
                ))}
              </div>
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-[color:var(--ds-text-muted)]">Secret *</Label>
              <Input
                type="password"
                value={form.secret}
                onChange={(e) => setForm({ ...form, secret: e.target.value })}
                placeholder="Webhook-Secret (min. 16 Zeichen)"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-[color:var(--ds-text-muted)]">Beschreibung</Label>
              <Input
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
                placeholder="Optional"
              />
            </div>
          </div>
          <div className="flex gap-2">
            <Button onClick={() => void save()} disabled={saving} className="brand-bg text-white">
              {saving ? <Loader2 size={14} className="animate-spin" /> : "Speichern"}
            </Button>
            <Button onClick={() => setShowForm(false)} variant="ghost">
              Abbrechen
            </Button>
          </div>
        </div>
      )}

      <div className="space-y-2">
        {webhooks.length === 0 ? (
          <p className="text-sm text-[color:var(--ds-text-muted)]">Keine Webhooks registriert.</p>
        ) : (
          webhooks.map((wh) => (
            <div
              key={wh.id}
              className="flex items-center justify-between rounded-xl border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] px-4 py-3"
            >
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <LinkIcon size={14} className="text-[color:var(--ds-text-muted)]" />
                  <span className="text-sm font-medium text-[color:var(--ds-text)]">{wh.url}</span>
                </div>
                <div className="mt-1 flex flex-wrap gap-1">
                  {wh.events.map((evt) => (
                    <Badge
                      key={evt}
                      variant="default"
                      className="border-[color:var(--ds-border)] bg-[color:var(--ds-surface-2)] text-xs text-[color:var(--ds-text-muted)]"
                    >
                      {evt}
                    </Badge>
                  ))}
                </div>
                <div className="mt-1 text-xs text-[color:var(--ds-text-subtle)]">
                  Erstellt: {new Date(wh.created_at).toLocaleString()}
                </div>
              </div>
              <Button
                onClick={() => void deleteWebhook(wh.id)}
                disabled={deleting === wh.id}
                variant="ghost"
                size="icon"
                className="h-8 w-8 text-red-600 hover:bg-red-500/10"
              >
                {deleting === wh.id ? (
                  <Loader2 size={14} className="animate-spin" />
                ) : (
                  <Trash2 size={14} />
                )}
              </Button>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
