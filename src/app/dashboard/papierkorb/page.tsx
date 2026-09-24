"use client";

import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams, usePathname } from "next/navigation";
import {
  Archive,
  Clock,
  FileText,
  Inbox,
  Info,
  Loader2,
  RotateCcw,
  ScrollText,
  ShieldAlert,
  Trash2,
} from "lucide-react";
import { PageHeader } from "@/components/dashboard/page-header";
import { EmptyState } from "@/components/dashboard/empty-state";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/components/ui/toast";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { csrfFetch } from "@/lib/csrf";
import { cn, formatDate, formatDateTime } from "@/lib/utils";
import { loadKanzleiSettings, normalizeTrashRetentionDays } from "@/lib/kanzlei-settings";
import { trashPurgeAt } from "@/lib/trash";

interface TrashItem {
  slug: string;
  title: string;
  type: string;
  kind: "case" | "item";
  deleted_at?: string;
  deleted_by?: string;
  case_slug?: string;
  reason?: string;
  legal_hold?: boolean;
}

type RestoreOutcome = "ok" | "parent_archived" | "not_found" | "error";
interface RestoreResult {
  outcome: RestoreOutcome;
  /** Documents reactivated by the archive cascade (case restores only). */
  cascaded: number;
}

const TYPE_LABEL: Record<string, string> = {
  legal_case: "Akte",
  document: "Dokument",
  intake_request: "Erstanfrage",
  legal_contact: "Kontakt",
  legal_deadline: "Frist",
  deadline: "Frist",
  invoice: "Rechnung",
  note: "Notiz",
  time_entry: "Zeiteintrag",
  task: "Aufgabe",
};

const REASON_LABEL: Record<string, string> = {
  archived: "Akte archiviert",
  case_archived: "Mit Akte archiviert",
  manual_delete: "Manuell gelöscht",
};

function reasonLabel(item: TrashItem): string {
  return REASON_LABEL[item.reason ?? ""] ?? "Gelöscht";
}

