"use client";

import { useState, useCallback, useEffect } from "react";
import { Loader2, Plus, Trash2, Phone, Clock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useLang } from "@/lib/use-lang";
import { useMatterDetail } from "@/lib/matter-detail-context";
import { useToast } from "@/components/ui/toast";
import { api } from "@/lib/api";
import type { BrainPage } from "@/lib/types";

interface PhoneNoteItem {
  slug: string;
  title: string;
  caller: string;
  content: string;
  results: string;
  follow_up: string;
  occurred_at: string;
}

export function PhoneNotesTab() {
  const { t } = useLang();
  const ctx = useMatterDetail();
  const { addToast } = useToast();
  const [notes, setNotes] = useState<PhoneNoteItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [saving, setSaving] = useState(false);
  const [caller, setCaller] = useState("");
  const [subject, setSubject] = useState("");
  const [notesText, setNotesText] = useState("");
  const [results, setResults] = useState("");
  const [followUp, setFollowUp] = useState("");

  const caseSlug = ctx.caseData?.slug ?? "";

  const load = useCallback(async () => {
    if (!caseSlug) return;
    try {
      const pages = await api.brain.listPages({ type: "legal_phone_note", limit: 500 });
      const filtered = pages.filter((p) => p.frontmatter?.case_slug === caseSlug);
      const mapped: PhoneNoteItem[] = filtered.map((p: BrainPage) => ({
        slug: p.slug,
        title: p.title,
        caller: String(p.frontmatter?.caller ?? ""),
        content: String(p.content ?? ""),
        results: String(p.frontmatter?.results ?? ""),
        follow_up: String(p.frontmatter?.follow_up ?? ""),
        occurred_at: String(p.frontmatter?.occurred_at ?? ""),
      }));
      mapped.sort((a, b) => b.occurred_at.localeCompare(a.occurred_at));
      setNotes(mapped);
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
    if (!caller.trim() || !subject.trim() || !notesText.trim()) return;
    setSaving(true);
    try {
      const slug = `legal/phone-notes/${Date.now().toString(36)}`;
      await api.brain.createPage({
        slug,
        title: subject.trim(),
        type: "legal_phone_note",
        content: notesText.trim(),
        frontmatter: {
          caller: caller.trim(),
          case_slug: caseSlug,
          occurred_at: new Date().toISOString(),
          results: results.trim(),
          follow_up: followUp.trim(),
        },
      });
      addToast({ type: "success", title: t("mattertab.phone_created") });
      setCaller("");
      setSubject("");
      setNotesText("");
      setResults("");
      setFollowUp("");
      setShowCreate(false);
      void load();
    } catch {
      addToast({ type: "error", title: t("common.error") });
    } finally {
      setSaving(false);
    }
  }

  async function deleteNote(note: PhoneNoteItem) {
    try {
      await api.brain.deletePage(note.slug);
      addToast({ type: "success", title: t("mattertab.phone_deleted") });
      void load();
    } catch {
      addToast({ type: "error", title: t("common.error") });
    }
  }

  async function trackTime(note: PhoneNoteItem) {
    try {
      const slug = `legal/time-entries/${Date.now().toString(36)}`;
      await api.brain.createPage({
        slug,
        title: t("mattertab.phone_time_title").replace("{caller}", note.caller),
        type: "legal_time_entry",
        content: note.content,
        frontmatter: {
          case_slug: caseSlug,
          activity_type: "phone",
          duration_minutes: 10,
          date: note.occurred_at.split("T")[0],
          description: t("mattertab.phone_time_desc").replace("{subject}", note.title),
          created_at: new Date().toISOString(),
        },
      });
      addToast({ type: "success", title: t("mattertab.phone_time_tracked") });
    } catch {
      addToast({ type: "error", title: t("common.error") });
    }
  }

  if (loading) {
    return (
      <div className="flex justify-center py-20">
        <Loader2 size={24} className="animate-spin text-[color:var(--ds-text-muted)]" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-[color:var(--ds-text)]">
          {t("mattertab.phone_title")}
        </h2>
        <Button size="sm" variant="outline" onClick={() => setShowCreate(!showCreate)}>
          <Plus size={14} aria-hidden="true" /> {t("mattertab.phone_add")}
        </Button>
      </div>

      {showCreate && (
        <form
          className="space-y-3 rounded-xl border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] p-4"
          onSubmit={handleCreate}
        >
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="space-y-1">
              <Label className="text-xs text-[color:var(--ds-text-muted)]">
                {t("mattertab.phone_caller")} *
              </Label>
              <Input value={caller} onChange={(e) => setCaller(e.target.value)} required />
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-[color:var(--ds-text-muted)]">
                {t("mattertab.phone_subject")} *
              </Label>
              <Input value={subject} onChange={(e) => setSubject(e.target.value)} required />
            </div>
          </div>
          <div className="space-y-1">
            <Label className="text-xs text-[color:var(--ds-text-muted)]">
              {t("mattertab.phone_notes_label")} *
            </Label>
            <Textarea
              value={notesText}
              onChange={(e) => setNotesText(e.target.value)}
              rows={5}
              required
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs text-[color:var(--ds-text-muted)]">
              {t("mattertab.phone_results")}
            </Label>
            <Textarea value={results} onChange={(e) => setResults(e.target.value)} rows={2} />
          </div>
          <div className="space-y-1">
            <Label className="text-xs text-[color:var(--ds-text-muted)]">
              {t("mattertab.phone_followup")}
            </Label>
            <Input value={followUp} onChange={(e) => setFollowUp(e.target.value)} />
          </div>
          <div className="flex gap-2">
            <Button type="submit" disabled={saving} className="brand-bg gap-2 text-white">
              {saving && <Loader2 size={14} className="animate-spin" />}
              {t("common.save")}
            </Button>
            <Button type="button" variant="outline" onClick={() => setShowCreate(false)}>
              {t("common.cancel")}
            </Button>
          </div>
        </form>
      )}

      {notes.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-[color:var(--ds-border)] py-16 text-center">
          <Phone size={32} className="mb-3 text-[color:var(--ds-text-subtle)]" aria-hidden="true" />
          <p className="text-sm font-medium text-[color:var(--ds-text-muted)]">
            {t("mattertab.phone_empty")}
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {notes.map((note) => (
            <div
              key={note.slug}
              className="rounded-xl border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] p-4"
            >
              <div className="flex items-start gap-2">
                <Phone
                  size={14}
                  className="mt-1 shrink-0 text-[color:var(--brand-primary)]"
                  aria-hidden="true"
                />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <h3 className="text-sm font-medium text-[color:var(--ds-text)]">
                      {note.title}
                    </h3>
                    <span className="text-xs text-[color:var(--ds-text-subtle)]">
                      {new Date(note.occurred_at).toLocaleString("de-DE", {
                        day: "2-digit",
                        month: "2-digit",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </span>
                  </div>
                  <p className="text-xs text-[color:var(--ds-text-subtle)]">{note.caller}</p>
                  <p className="mt-2 text-sm whitespace-pre-wrap text-[color:var(--ds-text-muted)]">
                    {note.content}
                  </p>
                  {note.results && (
                    <p className="mt-2 text-xs text-[color:var(--ds-text-muted)]">
                      <strong>{t("mattertab.phone_results")}:</strong> {note.results}
                    </p>
                  )}
                  {note.follow_up && (
                    <p className="mt-1 text-xs text-[color:var(--ds-text-muted)]">
                      <strong>{t("mattertab.phone_followup")}:</strong> {note.follow_up}
                    </p>
                  )}
                </div>
                <div className="flex shrink-0 gap-1">
                  <button
                    type="button"
                    onClick={() => trackTime(note)}
                    aria-label={t("mattertab.phone_track_time")}
                    title={t("mattertab.phone_track_time")}
                    className="rounded-md p-1.5 text-[color:var(--ds-text-subtle)] hover:bg-[color:var(--ds-hover)] hover:text-[color:var(--brand-primary)]"
                  >
                    <Clock size={14} />
                  </button>
                  <button
                    type="button"
                    onClick={() => deleteNote(note)}
                    aria-label={t("common.delete")}
                    className="rounded-md p-1.5 text-[color:var(--ds-text-subtle)] hover:bg-[color:var(--ds-hover)] hover:text-[color:var(--ds-danger-text)]"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
