"use client";

import { useState, useCallback, useEffect } from "react";
import { Loader2, Plus, Pin, PinOff, Trash2, StickyNote } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useLang } from "@/lib/use-lang";
import { useMatterDetail } from "@/lib/matter-detail-context";
import { useToast } from "@/components/ui/toast";
import { api } from "@/lib/api";
import { useMe } from "@/lib/queries/auth";
import type { BrainPage } from "@/lib/types";
import { cn } from "@/lib/utils";

interface NoteItem {
  slug: string;
  title: string;
  content: string;
  author: string;
  created_at: string;
  pinned: boolean;
}

export function NotesTab() {
  const { t } = useLang();
  const ctx = useMatterDetail();
  const { addToast } = useToast();
  const { data: me } = useMe();
  const [notes, setNotes] = useState<NoteItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [saving, setSaving] = useState(false);
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");

  const caseSlug = ctx.caseData?.slug ?? "";

  const load = useCallback(async () => {
    if (!caseSlug) return;
    try {
      const pages = await api.brain.listPages({ type: "legal_note", limit: 500 });
      const filtered = pages.filter((p) => p.frontmatter?.case_slug === caseSlug);
      const mapped: NoteItem[] = filtered.map((p: BrainPage) => ({
        slug: p.slug,
        title: p.title,
        content: String(p.content ?? ""),
        author: String(p.frontmatter?.author ?? ""),
        created_at: String(p.frontmatter?.created_at ?? ""),
        pinned: Boolean(p.frontmatter?.pinned),
      }));
      mapped.sort((a, b) => {
        if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
        return b.created_at.localeCompare(a.created_at);
      });
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
    if (!title.trim() || !content.trim()) return;
    setSaving(true);
    try {
      const slug = `legal/notes/${Date.now().toString(36)}`;
      await api.brain.createPage({
        slug,
        title: title.trim(),
        type: "legal_note",
        content: content.trim(),
        frontmatter: {
          case_slug: caseSlug,
          author: me?.user?.name ?? "",
          created_at: new Date().toISOString(),
          pinned: false,
        },
      });
      addToast({ type: "success", title: t("mattertab.notes_created") });
      setTitle("");
      setContent("");
      setShowCreate(false);
      void load();
    } catch {
      addToast({ type: "error", title: t("common.error") });
    } finally {
      setSaving(false);
    }
  }

  async function togglePin(note: NoteItem) {
    try {
      await api.brain.updatePage({
        slug: note.slug,
        frontmatter: { pinned: !note.pinned },
      });
      void load();
    } catch {
      addToast({ type: "error", title: t("common.error") });
    }
  }

  async function deleteNote(note: NoteItem) {
    try {
      await api.brain.deletePage(note.slug);
      addToast({ type: "success", title: t("mattertab.notes_deleted") });
      void load();
    } catch {
      addToast({ type: "error", title: t("common.error") });
    }
  }

  if (loading) {
    return (
      <div className="flex justify-center py-20" role="status" aria-live="polite">
        <Loader2 size={24} className="animate-spin text-[color:var(--ds-text-muted)]" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-[color:var(--ds-text)]">
          {t("mattertab.notes_title")}
        </h2>
        <Button size="sm" variant="outline" onClick={() => setShowCreate(!showCreate)}>
          <Plus size={14} aria-hidden="true" /> {t("mattertab.notes_add")}
        </Button>
      </div>

      {showCreate && (
        <form
          className="space-y-3 rounded-xl border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] p-4"
          onSubmit={handleCreate}
        >
          <div className="space-y-1">
            <Label className="text-xs text-[color:var(--ds-text-muted)]">
              {t("mattertab.notes_title_label")}
            </Label>
            <Input value={title} onChange={(e) => setTitle(e.target.value)} required />
          </div>
          <div className="space-y-1">
            <Label className="text-xs text-[color:var(--ds-text-muted)]">
              {t("mattertab.notes_content_label")}
            </Label>
            <Textarea
              value={content}
              onChange={(e) => setContent(e.target.value)}
              rows={6}
              required
            />
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
          <StickyNote
            size={32}
            className="mb-3 text-[color:var(--ds-text-subtle)]"
            aria-hidden="true"
          />
          <p className="text-sm font-medium text-[color:var(--ds-text-muted)]">
            {t("mattertab.notes_empty")}
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {notes.map((note) => (
            <div
              key={note.slug}
              className={cn(
                "rounded-xl border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] p-4",
                note.pinned && "border-[color:var(--brand-primary)]/30"
              )}
            >
              <div className="flex items-start gap-2">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    {note.pinned && (
                      <Pin
                        size={12}
                        className="text-[color:var(--brand-primary)]"
                        aria-hidden="true"
                      />
                    )}
                    <h3 className="text-sm font-medium text-[color:var(--ds-text)]">
                      {note.title}
                    </h3>
                  </div>
                  {note.author && (
                    <p className="mt-0.5 text-xs text-[color:var(--ds-text-subtle)]">
                      {note.author} · {new Date(note.created_at).toLocaleDateString("de-DE")}
                    </p>
                  )}
                  <p className="mt-2 text-sm whitespace-pre-wrap text-[color:var(--ds-text-muted)]">
                    {note.content}
                  </p>
                </div>
                <div className="flex shrink-0 gap-1">
                  <button
                    type="button"
                    onClick={() => togglePin(note)}
                    aria-label={note.pinned ? t("mattertab.notes_unpin") : t("mattertab.notes_pin")}
                    className="rounded-md p-1.5 text-[color:var(--ds-text-subtle)] hover:bg-[color:var(--ds-hover)] hover:text-[color:var(--ds-text)]"
                  >
                    {note.pinned ? <PinOff size={14} /> : <Pin size={14} />}
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
