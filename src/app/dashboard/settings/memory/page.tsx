"use client";

import { useEffect, useState, useCallback } from "react";
import { Brain, Pin, PinOff, Trash2, Search, Loader2, Tag, Clock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { cn, formatDate, formatDateTime } from "@/lib/utils";
import { Skeleton } from "@/components/ui/skeleton";
import { api } from "@/lib/api";
import { PageHeader } from "@/components/dashboard/page-header";
import { PrimaryAction } from "@/components/dashboard/primary-action";
import { useToast } from "@/components/ui/toast";
import { useLang } from "@/lib/use-lang";
import { EmptyState } from "@/components/dashboard/empty-state";

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
  ownerId?: string;
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

const SOURCE_LABELS: Record<string, { de: string; en: string }> = {
  user_explicit: { de: "Manuell angelegt", en: "Added manually" },
  inferred: { de: "Automatisch erkannt", en: "Detected automatically" },
  system: { de: "Vom Assistenten", en: "From the assistant" },
};

export default function MemoryManagementPage() {
  const { addToast } = useToast();
  const { t, lang } = useLang();
  const L = (de: string, en: string) => (lang === "en" ? en : de);
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
      if (
        !window.confirm(
          lang === "en"
            ? "Delete this memory? The assistant will no longer use it."
            : "Diese Erinnerung löschen? Der Assistent verwendet sie danach nicht mehr."
        )
      )
        return;
      try {
        await api.memory.delete(id);
        setMemories((m) => m.filter((mem) => mem.id !== id));
        addToast({ title: t("memory.deleted"), type: "success" });
      } catch {
        addToast({ title: t("memory.err_delete"), type: "error" });
      }
    },
    [addToast, t, lang]
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
    automatic: memories.filter((m) => m.source === "inferred" || m.source === "system").length,
  };
  const hasMemories = memories.length > 0;

  return (
    <div className="ds-page space-y-6 p-4 md:p-6 lg:p-8">
      <PageHeader
        title={L("Gedächtnis des Assistenten", "Assistant memory")}
        description={L(
          "Vorgaben, Fakten und Anweisungen, die der Assistent in allen Gesprächen berücksichtigt.",
          "Preferences, facts and instructions the assistant applies in every conversation."
        )}
        breadcrumbs={[
          { label: t("breadcrumb.dashboard"), href: "/dashboard" },
          { label: t("settings.title" as never), href: "/dashboard/settings" },
          { label: t("memory.breadcrumb_memory") },
        ]}
        actions={
          <PrimaryAction onClick={() => setShowCreateForm(!showCreateForm)}>
            {t("memory.new_btn")}
          </PrimaryAction>
        }
      />

      {hasMemories && (
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
          {[
            { label: t("memory.stat_total"), value: stats.total },
            { label: t("memory.stat_pinned"), value: stats.pinned },
            { label: L("Automatisch erkannt", "Detected automatically"), value: stats.automatic },
          ].map((kpi) => (
            <Card key={kpi.label} className="p-4">
              <div className="text-xs text-[color:var(--ds-text-muted)]">{kpi.label}</div>
              <div className="mt-1 text-2xl font-semibold text-[color:var(--ds-text)] tabular-nums">
                {kpi.value}
              </div>
            </Card>
          ))}
        </div>
      )}

      {showCreateForm && (
        <Card className="p-4">
          <h2 className="mb-1 text-sm font-semibold">{t("memory.new_title")}</h2>
          <p className="mb-3 text-xs text-[color:var(--ds-text-muted)]">
            {L(
              "Beispiel: Bezeichnung „Anrede“, Inhalt „Schriftsätze immer mit ‚Sehr geehrte Damen und Herren‘ beginnen“.",
              "Example: label “Salutation”, content “Always open briefs with ‘Dear Sir or Madam’”."
            )}
          </p>
          <div className="grid gap-3 md:grid-cols-3">
            <div>
              <label
                htmlFor="memory-type"
                className="mb-1 block text-xs text-[color:var(--ds-text-subtle)]"
              >
                {L("Art", "Kind")}
              </label>
              <select
                id="memory-type"
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
              <label
                htmlFor="memory-key"
                className="mb-1 block text-xs text-[color:var(--ds-text-subtle)]"
              >
                {L("Bezeichnung", "Label")}
              </label>
              <Input
                id="memory-key"
                placeholder={L("z. B. Anrede", "e.g. Salutation")}
                value={newMemory.key}
                onChange={(e) => setNewMemory((m) => ({ ...m, key: e.target.value }))}
              />
            </div>
            <div>
              <label
                htmlFor="memory-value"
                className="mb-1 block text-xs text-[color:var(--ds-text-subtle)]"
              >
                {L("Inhalt", "Content")}
              </label>
              <Input
                id="memory-value"
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

      {(hasMemories || searchResults) && (
        <div className="flex gap-2">
          <div className="relative flex-1">
            <Search className="absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-[color:var(--ds-text-subtle)]" />
            <Input
              aria-label={L("Erinnerungen durchsuchen", "Search memories")}
              placeholder={L("Erinnerungen durchsuchen …", "Search memories …")}
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
            {L("Suchen", "Search")}
          </Button>
          {searchResults && (
            <Button
              variant="outline"
              onClick={() => {
                setSearchResults(null);
                setSearchQuery("");
              }}
            >
              {L("Zurücksetzen", "Reset")}
            </Button>
          )}
        </div>
      )}

      {hasMemories && (
        <div className="flex flex-wrap items-center gap-2">
          {["all", "preference", "fact", "topic", "instruction", "case_note"].map((type) => (
            <button
              key={type}
              onClick={() => setFilterType(type)}
              className={cn(
                "rounded-full px-3 py-1 text-xs font-medium transition-[background-color,border-color,color] focus-visible:ring-2 focus-visible:ring-[color:var(--brand-primary)] focus-visible:outline-none active:scale-[0.99] motion-reduce:transition-none",
                filterType === type
                  ? "bg-[color:var(--brand-solid)] text-white"
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
      )}

      {loading ? (
        <div className="space-y-2" role="status" aria-label={L("Wird geladen", "Loading")}>
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-20 w-full rounded-xl" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={Brain}
          title={
            searchResults
              ? L("Keine Treffer", "No matches")
              : L("Noch keine Erinnerungen gespeichert", "No memories yet")
          }
          description={
            searchResults
              ? L("Versuchen Sie einen anderen Suchbegriff.", "Try a different search term.")
              : L(
                  "Legen Sie Vorgaben an, die der Assistent immer beachten soll – etwa Anrede, Zitierweise oder Tonfall.",
                  "Add rules the assistant should always follow, such as salutation, citation style or tone."
                )
          }
          actionLabel={searchResults ? undefined : t("memory.new_btn")}
          onAction={searchResults ? undefined : () => setShowCreateForm(true)}
        />
      ) : (
        <div className="space-y-2">
          {filtered.map((memory) => (
            <Card
              key={memory.id}
              className={cn(
                "flex items-start gap-3 p-4 transition-[background-color,border-color,color] hover:bg-[color:var(--ds-hover)] motion-reduce:transition-none",
                memory.supersededBy && "opacity-50"
              )}
            >
              <button
                onClick={() => handlePin(memory.id, memory.pinned)}
                className="mt-0.5 shrink-0 text-[color:var(--ds-text-subtle)] hover:text-[color:var(--ds-accent-text)]"
                title={memory.pinned ? L("Nicht mehr anheften", "Unpin") : L("Anheften", "Pin")}
                aria-label={
                  memory.pinned ? L("Nicht mehr anheften", "Unpin") : L("Anheften", "Pin")
                }
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
                  <Badge
                    variant="default"
                    className={cn("shrink-0 text-[10px]", !memory.ownerId && "opacity-70")}
                  >
                    {memory.ownerId ? L("Persönlich", "Personal") : L("Kanzleiweit", "Firm-wide")}
                  </Badge>
                  <span className="text-xs text-[color:var(--ds-text-muted)]">
                    {SOURCE_LABELS[memory.source]
                      ? SOURCE_LABELS[memory.source][lang === "en" ? "en" : "de"]
                      : null}
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
                    {memory.validFrom && `${L("ab", "from")} ${formatDate(memory.validFrom)}`}
                    {memory.validFrom && memory.validTo && " — "}
                    {memory.validTo && `${L("bis", "until")} ${formatDate(memory.validTo)}`}
                  </div>
                )}

                <div className="mt-1 text-[10px] text-[color:var(--ds-text-muted)] tabular-nums">
                  {L("Zuletzt geändert", "Last changed")} {formatDateTime(memory.updatedAt)}
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
