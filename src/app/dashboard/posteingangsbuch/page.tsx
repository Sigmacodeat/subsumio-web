"use client";

import { useCallback, useEffect, useState } from "react";
import { Download, Inbox, Loader2, Plus } from "lucide-react";
import { PageHeader } from "@/components/dashboard/page-header";
import { PrimaryAction } from "@/components/dashboard/primary-action";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/components/ui/toast";
import { csrfFetch } from "@/lib/csrf";
import {
  INBOUND_CHANNEL_LABEL,
  type InboundChannel,
  type InboundEntry,
} from "@/lib/inbound-register";
import { EmptyState } from "@/components/dashboard/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import { formatDateTime } from "@/lib/utils";

/**
 * Posteingangsbuch — laufende Nummer/Übersicht über alle eingehenden
 * Dokumente. Uploads stempeln sich seit dieser Seite automatisch selbst
 * hinein (api/upload/route.ts); für Post, die (noch) nicht digitalisiert
 * ist (Briefpost, Fax), gibt es unten einen manuellen Eintrag — dasselbe
 * Muster wie das bereits vorhandene Postausgangsbuch.
 */
export default function PosteingangsbuchPage() {
  const { addToast } = useToast();
  const [entries, setEntries] = useState<InboundEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    channel: "scan" as InboundChannel,
    subject: "",
    sender_name: "",
    sender_address: "",
    case_slug: "",
  });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/inbound-register");
      if (!res.ok) throw new Error(String(res.status));
      const data = await res.json();
      setEntries((data.items ?? data.data?.items ?? []) as InboundEntry[]);
    } catch {
      addToast({ type: "error", title: "Posteingangsbuch konnte nicht geladen werden" });
    } finally {
      setLoading(false);
    }
  }, [addToast]);

  useEffect(() => {
    void load();
  }, [load]);

  async function createEntry() {
    if (!form.subject.trim()) return;
    setSaving(true);
    try {
      const res = await csrfFetch("/api/inbound-register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          channel: form.channel,
          subject: form.subject.trim(),
          sender_name: form.sender_name.trim() || undefined,
          sender_address: form.sender_address.trim() || undefined,
          case_slug: form.case_slug.trim() || undefined,
        }),
      });
      if (!res.ok) throw new Error(String(res.status));
      setForm({ channel: "scan", subject: "", sender_name: "", sender_address: "", case_slug: "" });
      setShowCreate(false);
      await load();
      addToast({ type: "success", title: "Eingetragen" });
    } catch {
      addToast({ type: "error", title: "Eintrag konnte nicht gespeichert werden" });
    } finally {
      setSaving(false);
    }
  }

  function downloadCsv() {
    window.open("/api/inbound-register?format=csv", "_blank");
  }

  return (
    <div className="ds-page space-y-6 p-4 md:p-6 lg:p-8">
      <PageHeader
        title="Posteingangsbuch"
        description="Chronologisches Register aller eingehenden Dokumente — Uploads tragen sich automatisch ein, sonstige Post manuell."
        breadcrumbs={[{ label: "Übersicht", href: "/dashboard" }, { label: "Posteingangsbuch" }]}
        actions={
          <>
            <Button
              variant="outline"
              size="sm"
              onClick={downloadCsv}
              disabled={entries.length === 0}
            >
              <Download size={14} aria-hidden="true" />
              CSV
            </Button>
            <PrimaryAction onClick={() => setShowCreate((s) => !s)}>Eintragen</PrimaryAction>
          </>
        }
      />

      {showCreate && (
        <div className="space-y-3 rounded-xl border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] p-4">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label className="text-xs">Kanal</Label>
              <Select
                value={form.channel}
                onValueChange={(v) => setForm((f) => ({ ...f, channel: v as InboundChannel }))}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(Object.keys(INBOUND_CHANNEL_LABEL) as InboundChannel[]).map((c) => (
                    <SelectItem key={c} value={c}>
                      {INBOUND_CHANNEL_LABEL[c]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Aktenzeichen (optional)</Label>
              <Input
                value={form.case_slug}
                onChange={(e) => setForm((f) => ({ ...f, case_slug: e.target.value }))}
              />
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label className="text-xs">Betreff *</Label>
              <Input
                value={form.subject}
                onChange={(e) => setForm((f) => ({ ...f, subject: e.target.value }))}
                placeholder="z. B. Ladung vom Bezirksgericht"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Absender</Label>
              <Input
                value={form.sender_name}
                onChange={(e) => setForm((f) => ({ ...f, sender_name: e.target.value }))}
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Adresse</Label>
              <Input
                value={form.sender_address}
                onChange={(e) => setForm((f) => ({ ...f, sender_address: e.target.value }))}
              />
            </div>
          </div>
          <Button
            size="sm"
            onClick={() => void createEntry()}
            disabled={saving || !form.subject.trim()}
          >
            {saving ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}
            Speichern
          </Button>
        </div>
      )}

      {loading ? (
        <div className="space-y-2">
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-12 w-full" />
        </div>
      ) : entries.length === 0 ? (
        <EmptyState
          icon={Inbox}
          title="Noch keine Einträge"
          description="Ein Upload trägt sich automatisch ein; sonstige Post über „Eintragen“."
        />
      ) : (
        <div className="overflow-x-auto rounded-xl border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)]">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[color:var(--ds-border)] text-left text-xs text-[color:var(--ds-text-muted)]">
                <th className="px-3 py-2 font-medium">Eingang</th>
                <th className="px-3 py-2 font-medium">Kanal</th>
                <th className="px-3 py-2 font-medium">Absender</th>
                <th className="px-3 py-2 font-medium">Akte</th>
                <th className="px-3 py-2 font-medium">Betreff</th>
              </tr>
            </thead>
            <tbody>
              {entries.map((e) => (
                <tr key={e.id} className="border-b border-[color:var(--ds-border)] last:border-0">
                  <td className="px-3 py-2 whitespace-nowrap tabular-nums">
                    {formatDateTime(e.received_at)}
                  </td>
                  <td className="px-3 py-2">
                    <Badge variant="default" className="text-xs">
                      {INBOUND_CHANNEL_LABEL[e.channel]}
                    </Badge>
                  </td>
                  <td className="px-3 py-2 text-[color:var(--ds-text-muted)]">
                    {e.sender_name ?? "—"}
                  </td>
                  <td className="px-3 py-2 text-[color:var(--ds-text-muted)]">
                    {e.case_slug ? (
                      <span className="inline-flex items-center gap-1.5">
                        {e.case_slug}
                        {e.case_suggested && (
                          <Badge
                            variant="attention"
                            className="text-xs"
                            title={`Automatische Zuordnung: ${e.case_suggest_reason ?? ""}`}
                          >
                            Vorschlag
                          </Badge>
                        )}
                      </span>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td className="px-3 py-2">{e.subject}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