function PapierkorbInner() {
  const { addToast } = useToast();
  const confirm = useConfirm();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const [items, setItems] = useState<TrashItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [restoring, setRestoring] = useState<Set<string>>(new Set());
  const [selected, setSelected] = useState<Set<string>>(new Set());
  // Auto-purge display: days until the cron removes an item permanently.
  // null = settings not loaded yet; enabled=false = firm opted out.
  const [purge, setPurge] = useState<{ enabled: boolean; days: number } | null>(null);

  const typeFilter = searchParams.get("type") ?? "all";
  const search = searchParams.get("q") ?? "";

  const setParam = useCallback(
    (key: string, value: string) => {
      const params = new URLSearchParams(searchParams.toString());
      if (value && value !== "all") params.set(key, value);
      else params.delete(key);
      router.replace(`${pathname}?${params.toString()}`, { scroll: false });
    },
    [pathname, router, searchParams]
  );

  const load = useCallback(async () => {
    setLoading(true);
    setError(false);
    try {
      const res = await fetch("/api/trash");
      if (!res.ok) throw new Error(String(res.status));
      const data = (await res.json()) as { data?: { items?: TrashItem[] } };
      const next = data.data?.items ?? [];
      setItems(next);
      // Prune selections that no longer exist (e.g. restored in another tab).
      const slugs = new Set(next.map((i) => i.slug));
      setSelected((prev) => new Set([...prev].filter((s) => slugs.has(s))));
    } catch {
      setError(true);
      addToast({ type: "error", title: "Papierkorb konnte nicht geladen werden" });
    } finally {
      setLoading(false);
    }
  }, [addToast]);

  useEffect(() => {
    void load();
    let cancelled = false;
    loadKanzleiSettings()
      .then((s) => {
        if (cancelled) return;
        setPurge({
          enabled: s.trashAutoPurge !== false,
          days: normalizeTrashRetentionDays(s.trashRetentionDays),
        });
      })
      .catch(() => {
        // Settings unreadable → banner stays neutral, no purge dates shown.
        if (!cancelled) setPurge(null);
      });
    return () => {
      cancelled = true;
    };
  }, [load]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return items.filter((item) => {
      if (typeFilter !== "all" && item.type !== typeFilter) return false;
      if (
        q &&
        !item.title.toLowerCase().includes(q) &&
        !item.slug.toLowerCase().includes(q) &&
        !(item.case_slug ?? "").toLowerCase().includes(q)
      )
        return false;
      return true;
    });
  }, [items, typeFilter, search]);

  const presentTypes = useMemo(() => [...new Set(items.map((i) => i.type))].sort(), [items]);

  const reinsert = useCallback((item: TrashItem) => {
    setItems((prev) =>
      prev.some((i) => i.slug === item.slug)
        ? prev
        : [...prev, item].sort((a, b) => (b.deleted_at ?? "").localeCompare(a.deleted_at ?? ""))
    );
  }, []);

  /** POST /api/trash with optimistic removal; re-inserts on failure. */
  const restoreCore = useCallback(
    async (item: TrashItem): Promise<RestoreResult> => {
      setItems((prev) => prev.filter((i) => i.slug !== item.slug));
      try {
        const res = await csrfFetch("/api/trash", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ slug: item.slug }),
        });
        if (!res.ok) {
          reinsert(item);
          const body = (await res.json().catch(() => null)) as { error?: string } | null;
          if (body?.error === "parent_archived") return { outcome: "parent_archived", cascaded: 0 };
          return { outcome: res.status === 404 ? "not_found" : "error", cascaded: 0 };
        }
        const body = (await res.json().catch(() => null)) as {
          data?: { cascaded?: number };
        } | null;
        return { outcome: "ok", cascaded: body?.data?.cascaded ?? 0 };
      } catch {
        reinsert(item);
        return { outcome: "error", cascaded: 0 };
      }
    },
    [reinsert]
  );

  const markBusy = useCallback((slug: string, on: boolean) => {
    setRestoring((s) => {
      const next = new Set(s);
      if (on) next.add(slug);
      else next.delete(slug);
      return next;
    });
  }, []);

  async function restore(item: TrashItem) {
    // Mark busy before the confirm so a second click can't queue another dialog.
    markBusy(item.slug, true);
    try {
      if (item.kind === "case") {
        const ok = await confirm({
          title: "Akte wiederherstellen",
          message: `Akte „${item.title}" wiederherstellen? Die mit der Akte archivierten Dokumente werden ebenfalls reaktiviert.`,
          confirmLabel: "Wiederherstellen",
          cancelLabel: "Abbrechen",
          variant: "primary",
        });
        if (!ok) return;
      }
      const { outcome, cascaded } = await restoreCore(item);
      if (outcome !== "ok") {
        addToast({
          type: "error",
          title:
            outcome === "parent_archived"
              ? "Akte zuerst wiederherstellen"
              : outcome === "not_found"
                ? "Element nicht gefunden"
                : "Wiederherstellung fehlgeschlagen",
          description:
            outcome === "parent_archived"
              ? "Die zugehörige Akte ist archiviert. Stellen Sie zuerst die Akte wieder her."
              : undefined,
        });
        return;
      }
      addToast({
        type: "success",
        title: item.kind === "case" ? "Akte wiederhergestellt" : "Element wiederhergestellt",
        description:
          cascaded > 0
            ? `„${item.title}" und ${cascaded} Dokument${cascaded === 1 ? "" : "e"} wurden reaktiviert.`
            : `„${item.title}" ist wieder aktiv.`,
      });
    } finally {
      markBusy(item.slug, false);
    }
  }

  async function restoreSelected() {
    const targets = filtered.filter((i) => selected.has(i.slug));
    if (targets.length === 0) return;
    const caseCount = targets.filter((i) => i.kind === "case").length;
    const ok = await confirm({
      title: "Auswahl wiederherstellen",
      message:
        caseCount > 0
          ? `${targets.length} Elemente wiederherstellen, darunter ${caseCount} ${caseCount === 1 ? "Akte" : "Akten"}? Archivierte Akten reaktivieren ihre Dokumente automatisch mit.`
          : `${targets.length} Elemente wiederherstellen?`,
      confirmLabel: "Wiederherstellen",
      cancelLabel: "Abbrechen",
      variant: "primary",
    });
    if (!ok) return;

    for (const t of targets) markBusy(t.slug, true);
    let succeeded = 0;
    const failed: TrashItem[] = [];
    for (const item of targets) {
      const { outcome } = await restoreCore(item);
      if (outcome === "ok") succeeded++;
      else failed.push(item);
      markBusy(item.slug, false);
    }
    setSelected(new Set());
    if (failed.length === 0) {
      addToast({
        type: "success",
        title: `${succeeded} Element${succeeded === 1 ? "" : "e"} wiederhergestellt`,
      });
    } else {
      addToast({
        type: "error",
        title: `${failed.length} von ${targets.length} konnten nicht wiederhergestellt werden`,
        description: failed
          .slice(0, 3)
          .map((f) => f.title)
          .join(", "),
      });
    }
  }

  const allFilteredSelected = filtered.length > 0 && filtered.every((i) => selected.has(i.slug));
  const someSelected = filtered.some((i) => selected.has(i.slug));

  return (
    <div className="ds-page space-y-6 p-4 md:p-6 lg:p-8">
      <PageHeader
        title="Papierkorb"
        description="Gelöschte Elemente und archivierte Akten wiederherstellen."
        breadcrumbs={[{ label: "Übersicht", href: "/dashboard" }, { label: "Papierkorb" }]}
      />

      <div
        className="flex items-start gap-3 rounded-xl border border-[color:var(--ds-border)] bg-[color:var(--ds-surface-2)] px-4 py-3 text-xs leading-relaxed text-[color:var(--ds-text-muted)]"
        role="note"
      >
        <Info
          size={15}
          className="mt-0.5 shrink-0 text-[color:var(--ds-text-subtle)]"
          aria-hidden="true"
        />
        <p>
          {purge === null
            ? "Gelöschte Elemente können wiederhergestellt werden. Ob sie automatisch endgültig gelöscht werden, regeln die Kanzlei-Einstellungen."
            : purge.enabled
              ? `Gelöschte Elemente bleiben ${purge.days} Tage erhalten und werden danach automatisch endgültig gelöscht (einstellbar unter Einstellungen → Kanzlei).`
              : "Gelöschte Elemente bleiben erhalten, bis sie wiederhergestellt werden — die automatische endgültige Löschung ist deaktiviert."}{" "}
          Elemente unter{" "}
          <span className="font-medium text-[color:var(--ds-text)]">Aufbewahrungssperre</span>{" "}
          werden niemals automatisch gelöscht.
        </p>
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="w-full sm:max-w-xs">
          <label htmlFor="trash-search" className="sr-only">
            Papierkorb durchsuchen
          </label>
          <Input
            id="trash-search"
            value={search}
            onChange={(e) => setParam("q", e.target.value)}
            placeholder="Titel oder Akte suchen …"
            aria-label="Papierkorb durchsuchen"
          />
        </div>
        <Select value={typeFilter} onValueChange={(v) => setParam("type", v)}>
          <SelectTrigger className="w-full sm:w-48" aria-label="Nach Typ filtern">
            <SelectValue placeholder="Alle Typen" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Alle Typen</SelectItem>
            {presentTypes.map((t) => (
              <SelectItem key={t} value={t}>
                {TYPE_LABEL[t] ?? t}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {loading ? (
        <div className="space-y-2" aria-busy="true" aria-label="Papierkorb wird geladen">
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-16 w-full" />
        </div>
      ) : error ? (
        <EmptyState
          icon={Trash2}
          title="Papierkorb nicht erreichbar"
          description="Die gelöschten Elemente konnten nicht geladen werden."
          actionLabel="Erneut versuchen"
          onAction={() => void load()}
        />
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={items.length === 0 ? Trash2 : Inbox}
          title={items.length === 0 ? "Papierkorb ist leer" : "Keine Treffer"}
          description={
            items.length === 0
              ? "Gelöschte Dokumente und archivierte Akten erscheinen hier und können wiederhergestellt werden."
              : "Passen Sie Suche oder Typfilter an."
          }
        />
      ) : (
        <>
          <div className="flex items-center gap-3 rounded-xl border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] px-4 py-2.5">
            <Checkbox
              checked={allFilteredSelected ? true : someSelected ? "indeterminate" : false}
              onCheckedChange={(v) =>
                setSelected(v === true ? new Set(filtered.map((i) => i.slug)) : new Set())
              }
              aria-label="Alle Elemente auswählen"
            />
            <span className="text-xs text-[color:var(--ds-text-muted)]" aria-live="polite">
              {selected.size > 0
                ? `${selected.size} ausgewählt`
                : `${filtered.length} Element${filtered.length === 1 ? "" : "e"}`}
            </span>
            {selected.size > 0 && (
              <Button
                variant="outline"
                size="sm"
                className="ml-auto min-h-[44px] sm:min-h-0"
                onClick={() => void restoreSelected()}
              >
                <RotateCcw size={14} aria-hidden="true" />
                Auswahl wiederherstellen
              </Button>
            )}
          </div>

          <ul className="space-y-2" aria-label="Gelöschte Elemente">
            {filtered.map((item) => {
              const busy = restoring.has(item.slug);
              return (
                <li
                  key={item.slug}
                  className={cn(
                    "flex flex-col gap-3 rounded-xl border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] p-4 transition-colors sm:flex-row sm:items-center sm:justify-between",
                    busy && "opacity-60"
                  )}
                >
                  <div className="flex min-w-0 items-start gap-3">
                    <Checkbox
                      checked={selected.has(item.slug)}
                      onCheckedChange={(v) =>
                        setSelected((prev) => {
                          const next = new Set(prev);
                          if (v === true) next.add(item.slug);
                          else next.delete(item.slug);
                          return next;
                        })
                      }
                      disabled={busy}
                      aria-label={`„${item.title}" auswählen`}
                      className="mt-2.5"
                    />
                    <div
                      className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[color:var(--ds-surface-2)]"
                      aria-hidden="true"
                    >
                      {item.kind === "case" ? (
                        <Archive size={16} className="text-[color:var(--ds-text-subtle)]" />
                      ) : (
                        <FileText size={16} className="text-[color:var(--ds-text-subtle)]" />
                      )}
                    </div>
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-[color:var(--ds-text)]">
                        {item.title}
                      </p>
                      <p className="mt-0.5 truncate font-mono text-[11px] text-[color:var(--ds-text-subtle)]">
                        {item.slug}
                      </p>
                      <div className="mt-2 flex flex-wrap items-center gap-1.5">
                        <Badge variant="default" className="text-[11px]">
                          {TYPE_LABEL[item.type] ?? item.type}
                        </Badge>
                        <Badge variant="default" className="text-[11px]">
                          {reasonLabel(item)}
                        </Badge>
                        {item.legal_hold && (
                          <Badge variant="default" className="text-[11px]">
                            <ShieldAlert size={11} className="mr-1" aria-hidden="true" />
                            Aufbewahrungssperre
                          </Badge>
                        )}
                        {item.deleted_at && (
                          <span className="inline-flex items-center gap-1 text-[11px] text-[color:var(--ds-text-muted)]">
                            <Clock size={11} aria-hidden="true" />
                            {formatDateTime(item.deleted_at)}
                            {item.deleted_by ? ` · ${item.deleted_by}` : ""}
                          </span>
                        )}
                        {purge?.enabled && !item.legal_hold && item.deleted_at && (
                          <span className="inline-flex items-center gap-1 text-[11px] text-[color:var(--ds-text-muted)]">
                            <Trash2 size={11} aria-hidden="true" />
                            {(() => {
                              const purgeAt = trashPurgeAt(item, purge.days);
                              return purgeAt
                                ? `endgültige Löschung am ${formatDate(purgeAt.toISOString())}`
                                : "";
                            })()}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center gap-2 pl-9 sm:self-center sm:pl-0">
                    <Button variant="ghost" size="sm" className="min-h-[44px] sm:min-h-0" asChild>
                      <Link
                        href={`/dashboard/audit?q=${encodeURIComponent(item.slug)}`}
                        aria-label={`Protokoll zu „${item.title}" anzeigen`}
                      >
                        <ScrollText size={14} aria-hidden="true" />
                        Protokoll
                      </Link>
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      className="min-h-[44px] sm:min-h-0"
                      onClick={() => void restore(item)}
                      disabled={busy}
                    >
                      {busy ? (
                        <Loader2 size={14} className="animate-spin" aria-hidden="true" />
                      ) : (
                        <RotateCcw size={14} aria-hidden="true" />
                      )}
                      Wiederherstellen
                    </Button>
                  </div>
                </li>
              );
            })}
          </ul>
        </>
      )}
    </div>
  );
}

export default function PapierkorbPage() {
  return (
    <Suspense
      fallback={
        <div className="ds-page space-y-2 p-4 md:p-6 lg:p-8">
          <Skeleton className="h-10 w-64" />
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-16 w-full" />
        </div>
      }
    >
      <PapierkorbInner />
    </Suspense>
  );
}
