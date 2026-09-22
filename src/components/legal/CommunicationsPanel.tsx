"use client";

import { useCallback, useEffect, useState } from "react";
import { ArrowDownLeft, ArrowUpRight, Inbox, Loader2, MessagesSquare, Timer } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/components/ui/toast";
import { formatDateTime } from "@/lib/utils";

interface CommunicationItem {
  id: string;
  at: string;
  direction: "inbound" | "outbound";
  channel: string;
  title: string;
  party?: string;
  status?: string;
  source: "posteingang" | "postausgang" | "portal" | "email" | "whatsapp";
}

const CHANNEL_LABEL: Record<string, string> = {
  upload: "Upload",
  email: "E-Mail",
  whatsapp: "WhatsApp",
  erv: "ERV",
  scan: "Scan",
  portal: "Portal",
  bea: "beA",
  post: "Post",
  fax: "Fax",
};

const SOURCE_LABEL: Record<CommunicationItem["source"], string> = {
  posteingang: "Posteingang",
  postausgang: "Postausgang",
  portal: "Portal",
  email: "E-Mail",
  whatsapp: "WhatsApp",
};

/** Kommunikationsverlauf der Akte über alle Kanäle (WP-3.14). */
export function CommunicationsPanel({ caseSlug }: { caseSlug: string }) {
  const { addToast } = useToast();
  const [items, setItems] = useState<CommunicationItem[] | null>(null);
  const [error, setError] = useState(false);
  const [channelFilter, setChannelFilter] = useState("all");
  /** WP-3.16: Kommunikation als abrechenbare Leistung buchen. */
  const [billingFor, setBillingFor] = useState<string | null>(null);
  const [billMinutes, setBillMinutes] = useState("6");
  const [billBusy, setBillBusy] = useState(false);

  async function bookAsService(item: CommunicationItem) {
    const mins = parseInt(billMinutes, 10);
    if (!mins || mins <= 0) return;
    setBillBusy(true);
    try {
      const res = await fetch("/api/time", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({
          case_slug: caseSlug,
          description:
            `Korrespondenz: ${item.title} (${CHANNEL_LABEL[item.channel] ?? item.channel}${item.party ? `, ${item.party}` : ""})`.slice(
              0,
              500
            ),
          minutes: mins,
          date: item.at ? item.at.slice(0, 10) : new Date().toISOString().slice(0, 10),
          billable: true,
          activity_type: "correspondence",
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || "Buchung fehlgeschlagen");
      addToast({ type: "success", title: `${mins} min als Leistung gebucht` });
      setBillingFor(null);
      setBillMinutes("6");
    } catch (err) {
      addToast({
        type: "error",
        title: err instanceof Error ? err.message : "Buchung fehlgeschlagen",
      });
    } finally {
      setBillBusy(false);
    }
  }

  const load = useCallback(async () => {
    try {
      const res = await fetch(
        `/api/legal/communications?case_slug=${encodeURIComponent(caseSlug)}`,
        { credentials: "same-origin" }
      );
      if (!res.ok) throw new Error(String(res.status));
      const data = await res.json();
      setItems(data.data?.items ?? []);
      setError(false);
    } catch {
      setError(true);
    }
  }, [caseSlug]);

  useEffect(() => {
    void load();
  }, [load]);

  const channels = [...new Set((items ?? []).map((i) => i.channel))];
  const visible = (items ?? []).filter(
    (i) => channelFilter === "all" || i.channel === channelFilter
  );

  return (
    <section className="space-y-3 rounded-xl border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="flex items-center gap-2 text-sm font-semibold text-[color:var(--ds-text)]">
          <MessagesSquare size={15} aria-hidden /> Kommunikationsverlauf
        </h3>
        {channels.length > 1 && (
          <select
            value={channelFilter}
            onChange={(e) => setChannelFilter(e.target.value)}
            aria-label="Nach Kanal filtern"
            className="rounded-lg border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] px-2 py-1 text-xs text-[color:var(--ds-text)]"
          >
            <option value="all">Alle Kanäle</option>
            {channels.map((c) => (
              <option key={c} value={c}>
                {CHANNEL_LABEL[c] ?? c}
              </option>
            ))}
          </select>
        )}
      </div>

      {error ? (
        <p role="alert" className="text-xs text-[color:var(--ds-danger-text)]">
          Kommunikationsverlauf konnte nicht geladen werden.
        </p>
      ) : items === null ? (
        <p className="flex items-center gap-2 text-xs text-[color:var(--ds-text-muted)]">
          <Loader2 size={13} className="animate-spin" /> Laden…
        </p>
      ) : visible.length === 0 ? (
        <p className="flex items-center gap-2 text-xs text-[color:var(--ds-text-muted)]">
          <Inbox size={13} aria-hidden /> Keine Kommunikation zu dieser Akte.
        </p>
      ) : (
        <ol className="divide-y divide-[color:var(--ds-border)]">
          {visible.slice(0, 100).map((i) => (
            <li key={i.id} className="flex items-start gap-3 py-2">
              <span
                className={`mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full ${
                  i.direction === "inbound"
                    ? "bg-[color:var(--ds-info-bg)] text-[color:var(--ds-info-text)]"
                    : "bg-[color:var(--ds-surface-2)] text-[color:var(--ds-text-muted)]"
                }`}
                aria-label={i.direction === "inbound" ? "Eingehend" : "Ausgehend"}
              >
                {i.direction === "inbound" ? (
                  <ArrowDownLeft size={12} aria-hidden />
                ) : (
                  <ArrowUpRight size={12} aria-hidden />
                )}
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                  <span className="truncate text-sm text-[color:var(--ds-text)]">{i.title}</span>
                  <Badge variant="default" className="shrink-0 text-[10px]">
                    {CHANNEL_LABEL[i.channel] ?? i.channel}
                  </Badge>
                  {i.status && i.status !== "sent" && (
                    <Badge
                      variant={
                        i.status === "failed" || i.status === "bounced" ? "danger" : "default"
                      }
                      className="shrink-0 text-[10px]"
                    >
                      {i.status}
                    </Badge>
                  )}
                </div>
                <p className="mt-0.5 text-xs text-[color:var(--ds-text-muted)]">
                  {i.at ? formatDateTime(i.at) : "—"}
                  {i.party ? ` · ${i.party}` : ""} · {SOURCE_LABEL[i.source]}
                </p>
                {billingFor === i.id ? (
                  <div className="mt-2 flex items-center gap-2">
                    <Input
                      type="number"
                      min={1}
                      max={480}
                      value={billMinutes}
                      onChange={(e) => setBillMinutes(e.target.value)}
                      aria-label="Minuten"
                      className="h-7 w-20 text-xs"
                      disabled={billBusy}
                    />
                    <span className="text-xs text-[color:var(--ds-text-muted)]">min</span>
                    <Button
                      size="sm"
                      className="h-7 text-xs"
                      disabled={billBusy || !parseInt(billMinutes, 10)}
                      onClick={() => void bookAsService(i)}
                    >
                      {billBusy && <Loader2 size={11} className="animate-spin" />}
                      Buchen
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-7 text-xs"
                      disabled={billBusy}
                      onClick={() => setBillingFor(null)}
                    >
                      Abbrechen
                    </Button>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => {
                      setBillingFor(i.id);
                      setBillMinutes("6");
                    }}
                    className="mt-1 inline-flex items-center gap-1 text-[11px] text-[color:var(--ds-text-subtle)] transition-colors hover:text-[color:var(--brand-primary)]"
                  >
                    <Timer size={11} aria-hidden /> Als Leistung buchen
                  </button>
                )}
              </div>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
