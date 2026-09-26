"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  AlertTriangle,
  CalendarPlus,
  Check,
  Download,
  Inbox,
  Loader2,
  Pencil,
  Plus,
  RotateCcw,
  UserPlus,
} from "lucide-react";
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
import { encodeSlugPath, formatDateTime } from "@/lib/utils";
import { api } from "@/lib/api";
import { inboundDeadlineDescription } from "@/lib/inbound-register";

/**
 * Posteingangsbuch — laufende Nummer/Übersicht über alle eingehenden
 * Dokumente. Uploads stempeln sich seit dieser Seite automatisch selbst
 * hinein (api/upload/route.ts); für Post, die (noch) nicht digitalisiert
 * ist (Briefpost, Fax), gibt es unten einen manuellen Eintrag — dasselbe
 * Muster wie das bereits vorhandene Postausgangsbuch.
 */
interface FailedStamp {
  task_slug: string;
  subject: string;
  channel?: string;
  last_error?: string;
  attempts?: number;
}

export default function PosteingangsbuchPage() {
  const { addToast } = useToast();
  const [entries, setEntries] = useState<InboundEntry[]>([]);
  const [failedStamps, setFailedStamps] = useState<FailedStamp[]>([]);
  const [pendingStamps, setPendingStamps] = useState<FailedStamp[]>([]);
  const [retrying, setRetrying] = useState<string | null>(null);
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

  const [loadError, setLoadError] = useState(false);
  /** Matter titles/Aktenzeichen for the register column (slug → label). */
  const [caseLabels, setCaseLabels] = useState<Record<string, string>>({});
  /** Entry whose matter is being corrected, with the typed Aktenzeichen. */
  const [reassign, setReassign] = useState<{ id: string; value: string } | null>(null);
  const [assigning, setAssigning] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    api.brain
      .listAllPages({ type: "legal_case", max: 10_000 })
      .then((pages) => {
        if (cancelled) return;
        const labels: Record<string, string> = {};
        for (const p of pages as Array<{
          slug: string;
          title?: string;
          frontmatter?: Record<string, unknown>;
        }>) {
          const nr = p.frontmatter?.case_number;
          labels[p.slug] = [typeof nr === "string" ? nr : "", p.title ?? ""]
            .filter(Boolean)
            .join(" · ");
        }
        setCaseLabels(labels);
      })
      .catch(() => {
        // Without titles the column shows the matter link by its address.
      });
    return () => {
      cancelled = true;
    };
  }, []);

  async function assignCase(id: string, action: "confirm" | "assign", caseSlug?: string) {
    setAssigning(id);
    try {
      const res = await csrfFetch("/api/inbound-register", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, action, case_slug: caseSlug }),
      });
      if (!res.ok) {
        const err = (await res.json().catch(() => ({}))) as { message?: string; error?: string };
        throw new Error(err.message || err.error || String(res.status));
      }
      setReassign(null);
      await load();
      addToast({
        type: "success",
        title: action === "confirm" ? "Zuordnung bestätigt" : "Zuordnung geändert",
      });
    } catch (e) {
      const msg = e instanceof Error && !/^\d+$/.test(e.message) ? e.message : undefined;
      addToast({ type: "error", title: "Zuordnung nicht gespeichert", description: msg });
    } finally {
      setAssigning(null);
    }
  }

  function createDeadline(e: InboundEntry) {
    // The dashboard shell owns the deadline dialog: it is saved as an
    // unreviewed deadline of this matter (Vier-Augen-Prüfung in Fristen).
    window.dispatchEvent(
      new CustomEvent("subsumio:create-deadline", {
        detail: { caseSlug: e.case_slug, description: inboundDeadlineDescription(e) },
      })
    );
  }

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(false);
    try {
      const res = await fetch("/api/inbound-register");
      if (!res.ok) throw new Error(String(res.status));
      const data = await res.json();
      setEntries((data.items ?? data.data?.items ?? []) as InboundEntry[]);
      setFailedStamps((data.failed_stamps ?? data.data?.failed_stamps ?? []) as FailedStamp[]);
      setPendingStamps((data.pending_stamps ?? data.data?.pending_stamps ?? []) as FailedStamp[]);
    } catch {
      setLoadError(true);
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
      if (!res.ok) {
        const err = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(err.error || String(res.status));
      }
      setForm({ channel: "scan", subject: "", sender_name: "", sender_address: "", case_slug: "" });
      setShowCreate(false);
      await load();
      addToast({ type: "success", title: "Eingetragen" });
    } catch (e) {
      const msg = e instanceof Error && !/^\d+$/.test(e.message) ? e.message : undefined;
      addToast({
        type: "error",
        title: "Eintrag konnte nicht gespeichert werden",
        description: msg,
      });
    } finally {
      setSaving(false);
    }
  }

  async function retryStamp(taskSlug: string) {
    setRetrying(taskSlug);
    try {
      const res = await csrfFetch("/api/post-upload-tasks/retry", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ task_slug: taskSlug }),
      });
      if (!res.ok) throw new Error(String(res.status));
      setFailedStamps((list) => list.filter((s) => s.task_slug !== taskSlug));
      addToast({
        type: "success",
        title: "Erneut eingereiht — der Eintrag wird automatisch nachgeholt",
      });
    } catch {
      addToast({ type: "error", title: "Erneutes Einreihen fehlgeschlagen" });
    } finally {
      setRetrying(null);
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
              asChild
              title="Neue Mandatsanfragen prüfen & in Akten überführen"
            >
              <Link href="/dashboard/intake">
                <UserPlus size={14} aria-hidden="true" />
                Mandatsanfragen
              </Link>
            </Button>
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

      {failedStamps.length > 0 && (
        <div
          role="alert"
          className="rounded-xl border border-[color:var(--ds-warning-border)] bg-[color:var(--ds-warning-bg)] p-4"
        >
          <div className="flex items-start gap-3">
            <AlertTriangle
              size={16}
              className="mt-0.5 shrink-0 text-[color:var(--ds-warning-text)]"
              aria-hidden="true"
            />
            <div className="min-w-0 flex-1 space-y-2">
              <p className="text-sm font-medium">
                {failedStamps.length === 1
                  ? "1 Eingang konnte nicht registriert werden"
                  : `${failedStamps.length} Eingänge konnten nicht registriert werden`}
              </p>
              <p className="text-xs text-[color:var(--ds-text-muted)]">
                Die Dokumente sind gespeichert, aber der Register-Eintrag ist nach mehreren
                automatischen Versuchen fehlgeschlagen.
              </p>
              <ul className="space-y-1.5">
                {failedStamps.map((s) => (
                  <li key={s.task_slug} className="flex items-center justify-between gap-3 text-sm">
                    <span className="min-w-0 truncate">
                      {s.channel && s.channel in INBOUND_CHANNEL_LABEL
                        ? `${INBOUND_CHANNEL_LABEL[s.channel as InboundChannel]} — `
                        : ""}
                      {s.subject}
                    </span>
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={retrying === s.task_slug}
                      onClick={() => void retryStamp(s.task_slug)}
                    >
                      {retrying === s.task_slug ? (
                        <Loader2 size={13} className="animate-spin" aria-hidden="true" />
                      ) : (
                        <RotateCcw size={13} aria-hidden="true" />
                      )}
                      Erneut eintragen
                    </Button>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      )}

      {pendingStamps.length > 0 && (
        <div className="rounded-xl border border-[color:var(--ds-info-border)] bg-[color:var(--ds-info-bg)] px-4 py-3">
          <p className="text-xs text-[color:var(--ds-info-text)]">
            {pendingStamps.length === 1
              ? "1 Registrierung wird gerade wiederholt"
              : `${pendingStamps.length} Registrierungen werden gerade wiederholt`}{" "}
            — die Einträge erscheinen automatisch, sobald die Engine wieder erreichbar ist:{" "}
            {pendingStamps
              .map(
                (s) =>
                  `${s.channel && s.channel in INBOUND_CHANNEL_LABEL ? `${INBOUND_CHANNEL_LABEL[s.channel as InboundChannel]} ` : ""}${s.subject}`
              )
              .join(" · ")}
          </p>
        </div>
      )}

      {loading ? (
        <div className="space-y-2">
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-12 w-full" />
        </div>
      ) : loadError ? (
        <div
          role="alert"
          className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[color:var(--ds-danger-border)] bg-[color:var(--ds-danger-bg)] px-4 py-3 text-sm text-[color:var(--ds-danger-text)]"
        >
          <span>Das Posteingangsbuch konnte nicht geladen werden.</span>
          <Button variant="outline" size="sm" onClick={() => void load()}>
            Erneut laden
          </Button>
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
                    {reassign?.id === e.id ? (
                      <form
                        className="flex items-center gap-1.5"
                        onSubmit={(ev) => {
                          ev.preventDefault();
                          if (reassign.value.trim())
                            void assignCase(e.id, "assign", reassign.value.trim());
                        }}
                      >
                        <Input
                          autoFocus
                          aria-label="Aktenzeichen"
                          value={reassign.value}
                          onChange={(ev) => setReassign({ id: e.id, value: ev.target.value })}
                          placeholder="Aktenzeichen"
                          className="h-8 w-36 text-xs"
                        />
                        <Button type="submit" size="sm" disabled={assigning === e.id}>
                          Zuordnen
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant="ghost"
                          onClick={() => setReassign(null)}
                        >
                          Abbrechen
                        </Button>
                      </form>
                    ) : (
                      <span className="inline-flex flex-wrap items-center gap-1.5">
                        {e.case_slug ? (
                          <Link
                            href={`/dashboard/cases/${encodeSlugPath(e.case_slug)}`}
                            className="text-[color:var(--brand-primary)] hover:underline"
                          >
                            {caseLabels[e.case_slug] || e.case_slug}
                          </Link>
                        ) : (
                          "—"
                        )}
                        {e.case_slug && e.case_suggested && (
                          <>
                            <Badge
                              variant="attention"
                              className="text-xs"
                              title={`Automatische Zuordnung: ${e.case_suggest_reason ?? ""}`}
                            >
                              Vorschlag
                            </Badge>
                            <Button
                              type="button"
                              size="sm"
                              variant="ghost"
                              className="h-7 gap-1 px-2 text-xs"
                              disabled={assigning === e.id}
                              onClick={() => void assignCase(e.id, "confirm")}
                              aria-label={`Zuordnung von „${e.subject}“ bestätigen`}
                            >
                              <Check size={12} aria-hidden /> Bestätigen
                            </Button>
                          </>
                        )}
                        <Button
                          type="button"
                          size="sm"
                          variant="ghost"
                          className="h-7 gap-1 px-2 text-xs"
                          onClick={() => setReassign({ id: e.id, value: "" })}
                          aria-label={`Akte für „${e.subject}“ ${e.case_slug ? "ändern" : "zuordnen"}`}
                        >
                          <Pencil size={12} aria-hidden /> {e.case_slug ? "Ändern" : "Zuordnen"}
                        </Button>
                        {e.case_slug && (
                          <Button
                            type="button"
                            size="sm"
                            variant="ghost"
                            className="h-7 gap-1 px-2 text-xs"
                            onClick={() => createDeadline(e)}
                            aria-label={`Frist aus „${e.subject}“ anlegen`}
                          >
                            <CalendarPlus size={12} aria-hidden /> Frist anlegen
                          </Button>
                        )}
                      </span>
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
