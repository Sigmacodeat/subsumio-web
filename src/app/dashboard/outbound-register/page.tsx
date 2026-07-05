"use client";

import { useEffect, useState, useCallback } from "react";
import { Plus, Loader2, Send, FileText, Download } from "lucide-react";
import { PageHeader } from "@/components/dashboard/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/components/ui/toast";
import { useLang } from "@/lib/use-lang";
import { api } from "@/lib/api";
import type { OutboundEntry } from "@/lib/outbound-register";
import { CHANNEL_LABELS, DELIVERY_STATUS_LABELS } from "@/lib/outbound-register";

export default function OutboundRegisterPage() {
  const { addToast } = useToast();
  const { t } = useLang();
  const [entries, setEntries] = useState<OutboundEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    channel: "email" as OutboundEntry["channel"],
    recipient_name: "",
    recipient_address: "",
    case_slug: "",
    subject: "",
    sent_by: "",
  });

  const load = useCallback(async () => {
    try {
      const pages = await api.brain.listPages({ type: "outbound_entry", limit: 200 });
      setEntries(pages.map((p) => p.frontmatter as unknown as OutboundEntry));
    } catch {
      addToast({ type: "error", title: t("outbound.err_load") });
    } finally {
      setLoading(false);
    }
  }, [addToast, t]);

  useEffect(() => {
    void load();
  }, [load]);

  async function handleCreate() {
    if (!form.recipient_name || !form.subject || !form.sent_by) {
      addToast({ type: "error", title: "Pflichtfelder fehlen" });
      return;
    }
    setSaving(true);
    try {
      const res = await fetch("/api/outbound-register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          channel: form.channel,
          recipient_name: form.recipient_name,
          recipient_address: form.recipient_address,
          case_slug: form.case_slug || undefined,
          subject: form.subject,
          sent_by: form.sent_by,
        }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      addToast({ type: "success", title: "Eintrag erstellt" });
      setShowCreate(false);
      setForm({
        channel: "email",
        recipient_name: "",
        recipient_address: "",
        case_slug: "",
        subject: "",
        sent_by: "",
      });
      void load();
    } catch (e) {
      addToast({
        type: "error",
        title: "Fehler",
        description: e instanceof Error ? e.message : undefined,
      });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="mx-auto max-w-[1000px] space-y-6 p-4 md:p-6 lg:p-8">
      <PageHeader
        title={t("outbound.title")}
        description={t("outbound.description")}
        breadcrumbs={[{ label: "Dashboard", href: "/dashboard" }, { label: t("outbound.title") }]}
        actions={
          <div className="flex gap-2">
            <a href="/api/outbound-register?format=csv" download>
              <Button variant="secondary" className="gap-2">
                <Download size={14} /> CSV
              </Button>
            </a>
            <Button
              onClick={() => setShowCreate(!showCreate)}
              className="brand-bg gap-2 text-white"
            >
              <Plus size={16} /> Eintrag
            </Button>
          </div>
        }
      />

      {showCreate && (
        <form
          className="space-y-4 rounded-xl border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] p-4"
          onSubmit={(e) => {
            e.preventDefault();
            void handleCreate();
          }}
        >
          <h2 className="text-sm font-semibold">Neuer Ausgang</h2>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="space-y-1">
              <Label className="text-xs text-[color:var(--ds-text-muted)]">Kanal *</Label>
              <select
                value={form.channel}
                onChange={(e) =>
                  setForm({ ...form, channel: e.target.value as OutboundEntry["channel"] })
                }
                className="w-full rounded-lg border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] px-3 py-2 text-sm"
              >
                {Object.entries(CHANNEL_LABELS).map(([key, label]) => (
                  <option key={key} value={key}>
                    {label.de}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-[color:var(--ds-text-muted)]">Empfänger *</Label>
              <Input
                value={form.recipient_name}
                onChange={(e) => setForm({ ...form, recipient_name: e.target.value })}
                required
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-[color:var(--ds-text-muted)]">Adresse</Label>
              <Input
                value={form.recipient_address}
                onChange={(e) => setForm({ ...form, recipient_address: e.target.value })}
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-[color:var(--ds-text-muted)]">Akte</Label>
              <Input
                value={form.case_slug}
                onChange={(e) => setForm({ ...form, case_slug: e.target.value })}
              />
            </div>
            <div className="space-y-1 sm:col-span-2">
              <Label className="text-xs text-[color:var(--ds-text-muted)]">Betreff *</Label>
              <Input
                value={form.subject}
                onChange={(e) => setForm({ ...form, subject: e.target.value })}
                required
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-[color:var(--ds-text-muted)]">Versendet von *</Label>
              <Input
                value={form.sent_by}
                onChange={(e) => setForm({ ...form, sent_by: e.target.value })}
                required
              />
            </div>
          </div>
          <Button type="submit" disabled={saving} className="brand-bg gap-2 text-white">
            {saving ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
            Speichern
          </Button>
        </form>
      )}

      {loading ? (
        <div className="flex justify-center py-20">
          <Loader2 size={24} className="animate-spin text-[color:var(--ds-text-muted)]" />
        </div>
      ) : entries.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-[color:var(--ds-border-strong)] py-16 text-center">
          <FileText size={32} className="mb-3 text-[color:var(--ds-text-muted)]" />
          <p className="text-sm font-medium">Keine Einträge</p>
          <p className="mt-1 text-xs text-[color:var(--ds-text-muted)]">
            Erfassen Sie ausgehende Kommunikation für revisionssichere Dokumentation.
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {entries.map((entry) => {
            const statusLabel = DELIVERY_STATUS_LABELS[entry.delivery_status];
            const channelLabel = CHANNEL_LABELS[entry.channel];
            return (
              <div
                key={entry.id}
                className="flex items-center gap-3 rounded-xl border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] px-4 py-3"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium">{entry.recipient_name}</span>
                    <Badge variant="default" className="text-xs">
                      {channelLabel.de}
                    </Badge>
                    <Badge
                      variant="default"
                      className={`text-xs ${entry.delivery_status === "failed" || entry.delivery_status === "bounced" ? "border-red-500/30 text-red-600" : entry.delivery_status === "delivered" ? "border-green-500/30 text-green-600" : ""}`}
                    >
                      {statusLabel.de}
                    </Badge>
                  </div>
                  <div className="mt-0.5 text-xs text-[color:var(--ds-text-muted)]">
                    {entry.subject} {entry.case_slug ? `· ${entry.case_slug}` : ""}
                  </div>
                  <div className="text-xs text-[color:var(--ds-text-muted)]">
                    {new Date(entry.date).toLocaleString("de-DE")} · von {entry.sent_by}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
