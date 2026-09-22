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
import { EmptyState } from "@/components/dashboard/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import { encodeSlugPath, formatDateTime } from "@/lib/utils";
import Link from "next/link";

export default function OutboundRegisterPage() {
  const { addToast } = useToast();
  const { t } = useLang();
  const [entries, setEntries] = useState<OutboundEntry[]>([]);
  const [cases, setCases] = useState<Array<{ slug: string; title: string }>>([]);
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
    api.brain
      .listPages({ type: "legal_case", limit: 200 })
      .then((pages) => setCases(pages.map((p) => ({ slug: p.slug, title: p.title }))))
      .catch(() => setCases([]));
  }, [load]);

  const caseTitle = (slug: string) => cases.find((c) => c.slug === slug)?.title ?? "Akte";

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
      if (!res.ok) throw new Error("save_failed");
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
    } catch {
      addToast({
        type: "error",
        title: "Eintrag konnte nicht gespeichert werden",
        description: "Bitte versuchen Sie es erneut.",
      });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="ds-page space-y-6 p-4 md:p-6 lg:p-8">
      <PageHeader
        title={t("outbound.title")}
        description={t("outbound.description")}
        breadcrumbs={[
          { label: t("breadcrumb.dashboard"), href: "/dashboard" },
          { label: t("outbound.title") },
        ]}
        actions={
          <div className="flex gap-2">
            <Button variant="outline" size="sm" className="gap-1.5 whitespace-nowrap" asChild>
              <a href="/api/outbound-register?format=csv" download>
                <Download size={14} aria-hidden="true" /> Als CSV exportieren
              </a>
            </Button>
            <Button
              size="sm"
              onClick={() => setShowCreate(!showCreate)}
              className="gap-1.5 whitespace-nowrap"
            >
              <Plus size={14} aria-hidden="true" /> Neuer Eintrag
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
              <Label htmlFor="ob-channel" className="text-xs text-[color:var(--ds-text-muted)]">
                Kanal *
              </Label>
              <select
                id="ob-channel"
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
              <Label htmlFor="ob-recipient" className="text-xs text-[color:var(--ds-text-muted)]">
                Empfänger *
              </Label>
              <Input
                id="ob-recipient"
                value={form.recipient_name}
                onChange={(e) => setForm({ ...form, recipient_name: e.target.value })}
                required
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="ob-address" className="text-xs text-[color:var(--ds-text-muted)]">
                Adresse
              </Label>
              <Input
                id="ob-address"
                value={form.recipient_address}
                onChange={(e) => setForm({ ...form, recipient_address: e.target.value })}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="ob-case" className="text-xs text-[color:var(--ds-text-muted)]">
                Akte
              </Label>
              <select
                id="ob-case"
                value={form.case_slug}
                onChange={(e) => setForm({ ...form, case_slug: e.target.value })}
                className="w-full rounded-lg border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] px-3 py-2 text-sm"
              >
                <option value="">Ohne Aktenbezug</option>
                {cases.map((c) => (
                  <option key={c.slug} value={c.slug}>
                    {c.title}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1 sm:col-span-2">
              <Label htmlFor="ob-subject" className="text-xs text-[color:var(--ds-text-muted)]">
                Betreff *
              </Label>
              <Input
                id="ob-subject"
                value={form.subject}
                onChange={(e) => setForm({ ...form, subject: e.target.value })}
                required
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="ob-sender" className="text-xs text-[color:var(--ds-text-muted)]">
                Versendet von *
              </Label>
              <Input
                id="ob-sender"
                value={form.sent_by}
                onChange={(e) => setForm({ ...form, sent_by: e.target.value })}
                required
              />
            </div>
          </div>
          <Button type="submit" disabled={saving} className="gap-2">
            {saving ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
            Speichern
          </Button>
        </form>
      )}

      {loading ? (
        <div className="space-y-2" aria-busy="true">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-16 w-full rounded-xl" />
          ))}
        </div>
      ) : entries.length === 0 ? (
        <EmptyState
          icon={FileText}
          title="Keine Einträge"
          description="Erfassen Sie ausgehende Kommunikation für revisionssichere Dokumentation."
          actionLabel="Neuer Eintrag"
          onAction={() => setShowCreate(true)}
        />
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
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-medium">{entry.recipient_name}</span>
                    <Badge variant="default" className="text-xs">
                      {channelLabel?.de ?? entry.channel}
                    </Badge>
                    <Badge
                      variant="default"
                      className={`text-xs ${entry.delivery_status === "failed" || entry.delivery_status === "bounced" ? "border-[color:var(--ds-danger-border)] text-[color:var(--ds-danger-text)]" : entry.delivery_status === "delivered" ? "border-[color:var(--ds-success-border)] text-[color:var(--ds-success-text)]" : ""}`}
                    >
                      {statusLabel?.de ?? entry.delivery_status}
                    </Badge>
                  </div>
                  <div className="mt-0.5 text-xs text-[color:var(--ds-text-muted)]">
                    {entry.subject}
                    {entry.case_slug && (
                      <>
                        {" · "}
                        <Link
                          href={`/dashboard/cases/${encodeSlugPath(entry.case_slug)}`}
                          className="text-[color:var(--brand-primary)] hover:underline"
                        >
                          {caseTitle(entry.case_slug)}
                        </Link>
                      </>
                    )}
                  </div>
                  <div className="text-xs text-[color:var(--ds-text-muted)]">
                    <span className="tabular-nums">{formatDateTime(entry.date)}</span> · von{" "}
                    {entry.sent_by}
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
