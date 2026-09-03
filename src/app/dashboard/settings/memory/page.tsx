"use client";

import { useEffect, useState, useCallback } from "react";
import {
  Brain,
  Pin,
  PinOff,
  Trash2,
  Search,
  Plus,
  Loader2,
  RefreshCw,
  Tag,
  Clock,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { api } from "@/lib/api";
import { PageHeader } from "@/components/dashboard/page-header";
import { useToast } from "@/components/ui/toast";
import { useLang } from "@/lib/use-lang";

interface MemoryEntry {
  id: string;
  type: string;
  key: string;
  value: string;
  source: string;
  pinned: boolean;
  caseSlug?: string;
  entities?: string[];
  supersededBy?: string;
  validFrom?: string;
  validTo?: string;
  createdAt: string;
  updatedAt: string;
}

const TYPE_KEYS: Record<string, string> = {
  preference: "memory.type_preference",
  fact: "memory.type_fact",
  topic: "memory.type_topic",
  instruction: "memory.type_instruction",
  case_note: "memory.type_case_note",
};

const SOURCE_KEYS: Record<string, string> = {
  user_explicit: "memory.source_manual",
  inferred: "memory.source_inferred",
  system: "memory.source_agent",
};

export default function MemoryManagementPage() {
  const { addToast } = useToast();
  const { t } = useLang();
  const [memories, setMemories] = useState<MemoryEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<MemoryEntry[] | null>(null);
  const [searching, setSearching] = useState(false);
  const [filterType, setFilterType] = useState<string>("all");
  const [showSuperseded, setShowSuperseded] = useState(false);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [newMemory, setNewMemory] = useState({ type: "preference", key: "", value: "" });

  const loadMemories = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.memory.list();
      setMemories(res.memories);
    } catch {
      addToast({ title: t("memory.err_load"), type: "error" });
    } finally {
      setLoading(false);
    }
  }, [addToast, t]);

  useEffect(() => {
    loadMemories();
  }, [loadMemories]);

  const handleSearch = useCallback(async () => {
    if (!searchQuery.trim()) {
      setSearchResults(null);
      return;
    }
    setSearching(true);
    try {
      const res = await api.memory.search(searchQuery);
      setSearchResults(res.results as MemoryEntry[]);
    } catch {
      addToast({ title: t("memory.err_search"), type: "error" });
    } finally {
      setSearching(false);
    }
  }, [searchQuery, addToast, t]);

  const handlePin = useCallback(
    async (id: string, pinned: boolean) => {
      try {
        await api.memory.update(id, { pinned: !pinned });
        setMemories((m) => m.map((mem) => (mem.id === id ? { ...mem, pinned: !pinned } : mem)));
        addToast({ title: !pinned ? t("memory.pinned") : t("memory.unpinned"), type: "success" });
      } catch {
        addToast({ title: t("memory.err_pin"), type: "error" });
      }
    },
    [addToast, t]
  );

  const handleDelete = useCallback(
    async (id: string) => {
      try {
        await api.memory.delete(id);
        setMemories((m) => m.filter((mem) => mem.id !== id));
        addToast({ title: t("memory.deleted"), type: "success" });
      } catch {
        addToast({ title: t("memory.err_delete"), type: "error" });
      }
    },
    [addToast, t]
  );

  const handleCreate = useCallback(async () => {
    if (!newMemory.key.trim() || !newMemory.value.trim()) return;
    try {
      await api.memory.create({
        type: newMemory.type,
        key: newMemory.key,
        value: newMemory.value,
        source: "user_explicit",
      });
      setNewMemory({ type: "preference", key: "", value: "" });
      setShowCreateForm(false);
      await loadMemories();
      addToast({ title: t("memory.saved"), type: "success" });
    } catch {
      addToast({ title: t("memory.err_save"), type: "error" });
    }
  }, [newMemory, addToast, loadMemories, t]);

  const displayMemories = searchResults ?? memories;
  const filtered = displayMemories.filter((m) => {
    if (!showSuperseded && m.supersededBy) return false;
    if (filterType !== "all" && m.type !== filterType) return false;
    return true;
  });

  const stats = {
    total: memories.length,
    pinned: memories.filter((m) => m.pinned).length,
    superseded: memories.filter((m) => m.supersededBy).length,
    inferred: memories.filter((m) => m.source === "inferred").length,
    agent: memories.filter((m) => m.source === "system").length,
  };

  return (
    <div className="mx-auto max-w-[1200px] space-y-6 p-4 md:p-6 lg:p-8">
      <PageHeader
        title={t("memory.page_title")}
        description={t("memory.desc")}
        breadcrumbs={[
          { label: t("breadcrumb.dashboard"), href: "/dashboard" },
          { label: t("settings.title" as never), href: "/dashboard/settings" },
          { label: t("memory.breadcrumb_memory") },
        ]}
        actions={
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={loadMemories} disabled={loading}>
              <RefreshCw className={cn("h-4 w-4", loading && "animate-spin")} />
              {t("memory.refresh")}
            </Button>
            <Button size="sm" onClick={() => setShowCreateForm(!showCreateForm)}>
              <Plus className="h-4 w-4" />
              {t("memory.new_btn")}
            </Button>
          </div>
        }
      />

      <div className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-5">
        <Card className="p-4">
          <div className="text-2xl font-bold">{stats.total}</div>
          <div className="text-xs text-[color:var(--ds-text-subtle)]">{t("memory.stat_total")}</div>
        </Card>
        <Card className="p-4">
          <div className="text-2xl font-bold text-[color:var(--ds-accent-text)]">
            {stats.pinned}
          </div>
          <div className="text-xs text-[color:var(--ds-text-subtle)]">
            {t("memory.stat_pinned")}
          </div>
        </Card>
        <Card className="p-4">
          <div className="text-2xl font-bold text-[color:var(--ds-success-text)]">
            {stats.inferred}
          </div>
          <div className="text-xs text-[color:var(--ds-text-subtle)]">
            {t("memory.stat_inferred")}
          </div>
        </Card>
        <Card className="p-4">
          <div className="text-2xl font-bold text-[color:var(--ds-warning-text)]">
            {stats.agent}
          </div>
          <div className="text-xs text-[color:var(--ds-text-subtle)]">{t("memory.stat_agent")}</div>
        </Card>
        <Card className="p-4">
          <div className="text-2xl font-bold text-[color:var(--ds-text-muted)]">
            {stats.superseded}
          </div>
          <div className="text-xs text-[color:var(--ds-text-subtle)]">
            {t("memory.stat_superseded")}
          </div>
        </Card>
      </div>

      {showCreateForm && (
        <Card className="mb-6 p-4">
          <h3 className="mb-3 text-sm font-semibold">{t("memory.new_title")}</h3>
          <div className="grid gap-3 md:grid-cols-3">
            <div>
              <label className="mb-1 block text-xs text-[color:var(--ds-text-subtle)]">
                {t("memory.type_label")}
              </label>
              <select
                className="w-full rounded-md border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] px-3 py-2 text-sm"
                value={newMemory.type}
                onChange={(e) => setNewMemory((m) => ({ ...m, type: e.target.value }))}
              >
                <option value="preference">{t("memory.type_preference")}</option>
                <option value="fact">{t("memory.type_fact")}</option>
                <option value="topic">{t("memory.type_topic")}</option>
                <option value="instruction">{t("memory.type_instruction")}</option>
                <option value="case_note">{t("memory.type_case_note")}</option>
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs text-[color:var(--ds-text-subtle)]">
                {t("memory.key_label")}
              </label>
              <Input
                placeholder={t("memory.key_placeholder")}
                value={newMemory.key}
                onChange={(e) => setNewMemory((m) => ({ ...m, key: e.target.value }))}
              />
            </div>
            <div>
              <label className="mb-1 block text-xs text-[color:var(--ds-text-subtle)]">
                {t("memory.value_label")}
              </label>
              <Input
                placeholder={t("memory.value_placeholder")}
                value={newMemory.value}
                onChange={(e) => setNewMemory((m) => ({ ...m, value: e.target.value }))}
              />
            </div>
          </div>
          <div className="mt-3 flex justify-end gap-2">
            <Button variant="outline" size="sm" onClick={() => setShowCreateForm(false)}>
              {t("memory.cancel")}
            </Button>
            <Button
              size="sm"
              onClick={handleCreate}
              disabled={!newMemory.key.trim() || !newMemory.value.trim()}
            >
              {t("memory.save_btn")}
            </Button>
          </div>
        </Card>
      )}

      <div className="mb-4 flex gap-2">
        <div className="relative flex-1">
          <Search className="absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-[color:var(--ds-text-subtle)]" />
          <Input
            placeholder={t("memory.search_placeholder")}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleSearch()}
            className="pl-9"
          />
        </div>
        <Button onClick={handleSearch} disabled={searching || !searchQuery.trim()}>
          {searching ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Search className="h-4 w-4" />
          )}
          Suchen
        </Button>
        {searchResults && (
          <Button
            variant="outline"
            onClick={() => {
              setSearchResults(null);
              setSearchQuery("");
            }}
          >
            Zurücksetzen
          </Button>
        )}
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-2">
        {["all", "preference", "fact", "topic", "instruction", "case_note"].map((type) => (
          <button
            key={type}
            onClick={() => setFilterType(type)}
            className={cn(
              "rounded-full px-3 py-1 text-xs font-medium transition-colors",
              filterType === type
                ? "bg-[color:var(--brand-primary)] text-white"
                : "bg-[color:var(--ds-hover)] text-[color:var(--ds-text-subtle)] hover:text-[color:var(--ds-text)]"
            )}
          >
            {type === "all"
              ? t("memory.type_all")
              : TYPE_KEYS[type]
                ? t(TYPE_KEYS[type] as never)
                : type}
          </button>
        ))}
        <label className="ml-auto flex items-center gap-2 text-xs text-[color:var(--ds-text-subtle)]">
          <input
            type="checkbox"
            checked={showSuperseded}
            onChange={(e) => setShowSuperseded(e.target.checked)}
            className="rounded"
          />
          {t("memory.show_superseded")}
        </label>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-12" role="status" aria-live="polite">
          <Loader2 className="h-6 w-6 animate-spin text-[color:var(--ds-text-subtle)]" />
        </div>
      ) : filtered.length === 0 ? (
        <Card className="p-8 text-center">
          <Brain className="mx-auto mb-3 h-8 w-8 text-[color:var(--ds-text-subtle)]" />
          <p className="text-sm text-[color:var(--ds-text-subtle)]">
            {searchResults ? "Keine Suchergebnisse" : "Noch keine Erinnerungen gespeichert"}
          </p>
          {!searchResults && (
            <p className="mt-1 text-xs text-[color:var(--ds-text-muted)]">
              Der Copilot lernt automatisch aus Ihren Nachrichten
            </p>
          )}
        </Card>
      ) : (
        <div className="space-y-2">
          {filtered.map((memory) => (
            <Card
              key={memory.id}
              className={cn(
                "flex items-start gap-3 p-4 transition-colors hover:bg-[color:var(--ds-hover)]",
                memory.supersededBy && "opacity-50"
              )}
            >
              <button
                onClick={() => handlePin(memory.id, memory.pinned)}
                className="mt-0.5 shrink-0 text-[color:var(--ds-text-subtle)] hover:text-[color:var(--ds-accent-text)]"
                title={memory.pinned ? "Loslösen" : "Anpinnen"}
                aria-label={memory.pinned ? "Loslösen" : "Anpinnen"}
              >
                {memory.pinned ? (
                  <Pin className="h-4 w-4 fill-current text-[color:var(--ds-accent-text)]" />
                ) : (
                  <PinOff className="h-4 w-4" />
                )}
              </button>

              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant="default" className="shrink-0 text-[10px]">
                    {TYPE_KEYS[memory.type] ? t(TYPE_KEYS[memory.type] as never) : memory.type}
                  </Badge>
                  <span className="text-xs text-[color:var(--ds-text-muted)]">
                    {SOURCE_KEYS[memory.source]
                      ? t(SOURCE_KEYS[memory.source] as never)
                      : memory.source}
                  </span>
                  {memory.supersededBy && (
                    <Badge variant="default" className="shrink-0 text-[10px] opacity-60">
                      {t("memory.superseded")}
                    </Badge>
                  )}
                  {memory.caseSlug && (
                    <Badge variant="default" className="shrink-0 text-[10px]">
                      {t("memory.case_label")} {memory.caseSlug}
                    </Badge>
                  )}
                </div>

                <div className="mt-1 text-sm font-medium">{memory.key}</div>
                <div className="text-sm text-[color:var(--ds-text-subtle)]">{memory.value}</div>

                {memory.entities && memory.entities.length > 0 && (
                  <div className="mt-1.5 flex flex-wrap gap-1">
                    {memory.entities.map((entity) => (
                      <span
                        key={entity}
                        className="inline-flex items-center gap-1 rounded-full bg-[color:var(--ds-hover)] px-2 py-0.5 text-[10px] text-[color:var(--ds-text-subtle)]"
                      >
                        <Tag className="h-2.5 w-2.5" />
                        {entity}
                      </span>
                    ))}
                  </div>
                )}

                {(memory.validFrom || memory.validTo) && (
                  <div className="mt-1 flex items-center gap-1 text-[10px] text-[color:var(--ds-text-muted)]">
                    <Clock className="h-2.5 w-2.5" />
                    {memory.validFrom &&
                      `ab ${new Date(memory.validFrom).toLocaleDateString("de-DE")}`}
                    {memory.validFrom && memory.validTo && " — "}
                    {memory.validTo &&
                      `bis ${new Date(memory.validTo).toLocaleDateString("de-DE")}`}
                  </div>
                )}

                <div className="mt-1 text-[10px] text-[color:var(--ds-text-muted)]">
                  {new Date(memory.updatedAt).toLocaleString("de-DE")}
                </div>
              </div>

              <button
                onClick={() => handleDelete(memory.id)}
                className="mt-0.5 shrink-0 text-[color:var(--ds-text-subtle)] hover:text-[color:var(--ds-danger-text)]"
                title={t("memory.delete")}
                aria-label={t("memory.delete")}
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
