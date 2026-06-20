"use client";

import { useState, useEffect } from "react";
import { MessageSquare, Send, User } from "lucide-react";
import type { Comment } from "@/lib/comments";

interface CommentThreadProps {
  parentSlug: string;
  parentType: string;
  currentUserId: string;
  currentUserName: string;
}

export default function CommentThread({
  parentSlug,
  parentType,
  currentUserId,
  currentUserName,
}: CommentThreadProps) {
  const [comments, setComments] = useState<Comment[]>([]);
  const [newText, setNewText] = useState("");
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch(`/api/comments?parentSlug=${encodeURIComponent(parentSlug)}`);
        if (res.ok) {
          const data = await res.json();
          setComments(data.comments ?? []);
        }
      } catch {}
      setLoading(false);
    }
    load();
  }, [parentSlug]);

  async function submit() {
    if (!newText.trim()) return;
    setSending(true);
    try {
      const res = await fetch("/api/comments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          parent_slug: parentSlug,
          content: newText.trim(),
        }),
      });
      if (res.ok) {
        const data = await res.json();
        setComments((prev) => [...prev, data.comment]);
        setNewText("");
      }
    } catch {}
    setSending(false);
  }

  return (
    <div className="space-y-3 rounded-xl border [border-color:var(--mk-border)] p-4 [background:var(--mk-surface)]">
      <div className="flex items-center gap-2">
        <MessageSquare size={14} className="brand-text" />
        <h4 className="text-xs font-semibold tracking-wider [color:var(--mk-text)] uppercase">
          Kommentare
        </h4>
        <span className="text-xs text-[color:var(--mk-text-subtle)]">({comments.length})</span>
      </div>

      {loading ? (
        <div className="py-2 text-xs text-[color:var(--mk-text-subtle)]">Lade…</div>
      ) : comments.length === 0 ? (
        <div className="py-2 text-xs text-[color:var(--mk-text-subtle)]">
          Noch keine Kommentare.
        </div>
      ) : (
        <div className="max-h-60 space-y-2 overflow-y-auto pr-1">
          {comments.map((c) => (
            <div
              key={c.id}
              className="flex gap-2 rounded-lg border [border-color:var(--mk-border)] p-2 [background:var(--mk-bg)]"
            >
              <div className="brand-soft flex h-6 w-6 shrink-0 items-center justify-center rounded-full">
                <User size={12} className="brand-text" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-medium [color:var(--mk-text)]">{c.authorName}</span>
                  <span className="text-xs text-[color:var(--mk-text-subtle)]">
                    {new Date(c.createdAt).toLocaleString("de-DE", {
                      day: "2-digit",
                      month: "2-digit",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </span>
                </div>
                <p className="mt-0.5 text-xs whitespace-pre-wrap [color:var(--mk-text-muted)]">
                  {c.content}
                </p>
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="flex gap-2">
        <input
          type="text"
          value={newText}
          onChange={(e) => setNewText(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && submit()}
          placeholder="Kommentar hinzufügen…"
          className="flex-1 rounded-lg border [border-color:var(--mk-border)] px-3 py-2 text-xs [color:var(--mk-text)] [background:var(--mk-bg)] placeholder:text-[color:var(--mk-text-subtle)] focus:border-[color:var(--brand-primary)] focus:outline-none"
        />
        <button
          onClick={submit}
          disabled={sending || !newText.trim()}
          className="brand-bg brand-bg flex items-center gap-1 rounded-lg px-3 py-2 text-xs font-medium text-white disabled:cursor-not-allowed disabled:opacity-50"
        >
          <Send size={12} />
        </button>
      </div>
    </div>
  );
}
