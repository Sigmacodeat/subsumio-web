"use client";

import { useState, useCallback, useEffect } from "react";
import { Loader2, Plus, Trash2, Users, Clock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useLang } from "@/lib/use-lang";
import { useMatterDetail } from "@/lib/matter-detail-context";
import { useToast } from "@/components/ui/toast";
import { api } from "@/lib/api";
import type { BrainPage } from "@/lib/types";

interface MeetingEntry {
  slug: string;
  title: string;
  agenda: string;
  notes: string;
  actions: string;
  occurred_at: string;
}

const DEFAULT_AGENDA_DE = `1. Sachverhaltsaktualisierung
2. Stand Verfahren
3. Weitere Schritte / Strategie
4. Kostenentwicklung
5. Offene Fragen des Mandanten
6. Nächste Termine / Fristen`;

const DEFAULT_AGENDA_EN = `1. Case facts update
2. Case status
3. Next steps / strategy
4. Cost development
5. Client questions
6. Next dates / deadlines`;

export function ClientMeetingPrep() {
  const { t, lang } = useLang();
  const ctx = useMatterDetail();
  const { addToast } = useToast();
  const [meetings, setMeetings] = useState<MeetingEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [title, setTitle] = useState("");
  const [agenda, setAgenda] = useState(lang === "en" ? DEFAULT_AGENDA_EN : DEFAULT_AGENDA_DE);
  const [notes, setNotes] = useState("");
  const [actions, setActions] = useState("");

  const caseSlug = ctx.caseData?.slug ?? "";

  const load = useCallback(async () => {
    if (!caseSlug) return;
    try {
      const pages = await api.brain.listPages({ type: "legal_client_meeting", limit: 50 });
      const filtered = pages.filter((p) => p.frontmatter?.case_slug === caseSlug);
      const mapped: MeetingEntry[] = filtered.map((p: BrainPage) => ({
        slug: p.slug,
        title: p.title,
        agenda: String(p.frontmatter?.agenda ?? ""),
        notes: String(p.content ?? ""),
        actions: String(p.frontmatter?.actions ?? ""),
        occurred_at: String(p.frontmatter?.occurred_at ?? ""),
      }));
      mapped.sort((a, b) => b.occurred_at.localeCompare(a.occurred_at));
      setMeetings(mapped);
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
    if (!title.trim()) return;
    setSaving(true);
    try {
      const slug = `legal/client-meetings/${Date.now().toString(36)}`;
      await api.brain.createPage({
        slug,
        title: title.trim(),
        type: "legal_client_meeting",
        content: notes.trim(),
        frontmatter: {
          case_slug: caseSlug,
          agenda: agenda.trim(),
          actions: actions.trim(),
          occurred_at: new Date().toISOString(),
        },
      });
      addToast({ type: "success", title: t("mattertab.client_meeting_saved") });
      setTitle("");
      setNotes("");
      setActions("");
      setAgenda(lang === "en" ? DEFAULT_AGENDA_EN : DEFAULT_AGENDA_DE);
      setShowForm(false);
      void load();
    } catch {
      addToast({ type: "error", title: t("common.error") });
    } finally {
      setSaving(false);
    }
  }

  async function deleteMeeting(entry: MeetingEntry) {
    try {
      await api.brain.deletePage(entry.slug);
      void load();
    } catch {
      addToast({ type: "error", title: t("common.error") });
    }
  }

  if (loading) {
    return (
      <div className="flex justify-center py-8" role="status" aria-live="polite">
        <Loader2 size={20} className="animate-spin text-[color:var(--ds-text-muted)]" />
      </div>
    );
  }

  return (
    <div className="space-y-3 rounded-xl border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] p-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Users size={16} className="text-[color:var(--brand-primary)]" aria-hidden="true" />
          <h3 className="text-sm font-semibold text-[color:var(--ds-text)]">
            {t("mattertab.client_meeting")}
          </h3>
        </div>
        <Button size="sm" variant="outline" onClick={() => setShowForm(!showForm)}>
          {showForm ? t("common.cancel") : t("mattertab.client_meeting_prepare")}
        </Button>
      </div>

      {showForm && (
        <form className="space-y-3" onSubmit={handleCreate}>
          <div className="space-y-1">
            <Label className="text-xs text-[color:var(--ds-text-muted)]">
              {t("mattertab.phone_subject")} *
            </Label>
            <Input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder={t("mattertab.client_meeting_placeholder")}
              required
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs text-[color:var(--ds-text-muted)]">
              {t("mattertab.client_meeting_agenda")}
            </Label>
            <Textarea value={agenda} onChange={(e) => setAgenda(e.target.value)} rows={6} />
          </div>
          <div className="space-y-1">
            <Label className="text-xs text-[color:var(--ds-text-muted)]">
              {t("mattertab.client_meeting_notes")}
            </Label>
            <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={4} />
          </div>
          <div className="space-y-1">
            <Label className="text-xs text-[color:var(--ds-text-muted)]">
              {t("mattertab.client_meeting_actions")}
            </Label>
            <Textarea value={actions} onChange={(e) => setActions(e.target.value)} rows={3} />
          </div>
          <Button type="submit" disabled={saving} className="brand-bg gap-2 text-white">
            {saving && <Loader2 size={14} className="animate-spin" />}
            {t("common.save")}
          </Button>
        </form>
      )}

      {meetings.length === 0 ? (
        <p className="py-4 text-center text-sm text-[color:var(--ds-text-muted)]">
          {t("mattertab.client_meeting_empty")}
        </p>
      ) : (
        <div className="space-y-2">
          {meetings.map((entry) => (
            <div
              key={entry.slug}
              className="rounded-lg border border-[color:var(--ds-border)] bg-[color:var(--ds-surface-2)] p-3"
            >
              <div className="flex items-start gap-2">
                <Clock
                  size={12}
                  className="mt-1 shrink-0 text-[color:var(--ds-text-subtle)]"
                  aria-hidden="true"
                />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <h4 className="text-sm font-medium text-[color:var(--ds-text)]">
                      {entry.title}
                    </h4>
                    <span className="text-xs text-[color:var(--ds-text-subtle)]">
                      {new Date(entry.occurred_at).toLocaleDateString("de-DE")}
                    </span>
                  </div>
                  {entry.agenda && (
                    <p className="mt-1 text-xs whitespace-pre-wrap text-[color:var(--ds-text-muted)]">
                      <strong>{t("mattertab.client_meeting_agenda")}:</strong>
                      {"\n"}
                      {entry.agenda}
                    </p>
                  )}
                  {entry.notes && (
                    <p className="mt-1 text-xs whitespace-pre-wrap text-[color:var(--ds-text-muted)]">
                      <strong>{t("mattertab.client_meeting_notes")}:</strong>
                      {"\n"}
                      {entry.notes}
                    </p>
                  )}
                  {entry.actions && (
                    <p className="mt-1 text-xs whitespace-pre-wrap text-[color:var(--ds-text-muted)]">
                      <strong>{t("mattertab.client_meeting_actions")}:</strong>
                      {"\n"}
                      {entry.actions}
                    </p>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => deleteMeeting(entry)}
                  aria-label={t("common.delete")}
                  className="rounded p-1 text-[color:var(--ds-text-subtle)] hover:text-[color:var(--ds-danger-text)]"
                >
                  <Trash2 size={14} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
