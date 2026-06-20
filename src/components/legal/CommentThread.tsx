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

export default function CommentThread({ parentSlug, parentType, currentUserId, currentUserName }: CommentThreadProps) {
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
    <div className="rounded-xl border [border-color:var(--mk-border)] [background:var(--mk-surface)] p-4 space-y-3">
      <div className="flex items-center gap-2">
        <MessageSquare size={14} className="brand-text" />
        <h4 className="text-xs font-semibold [color:var(--mk-text)] uppercase tracking-wider">Kommentare</h4>
        <span className="text-[10px] text-[#8a8aa8]">({comments.length})</span>
      </div>

      {loading ? (
        <div className="text-xs text-[#8a8aa8] py-2">Lade…</div>
      ) : comments.length === 0 ? (
        <div className="text-xs text-[#8a8aa8] py-2">Noch keine Kommentare.</div>
      ) : (
        <div className="space-y-2 max-h-60 overflow-y-auto pr-1">
          {comments.map((c) => (
            <div key={c.id} className="flex gap-2 p-2 rounded-lg [background:var(--mk-bg)] border [border-color:var(--mk-border)]">
              <div className="w-6 h-6 rounded-full brand-soft flex items-center justify-center shrink-0">
                <User size={12} className="brand-text" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-medium [color:var(--mk-text)]">{c.authorName}</span>
                  <span className="text-[10px] text-[#8a8aa8]">
                    {new Date(c.createdAt).toLocaleString("de-DE", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}
                  </span>
                </div>
                <p className="text-xs [color:var(--mk-text-muted)] mt-0.5 whitespace-pre-wrap">{c.content}</p>
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
          className="flex-1 [background:var(--mk-bg)] border [border-color:var(--mk-border)] rounded-lg px-3 py-2 text-xs [color:var(--mk-text)] placeholder:text-[#8a8aa8] focus:outline-none focus:border-[color:var(--brand-primary)]"
        />
        <button
          onClick={submit}
          disabled={sending || !newText.trim()}
          className="px-3 py-2 rounded-lg brand-bg text-white text-xs font-medium brand-bg disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1"
        >
          <Send size={12} />
        </button>
      </div>
    </div>
  );
}
