"use client";

import { useState, useEffect, useCallback } from "react";
import { Brain, Plus, Pin, PinOff, Trash2, Loader2, Sparkles, Edit3, Save, X } from "lucide-react";
import { useLang } from "@/lib/use-lang";
import { csrfFetch } from "@/lib/csrf";
import { cn } from "@/lib/utils";

interface CopilotMemoryEntry {
  id: string;
  type: "preference" | "fact" | "topic" | "instruction" | "case_note";
  key: string;
  value: string;
  source: "user_explicit" | "inferred" | "system";
  caseSlug?: string;
  createdAt: string;
  updatedAt: string;
  pinned: boolean;
  timesReferenced: number;
}

const TYPE_LABELS_DE: Record<string, string> = {
  preference: "Präferenz",
  fact: "Fakt",
  topic: "Thema",
  instruction: "Anweisung",
  case_note: "Aktennotiz",
};

const TYPE_LABELS_EN: Record<string, string> = {
  preference: "Preference",
  fact: "Fact",
  topic: "Topic",
  instruction: "Instruction",
  case_note: "Case Note",
};

const TYPE_COLORS: Record<string, string> = {
  preference: "bg-purple-500/10 text-purple-600 border-purple-500/20",
  fact: "bg-blue-500/10 text-blue-600 border-blue-500/20",
  topic: "bg-emerald-500/10 text-emerald-600 border-emerald-500/20",
  instruction: "bg-amber-500/10 text-amber-600 border-amber-500/20",
  case_note: "bg-cyan-500/10 text-cyan-600 border-cyan-500/20",
};

