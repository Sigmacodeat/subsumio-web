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

const TYPE_LABELS: Record<string, string> = {
  preference: "Präferenz",
  fact: "Fakt",
  topic: "Thema",
  instruction: "Anweisung",
  case_note: "Aktennotiz",
};

const SOURCE_LABELS: Record<string, string> = {
  user_explicit: "Manuell",
  inferred: "Inferiert",
  system: "Agent",
};

export default function MemoryManagementPage() {
  const { addToast } = useToast();
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
      addToast({ title: "Fehler beim Laden", type: "error" });
    } finally {
      setLoading(false);
    }
  }, [addToast]);

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
      addToast({ title: "Suche fehlgeschlagen", type: "error" });
    } finally {
      setSearching(false);
    }
  }, [searchQuery, addToast]);

  const handlePin = useCallback(
    async (id: string, pinned: boolean) => {
      try {
        await api.memory.update(id, { pinned: !pinned });
        setMemories((m) => m.map((mem) => (mem.id === id ? { ...mem, pinned: !pinned } : mem)));
        addToast({ title: !pinned ? "Angepinnt" : "Losgelöst", type: "success" });
      } catch {
        addToast({ title: "Fehler", type: "error" });
      }
    },
    [addToast]
  );

  const handleDelete = useCallback(
    async (id: string) => {
      try {
        await api.memory.delete(id);
        setMemories((m) => m.filter((mem) => mem.id !== id));
        addToast({ title: "Gelöscht", type: "success" });
      } catch {
        addToast({ title: "Fehler beim Löschen", type: "error" });
      }
    },
    [addToast]
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
      addToast({ title: "Erinnerung gespeichert", type: "success" });
    } catch {
      addToast({ title: "Fehler beim Speichern", type: "error" });
    }
  }, [newMemory, addToast, loadMemories]);

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
    <div className="mx-auto max-w-4xl px-4 py-8 md:px-6">
      <PageHeader
        title="Gedächtnis-Verwaltung"
        description="Erinnerungen, Präferenzen und Anweisungen des Copiloten verwalten"
        breadcrumbs={[
          { label: "Dashboard", href: "/dashboard" },
          { label: "Einstellungen", href: "/dashboard/settings" },
          { label: "Gedächtnis" },
        ]}
        actions={
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={loadMemories} disabled={loading}>
              <RefreshCw className={cn("h-4 w-4", loading && "animate-spin")} />
              Aktualisieren
            </Button>
            <Button size="sm" onClick={() => setShowCreateForm(!showCreateForm)}>
              <Plus className="h-4 w-4" />
              Neue Erinnerung
            </Button>
          </div>
        }
      />

      <div className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-5">
        <Card className="p-4">
          <div className="text-2xl font-bold">{stats.total}</div>
          <div className="text-xs text-[color:var(--ds-text-subtle)]">Gesamt</div>
        </Card>
        <Card className="p-4">
          <div className="text-2xl font-bold text-[color:var(--ds-accent-text)]">
            {stats.pinned}
          </div>
          <div className="text-xs text-[color:var(--ds-text-subtle)]">Angepinnt</div>
        </Card>
        <Card className="p-4">
          <div className="text-2xl font-bold text-[color:var(--ds-success-text)]">
            {stats.inferred}
          </div>
          <div className="text-xs text-[color:var(--ds-text-subtle)]">Inferiert</div>
        </Card>
        <Card className="p-4">
          <div className="text-2xl font-bold text-[color:var(--ds-warning-text)]">
            {stats.agent}
          </div>
          <div className="text-xs text-[color:var(--ds-text-subtle)]">Agent-Aktionen</div>
        </Card>
        <Card className="p-4">
          <div className="text-2xl font-bold text-[color:var(--ds-text-muted)]">
            {stats.superseded}
          </div>
          <div className="text-xs text-[color:var(--ds-text-subtle)]">Überschrieben</div>
        </Card>
      </div>

      {showCreateForm && (
        <Card className="mb-6 p-4">
          <h3 className="mb-3 text-sm font-semibold">Neue Erinnerung erstellen</h3>
          <div className="grid gap-3 md:grid-cols-3">
            <div>
              <label className="mb-1 block text-xs text-[color:var(--ds-text-subtle)]">Typ</label>
              <select
                className="w-full rounded-md border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] px-3 py-2 text-sm"
                value={newMemory.type}
                onChange={(e) => setNewMemory((m) => ({ ...m, type: e.target.value }))}
              >
                <option value="preference">Präferenz</option>
                <option value="fact">Fakt</option>
                <option value="topic">Thema</option>
                <option value="instruction">Anweisung</option>
                <option value="case_note">Aktennotiz</option>
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs text-[color:var(--ds-text-subtle)]">
                Schlüssel
              </label>
              <Input
                placeholder="z.B. antwortstil"
                value={newMemory.key}
                onChange={(e) => setNewMemory((m) => ({ ...m, key: e.target.value }))}
              />
            </div>
            <div>
              <label className="mb-1 block text-xs text-[color:var(--ds-text-subtle)]">Wert</label>
              <Input
                placeholder="z.B. Immer kurze Antworten"
                value={newMemory.value}
                onChange={(e) => setNewMemory((m) => ({ ...m, value: e.target.value }))}
              />
            </div>
          </div>
          <div className="mt-3 flex justify-end gap-2">
            <Button variant="outline" size="sm" onClick={() => setShowCreateForm(false)}>
              Abbrechen
            </Button>
            <Button
              size="sm"
              onClick={handleCreate}
              disabled={!newMemory.key.trim() || !newMemory.value.trim()}
            >
              Speichern
            </Button>
          </div>
        </Card>
      )}

      <div className="mb-4 flex gap-2">
        <div className="relative flex-1">
          <Search className="absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-[color:var(--ds-text-subtle)]" />
          <Input
            placeholder="Semantische Suche in Erinnerungen..."
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
            {type === "all" ? "Alle" : (TYPE_LABELS[type] ?? type)}
          </button>
        ))}
        <label className="ml-auto flex items-center gap-2 text-xs text-[color:var(--ds-text-subtle)]">
          <input
            type="checkbox"
            checked={showSuperseded}
            onChange={(e) => setShowSuperseded(e.target.checked)}
            className="rounded"
          />
          Überschriebene anzeigen
        </label>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-12">
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
                    {TYPE_LABELS[memory.type] ?? memory.type}
                  </Badge>
                  <span className="text-xs text-[color:var(--ds-text-muted)]">
                    {SOURCE_LABELS[memory.source] ?? memory.source}
                  </span>
                  {memory.supersededBy && (
                    <Badge variant="default" className="shrink-0 text-[10px] opacity-60">
                      überschrieben
                    </Badge>
                  )}
                  {memory.caseSlug && (
                    <Badge variant="default" className="shrink-0 text-[10px]">
                      Akte: {memory.caseSlug}
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
                title="Löschen"
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
