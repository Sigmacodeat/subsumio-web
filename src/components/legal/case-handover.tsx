"use client";

import { useState, useCallback, useEffect } from "react";
import { Loader2, ArrowRightCircle, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useLang } from "@/lib/use-lang";
import { useMatterDetail } from "@/lib/matter-detail-context";
import { useToast } from "@/components/ui/toast";
import { api } from "@/lib/api";
import type { BrainPage } from "@/lib/types";

interface HandoverEntry {
  slug: string;
  recipient: string;
  note: string;
  urgency: "low" | "medium" | "high";
  created_at: string;
}

export function CaseHandover() {
  const { t } = useLang();
  const ctx = useMatterDetail();
  const { addToast } = useToast();
  const [handovers, setHandovers] = useState<HandoverEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [recipient, setRecipient] = useState("");
  const [note, setNote] = useState("");
  const [urgency, setUrgency] = useState<"low" | "medium" | "high">("medium");

  const caseSlug = ctx.caseData?.slug ?? "";

  const load = useCallback(async () => {
    if (!caseSlug) return;
    try {
      const pages = await api.brain.listPages({ type: "legal_case_handover", limit: 50 });
      const filtered = pages.filter((p) => p.frontmatter?.case_slug === caseSlug);
      const mapped: HandoverEntry[] = filtered.map((p: BrainPage) => ({
        slug: p.slug,
        recipient: String(p.frontmatter?.recipient ?? ""),
        note: String(p.content ?? ""),
        urgency: (p.frontmatter?.urgency as HandoverEntry["urgency"]) ?? "medium",
        created_at: String(p.frontmatter?.created_at ?? ""),
      }));
      mapped.sort((a, b) => b.created_at.localeCompare(a.created_at));
      setHandovers(mapped);
    } catch {
      addToast({ type: "error", title: t("common.error") });
    } finally {
      setLoading(false);
    }
  }, [caseSlug, addToast, t]);

  useEffect(() => {
    void load();
  }, [load]);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!recipient.trim()) return;
    setSaving(true);
    try {
      const slug = `legal/handovers/${Date.now().toString(36)}`;
      await api.brain.createPage({
        slug,
        title: `Übergabe: ${ctx.caseData?.title ?? ""} → ${recipient.trim()}`,
        type: "legal_case_handover",
        content: note.trim(),
        frontmatter: {
          case_slug: caseSlug,
          recipient: recipient.trim(),
          urgency,
          created_at: new Date().toISOString(),
        },
      });
      window.dispatchEvent(
        new CustomEvent("subsumio:case-handover", {
          detail: { caseSlug, recipient: recipient.trim(), urgency },
        })
      );
      addToast({ type: "success", title: t("mattertab.handover_created") });
      setRecipient("");
      setNote("");
      setUrgency("medium");
      setShowForm(false);
      void load();
    } catch {
      addToast({ type: "error", title: t("common.error") });
    } finally {
      setSaving(false);
    }
  }

  async function deleteHandover(entry: HandoverEntry) {
    try {
      await api.brain.deletePage(entry.slug);
      void load();
    } catch {
      addToast({ type: "error", title: t("common.error") });
    }
  }

  if (loading) {
    return (
      <div className="flex justify-center py-8">
        <Loader2 size={20} className="animate-spin text-[color:var(--ds-text-muted)]" />
      </div>
    );
  }

  return (
    <div className="space-y-3 rounded-xl border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] p-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <ArrowRightCircle
            size={16}
            className="text-[color:var(--brand-primary)]"
            aria-hidden="true"
          />
          <h3 className="text-sm font-semibold text-[color:var(--ds-text)]">
            {t("mattertab.handover")}
          </h3>
        </div>
        <Button size="sm" variant="outline" onClick={() => setShowForm(!showForm)}>
          {showForm ? t("common.cancel") : t("mattertab.handover_submit")}
        </Button>
      </div>

      {showForm && (
        <form className="space-y-3" onSubmit={handleCreate}>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="space-y-1">
              <Label className="text-xs text-[color:var(--ds-text-muted)]">
                {t("mattertab.handover_recipient")} *
              </Label>
              <Input value={recipient} onChange={(e) => setRecipient(e.target.value)} required />
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-[color:var(--ds-text-muted)]">
                {t("mattertab.handover_urgency")}
              </Label>
              <Select
                value={urgency}
                onValueChange={(v) => setUrgency(v as "low" | "medium" | "high")}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="low">{t("mattertab.urgency_low")}</SelectItem>
                  <SelectItem value="medium">{t("mattertab.urgency_medium")}</SelectItem>
                  <SelectItem value="high">{t("mattertab.urgency_high")}</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-1">
            <Label className="text-xs text-[color:var(--ds-text-muted)]">
              {t("mattertab.handover_note")}
            </Label>
            <Textarea value={note} onChange={(e) => setNote(e.target.value)} rows={4} />
          </div>
          <Button type="submit" disabled={saving} className="brand-bg gap-2 text-white">
            {saving && <Loader2 size={14} className="animate-spin" />}
            {t("mattertab.handover_submit")}
          </Button>
        </form>
      )}

      {handovers.length === 0 ? (
        <p className="py-4 text-center text-sm text-[color:var(--ds-text-muted)]">
          {t("mattertab.handover_empty")}
        </p>
      ) : (
        <div className="space-y-2">
          {handovers.map((entry) => (
            <div
              key={entry.slug}
              className="flex items-start gap-2 rounded-lg border border-[color:var(--ds-border)] bg-[color:var(--ds-surface-2)] p-3"
            >
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium text-[color:var(--ds-text)]">
                    {entry.recipient}
                  </span>
                  <Badge
                    variant="default"
                    className={
                      entry.urgency === "high"
                        ? "border-red-500/30 text-red-600"
                        : entry.urgency === "medium"
                          ? "border-orange-500/30 text-orange-600"
                          : ""
                    }
                  >
                    {entry.urgency === "high"
                      ? t("mattertab.urgency_high")
                      : entry.urgency === "medium"
                        ? t("mattertab.urgency_medium")
                        : t("mattertab.urgency_low")}
                  </Badge>
                  <span className="text-xs text-[color:var(--ds-text-subtle)]">
                    {new Date(entry.created_at).toLocaleDateString("de-DE")}
                  </span>
                </div>
                {entry.note && (
                  <p className="mt-1 text-sm whitespace-pre-wrap text-[color:var(--ds-text-muted)]">
                    {entry.note}
                  </p>
                )}
              </div>
              <button
                type="button"
                onClick={() => deleteHandover(entry)}
                aria-label={t("common.delete")}
                className="rounded p-1 text-[color:var(--ds-text-subtle)] hover:text-[color:var(--ds-danger-text)]"
              >
                <Trash2 size={14} />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