export function CopilotMemoryPanel() {
  const { lang } = useLang();
  const isEn = lang === "en";
  const [memories, setMemories] = useState<CopilotMemoryEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState("");
  const [newType, setNewType] = useState<CopilotMemoryEntry["type"]>("preference");
  const [newKey, setNewKey] = useState("");
  const [newValue, setNewValue] = useState("");
  const [saving, setSaving] = useState(false);

  const fetchMemories = useCallback(async () => {
    try {
      const res = await fetch("/api/copilot/memory");
      if (!res.ok) return;
      const data = await res.json();
      setMemories(data.memories ?? []);
    } catch {
      // Non-blocking
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchMemories();
  }, [fetchMemories]);

  const addMemory = async () => {
    if (!newKey.trim() || !newValue.trim()) return;
    setSaving(true);
    try {
      const res = await csrfFetch("/api/copilot/memory", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "create",
          type: newType,
          key: newKey.trim(),
          value: newValue.trim(),
        }),
      });
      if (res.ok) {
        setShowAdd(false);
        setNewKey("");
        setNewValue("");
        await fetchMemories();
      }
    } catch {
      // Non-blocking
    } finally {
      setSaving(false);
    }
  };

  const togglePin = async (id: string, pinned: boolean) => {
    try {
      await csrfFetch("/api/copilot/memory", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, pinned: !pinned }),
      });
      setMemories((prev) => prev.map((m) => (m.id === id ? { ...m, pinned: !pinned } : m)));
    } catch {
      // Non-blocking
    }
  };

  const deleteMemory = async (id: string) => {
    try {
      await csrfFetch("/api/copilot/memory", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      });
      setMemories((prev) => prev.filter((m) => m.id !== id));
    } catch {
      // Non-blocking
    }
  };

  const saveEdit = async (id: string) => {
    if (!editValue.trim()) return;
    try {
      await csrfFetch("/api/copilot/memory", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, value: editValue.trim() }),
      });
      setMemories((prev) => prev.map((m) => (m.id === id ? { ...m, value: editValue.trim() } : m)));
      setEditingId(null);
    } catch {
      // Non-blocking
    }
  };

  if (loading) {
    return (
      <div
        className="flex items-center gap-2 px-3 py-2 text-xs text-[color:var(--ds-text-muted)]"
        role="status"
        aria-live="polite"
      >
        <Loader2 size={12} className="animate-spin" />
        {isEn ? "Loading memory..." : "Gedächtnis laden..."}
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Brain size={14} className="text-[color:var(--ds-text-muted)]" />
          <span className="text-xs font-semibold text-[color:var(--ds-text)]">
            {isEn ? "Copilot Memory" : "Copilot-Gedächtnis"}
          </span>
          {memories.length > 0 && (
            <span className="text-[10px] text-[color:var(--ds-text-muted)]">
              {memories.length} {isEn ? "entries" : "Einträge"}
            </span>
          )}
        </div>
        <button
          onClick={() => setShowAdd((v) => !v)}
          className="flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[10px] text-[color:var(--ds-text-muted)] transition-colors hover:text-[color:var(--ds-text)]"
          title={isEn ? "Add memory" : "Gedächtnis hinzufügen"}
        >
          <Plus size={10} />
          {isEn ? "Add" : "Hinzufügen"}
        </button>
      </div>

      {showAdd && (
        <div className="space-y-1.5 rounded-lg border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] p-2.5">
          <select
            value={newType}
            onChange={(e) => setNewType(e.target.value as CopilotMemoryEntry["type"])}
            className="w-full rounded-md border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] px-2 py-1 text-xs text-[color:var(--ds-text)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-primary)] focus-visible:ring-offset-1"
          >
            {Object.entries(isEn ? TYPE_LABELS_EN : TYPE_LABELS_DE).map(([key, label]) => (
              <option key={key} value={key}>
                {label}
              </option>
            ))}
          </select>
          <input
            type="text"
            value={newKey}
            onChange={(e) => setNewKey(e.target.value)}
            placeholder={
              isEn ? "Key (e.g., 'preferred_language')" : "Schlüssel (z.B. 'bevorzugte_sprache')"
            }
            className="w-full rounded-md border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] px-2 py-1 text-xs focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-primary)] focus-visible:ring-offset-1"
          />
          <textarea
            value={newValue}
            onChange={(e) => setNewValue(e.target.value)}
            placeholder={isEn ? "Value..." : "Wert..."}
            rows={2}
            className="w-full resize-none rounded-md border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] px-2 py-1 text-xs focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-primary)] focus-visible:ring-offset-1"
          />
          <div className="flex items-center justify-end gap-1.5">
            <button
              onClick={() => setShowAdd(false)}
              className="rounded-md px-2 py-1 text-[10px] text-[color:var(--ds-text-muted)] hover:text-[color:var(--ds-text)]"
            >
              {isEn ? "Cancel" : "Abbrechen"}
            </button>
            <button
              onClick={addMemory}
              disabled={saving || !newKey.trim() || !newValue.trim()}
              className="flex items-center gap-1 rounded-md bg-[color:var(--brand-primary)] px-2 py-1 text-[10px] font-medium text-white disabled:opacity-50"
            >
              {saving ? <Loader2 size={10} className="animate-spin" /> : <Save size={10} />}
              {isEn ? "Save" : "Speichern"}
            </button>
          </div>
        </div>
      )}

      {memories.length === 0 && !showAdd ? (
        <div className="flex items-center gap-2 rounded-lg border border-dashed border-[color:var(--ds-border)] px-3 py-3">
          <Sparkles size={14} className="text-[color:var(--ds-text-muted)]" />
          <span className="text-xs text-[color:var(--ds-text-muted)]">
            {isEn
              ? "No memories yet. The Copilot will learn your preferences over time."
              : "Noch keine Erinnerungen. Der Copilot lernt Ihre Präferenzen mit der Zeit."}
          </span>
        </div>
      ) : (
        <div className="max-h-64 space-y-1 overflow-y-auto">
          {memories.map((m) => {
            const isEditing = editingId === m.id;
            return (
              <div
                key={m.id}
                className={cn(
                  "group rounded-lg border p-2 transition-colors",
                  m.pinned
                    ? "border-[color:var(--brand-primary)]/30 bg-[color:var(--brand-primary)]/5"
                    : "border-[color:var(--ds-border)] bg-[color:var(--ds-surface)]"
                )}
              >
                <div className="flex items-start gap-1.5">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      <span
                        className={cn(
                          "shrink-0 rounded border px-1 py-0.5 text-[9px] font-medium",
                          TYPE_COLORS[m.type] ?? TYPE_COLORS.fact
                        )}
                      >
                        {isEn ? TYPE_LABELS_EN[m.type] : TYPE_LABELS_DE[m.type]}
                      </span>
                      <span className="truncate text-[11px] font-medium text-[color:var(--ds-text)]">
                        {m.key}
                      </span>
                      {m.source === "inferred" && (
                        <Sparkles
                          size={9}
                          className="shrink-0 text-[color:var(--ds-text-subtle)]"
                        />
                      )}
                    </div>
                    {isEditing ? (
                      <div className="mt-1 flex items-start gap-1">
                        <textarea
                          value={editValue}
                          onChange={(e) => setEditValue(e.target.value)}
                          rows={2}
                          className="min-w-0 flex-1 resize-none rounded border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] px-1.5 py-1 text-[11px] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-primary)] focus-visible:ring-offset-1"
                        />
                        <button
                          onClick={() => saveEdit(m.id)}
                          className="shrink-0 rounded p-0.5 text-emerald-600 hover:bg-emerald-500/10"
                        >
                          <Save size={10} />
                        </button>
                        <button
                          onClick={() => setEditingId(null)}
                          className="shrink-0 rounded p-0.5 text-[color:var(--ds-text-muted)] hover:bg-[color:var(--ds-hover)]"
                        >
                          <X size={10} />
                        </button>
                      </div>
                    ) : (
                      <p className="mt-0.5 text-[11px] text-[color:var(--ds-text-muted)]">
                        {m.value}
                      </p>
                    )}
                  </div>
                  <div className="flex shrink-0 items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100">
                    <button
                      onClick={() => togglePin(m.id, m.pinned)}
                      className={cn(
                        "rounded p-0.5 hover:bg-[color:var(--ds-hover)]",
                        m.pinned
                          ? "text-[color:var(--brand-primary)]"
                          : "text-[color:var(--ds-text-subtle)]"
                      )}
                      title={isEn ? "Pin" : "Anheften"}
                    >
                      {m.pinned ? <Pin size={10} /> : <PinOff size={10} />}
                    </button>
                    <button
                      onClick={() => {
                        setEditingId(m.id);
                        setEditValue(m.value);
                      }}
                      className="rounded p-0.5 text-[color:var(--ds-text-subtle)] hover:bg-[color:var(--ds-hover)] hover:text-[color:var(--ds-text)]"
                      title={isEn ? "Edit" : "Bearbeiten"}
                    >
                      <Edit3 size={10} />
                    </button>
                    <button
                      onClick={() => deleteMemory(m.id)}
                      className="rounded p-0.5 text-[color:var(--ds-text-subtle)] hover:bg-red-500/10 hover:text-red-600"
                      title={isEn ? "Delete" : "Löschen"}
                    >
                      <Trash2 size={10} />
                    </button>
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
