"use client";

import { Suspense, useCallback, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Clock, Download, Pencil, Trash2, FileText } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Switch } from "@/components/ui/switch";
import { RowSkeleton, Skeleton } from "@/components/dashboard/skeleton";
import Link from "next/link";
import { encodeSlugPath, formatDate, formatEur } from "@/lib/utils";
import { PageHeader } from "@/components/dashboard/page-header";
import { PrimaryAction } from "@/components/dashboard/primary-action";
import { useLang } from "@/lib/use-lang";
import { useToast } from "@/components/ui/toast";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { api } from "@/lib/api";
import { firmToday } from "@/lib/datetime";
import { tracking } from "@/lib/tracking";
import { EmptyState } from "@/components/dashboard/empty-state";
import { CappedResultsNotice } from "@/components/dashboard/capped-results-notice";
import { TimeTrackingWidget } from "@/components/dashboard/time-tracking-widget";
import { TariffEntryDialog, type TariffCaseOption } from "@/components/legal/TariffEntryDialog";
import { timeEntryValue } from "@/lib/time-entry-value";

const ALL_CASES = "__all";

/** Minuten → "1,50 h" (de-AT, zwei Nachkommastellen). */
function formatHours(minutes: number): string {
  const h = (Number.isFinite(minutes) ? minutes : 0) / 60;
  return `${new Intl.NumberFormat("de-AT", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(h)} h`;
}

function esc(text: string): string {
  return String(text ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

type TimeEntryWithMeta = {
  id: string;
  description: string;
  minutes: number;
  date: string;
  rate?: number;
  billable: boolean;
  billed: boolean;
  case_slug?: string;
  case_title?: string;
  lawyer?: string;
  activity_type?: string;
  is_auto_generated?: boolean;
  /** Tarifleistung (RATG/AHK) — billed at this amount. */
  tariff?: { system: "ratg" | "ahk"; amount: number; label: string };
};

const TIME_TAB_IDS = ["all", "billable", "unbilled", "auto", "manual"] as const;

function TimeEntriesInner() {
  const { t, lang } = useLang();
  const { addToast } = useToast();
  const queryClient = useQueryClient();
  // Tab in der URL (?tab=) — teilbar, Refresh-sicher, Copy-Link per
  // Rechtsklick auf den Reiter.
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const rawTab = searchParams.get("tab") ?? "all";
  const activeTab = (TIME_TAB_IDS as readonly string[]).includes(rawTab) ? rawTab : "all";
  const tabHref = useCallback(
    (v: string) => {
      const params = new URLSearchParams(searchParams.toString());
      if (v === "all") params.delete("tab");
      else params.set("tab", v);
      const qs = params.toString();
      return qs ? `${pathname}?${qs}` : pathname;
    },
    [searchParams, pathname]
  );
  const setActiveTab = useCallback(
    (v: string) => router.replace(tabHref(v), { scroll: false }),
    [router, tabHref]
  );
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCase, setSelectedCase] = useState<string>(ALL_CASES);
  const [editEntry, setEditEntry] = useState<TimeEntryWithMeta | null>(null);
  const [deleteEntry, setDeleteEntry] = useState<TimeEntryWithMeta | null>(null);
  const [editForm, setEditForm] = useState({
    description: "",
    minutes: "",
    date: "",
    rate: "",
    billable: true,
  });
  const [createOpen, setCreateOpen] = useState(false);
  const [tariffOpen, setTariffOpen] = useState(false);
  const [createForm, setCreateForm] = useState({
    description: "",
    minutes: "",
    date: firmToday(),
    rate: "",
    case_slug: "",
    activity_type: "other" as "research" | "drafting" | "court" | "meeting" | "other",
    billable: true,
  });

  // Fetch time entries
  // Every entry (sums, CSV and PDF cover all of them); `capped` only when
  // even the safety stop is reached — then a notice says so.
  const {
    data: timeData,
    isLoading,
    isError: loadFailed,
    refetch: refetchEntries,
  } = useQuery({
    queryKey: ["time-entries"],
    queryFn: () => api.time.list({ limit: TIME_READ_LIMIT }),
  });
  const entries = timeData?.entries;

  const { data: cases = [] } = useQuery({
    queryKey: ["time-cases"],
    queryFn: () => api.brain.listAllPages({ type: "legal_case", max: 10_000 }),
  });

  // Filter entries
  const filteredEntries =
    entries?.filter((entry: TimeEntryWithMeta) => {
      if (searchQuery && !entry.description.toLowerCase().includes(searchQuery.toLowerCase())) {
        return false;
      }
      if (selectedCase !== ALL_CASES && entry.case_slug !== selectedCase) {
        return false;
      }
      if (activeTab === "billable" && !entry.billable) {
        return false;
      }
      if (activeTab === "unbilled" && entry.billed) {
        return false;
      }
      if (activeTab === "auto" && !entry.is_auto_generated) {
        return false;
      }
      if (activeTab === "manual" && entry.is_auto_generated) {
        return false;
      }
      return true;
    }) || [];

  const createMutation = useMutation({
    mutationFn: api.time.create,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["time-entries"] });
      addToast({ title: "Zeiteintrag erstellt", type: "success" });
      setCreateOpen(false);
      setCreateForm({
        description: "",
        minutes: "",
        date: new Date().toISOString().split("T")[0],
        rate: "",
        case_slug: "",
        activity_type: "other",
        billable: true,
      });
    },
    onError: (err: Error) => {
      console.error("[time] create failed:", err.message);
      addToast({
        title: "Zeiteintrag konnte nicht gespeichert werden",
        description: "Bitte prüfen Sie Akte, Dauer und Datum und versuchen Sie es erneut.",
        type: "error",
      });
    },
  });

  function handleCreate() {
    if (!createForm.description || !createForm.minutes || !createForm.case_slug) return;
    createMutation.mutate({
      case_slug: createForm.case_slug,
      description: createForm.description,
      minutes: parseInt(createForm.minutes, 10),
      date: createForm.date,
      rate: createForm.rate ? parseFloat(createForm.rate) : undefined,
      activity_type: createForm.activity_type,
      billable: createForm.billable,
    });
  }
  const totalMinutes = filteredEntries.reduce(
    (sum: number, e: TimeEntryWithMeta) => sum + (e.minutes || 0),
    0
  );
  const totalHours = formatHours(totalMinutes);
  const billableValue = filteredEntries
    .filter((e: TimeEntryWithMeta) => e.billable && !e.billed)
    .reduce((sum: number, e: TimeEntryWithMeta) => sum + timeEntryValue(e, e.rate || 0), 0);
  // Matters for the Tarifleistung dialog, with their Streitwert.
  const tariffCases: TariffCaseOption[] = cases.map(
    (c: { slug: string; title: string; frontmatter?: Record<string, unknown> }) => ({
      slug: c.slug,
      title: c.title,
      disputeValue:
        typeof c.frontmatter?.dispute_value === "number" ? c.frontmatter.dispute_value : undefined,
    })
  );
  const billableAmount = formatEur(billableValue, lang);
  const caseTitle = (slug?: string) =>
    (slug && cases.find((c: { slug: string; title: string }) => c.slug === slug)?.title) ||
    slug ||
    "—";

  // Export entries as CSV or PDF
  function handleExport(format: "csv" | "pdf") {
    tracking.timeTracking.exported(format);
    if (format === "pdf") {
      const printWindow = window.open("", "_blank");
      if (!printWindow) return;
      printWindow.document.write(`
        <html><head><title>Zeiteinträge Export</title>
        <style>body{font-family:sans-serif;padding:20px}table{width:100%;border-collapse:collapse}th,td{border:1px solid hsl(222,8%,85%);padding:8px;text-align:left}th{background:hsl(222,8%,96%)}</style>
        </head><body>
        <h1>Zeiteinträge — ${formatDate(new Date())}</h1>
        <table><thead><tr><th>Datum</th><th>Beschreibung</th><th>Akte</th><th>Minuten</th><th>Stunden</th><th>Abrechenbar</th><th>Satz</th><th>Betrag</th></tr></thead><tbody>
        ${filteredEntries.map((e: TimeEntryWithMeta) => `<tr><td>${formatDate(e.date)}</td><td>${esc(e.description)}</td><td>${esc(e.case_title || caseTitle(e.case_slug))}</td><td>${e.minutes}</td><td>${formatHours(e.minutes)}</td><td>${e.billable ? "Ja" : "Nein"}</td><td>${e.rate ? formatEur(e.rate) : "—"}</td><td>${e.billable && (e.rate || e.tariff) ? formatEur(timeEntryValue(e, e.rate || 0)) : "—"}</td></tr>`).join("")}
        </tbody></table>
        <p><strong>Gesamt:</strong> ${totalHours} — nicht abgerechnet: ${billableAmount}</p>
        </body></html>`);
      printWindow.document.close();
      printWindow.print();
      return;
    }

    const headers = [
      "Datum",
      "Beschreibung",
      "Akte",
      "AktenTitel",
      "Minuten",
      "Stunden",
      "Abrechenbar",
      "Abgerechnet",
      "Satz",
      "Betrag",
      "Anwalt",
      "Aktivitaet",
    ];
    const rows = filteredEntries.map((e: TimeEntryWithMeta) => [
      formatDate(e.date),
      `"${e.description.replace(/"/g, '""')}"`,
      e.case_slug || "",
      `"${(e.case_title || caseTitle(e.case_slug)).replace(/"/g, '""')}"`,
      String(e.minutes),
      decimalDe(e.minutes / 60),
      e.billable ? "Ja" : "Nein",
      e.billed ? "Ja" : "Nein",
      e.rate ? decimalDe(e.rate) : "",
      e.billable && (e.rate || e.tariff) ? decimalDe(timeEntryValue(e, e.rate || 0)) : "",
      e.lawyer || "",
      e.activity_type || "",
    ]);
    // Excel (de-AT) reads ";" as separator and "," as decimal mark.
    const csv = [headers.join(";"), ...rows.map((r) => r.join(";"))].join("\r\n");
    const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `zeiteinträge-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    addToast({
      title: "Export erstellt",
      description: `${filteredEntries.length} ${filteredEntries.length === 1 ? "Eintrag" : "Einträge"} als CSV exportiert`,
      type: "success",
    });
  }

  function handleEdit(entry: TimeEntryWithMeta) {
    setEditEntry(entry);
    setEditForm({
      description: entry.description,
      minutes: String(entry.minutes),
      date: entry.date,
      rate: entry.rate ? String(entry.rate) : "",
      billable: entry.billable,
    });
  }

  const editMutation = useMutation({
    mutationFn: async (input: {
      case_slug: string;
      id: string;
      description?: string;
      minutes?: number;
      date?: string;
      rate?: number;
      billable?: boolean;
    }) => api.time.update(input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["time-entries"] });
      addToast({ title: "Eintrag aktualisiert", type: "success" });
      setEditEntry(null);
    },
    onError: (err: Error) => {
      console.error("[time] update failed:", err.message);
      addToast({
        title: "Änderung konnte nicht gespeichert werden",
        description: "Bitte versuchen Sie es erneut.",
        type: "error",
      });
    },
  });

  function handleSaveEdit() {
    if (!editEntry) return;
    tracking.timeTracking.entryEdited(editEntry.case_slug || "");
    editMutation.mutate({
      case_slug: editEntry.case_slug || "",
      id: editEntry.id,
      description: editForm.description,
      minutes: parseInt(editForm.minutes, 10) || 0,
      date: editForm.date,
      rate: editForm.rate ? parseFloat(editForm.rate) : undefined,
      billable: editForm.billable,
    });
  }

  const deleteMutation = useMutation({
    mutationFn: async (input: { case_slug: string; id: string }) => api.time.delete(input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["time-entries"] });
      addToast({ title: "Eintrag gelöscht", type: "success" });
      setDeleteEntry(null);
    },
    onError: (err: Error) => {
      console.error("[time] delete failed:", err.message);
      addToast({
        title: "Eintrag konnte nicht gelöscht werden",
        description: "Bitte versuchen Sie es erneut.",
        type: "error",
      });
    },
  });

  function handleConfirmDelete() {
    if (!deleteEntry) return;
    tracking.timeTracking.entryDeleted(deleteEntry.case_slug || "");
    deleteMutation.mutate({
      case_slug: deleteEntry.case_slug || "",
      id: deleteEntry.id,
    });
  }

  return (
    <div className="ds-page space-y-6 p-4 md:p-6 lg:p-8">
      <PageHeader
        title={t("nav.time_tracking")}
        description="Leistungszeiten je Akte erfassen, prüfen und als Grundlage für Honorarnoten exportieren."
        breadcrumbs={[
          { label: "Übersicht", href: "/dashboard" },
          { label: t("nav.time_tracking") },
        ]}
        actions={
          <>
            <PrimaryAction onClick={() => setCreateOpen(true)}>Neuer Eintrag</PrimaryAction>
            <Button
              variant="outline"
              size="sm"
              className="whitespace-nowrap"
              onClick={() => setTariffOpen(true)}
            >
              Tarifleistung (RATG/AHK)
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="outline"
                  size="sm"
                  className="whitespace-nowrap"
                  disabled={filteredEntries.length === 0}
                >
                  <Download className="h-4 w-4" aria-hidden="true" />
                  Exportieren
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-48">
                <DropdownMenuItem className="gap-2 text-xs" onClick={() => handleExport("csv")}>
                  <Download size={13} aria-hidden="true" />
                  Als CSV (Excel)
                </DropdownMenuItem>
                <DropdownMenuItem className="gap-2 text-xs" onClick={() => handleExport("pdf")}>
                  <FileText size={13} aria-hidden="true" />
                  Drucken / PDF
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </>
        }
      />

      {/*
        The live start/stop timer widget existed as a component
        (time-tracking-widget.tsx, backed by working /api/time-tracking/*
        routes) but was never mounted anywhere — /dashboard/time-tracking
        had only error.tsx/loading.tsx, no page.tsx. Per the "one canonical
        page per feature" convention (CLAUDE.md), it belongs here on the
        canonical time page rather than getting its own route.
      */}
      <div className="max-w-sm">
        <TimeTrackingWidget />
      </div>

      {/* Kennzahlen */}
      {isLoading ? (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-[76px] rounded-xl" />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          <TimeStat label="Erfasste Zeit" value={totalHours} sub={`${totalMinutes} Minuten`} />
          <TimeStat
            label="Nicht abgerechnet"
            value={billableAmount}
            sub="abrechenbar, noch offen"
          />
          <TimeStat
            label="Einträge"
            value={String(filteredEntries.length)}
            sub={
              filteredEntries.length === (entries?.length ?? 0)
                ? "alle Einträge"
                : `von ${entries?.length ?? 0} gesamt`
            }
          />
        </div>
      )}

      {/* Filter */}
      <div className="flex flex-col gap-3 sm:flex-row">
        <Input
          placeholder="Tätigkeit suchen …"
          aria-label="Tätigkeit suchen"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="sm:max-w-xs"
        />
        <Select value={selectedCase} onValueChange={setSelectedCase}>
          <SelectTrigger className="sm:max-w-xs" aria-label="Nach Akte filtern">
            <SelectValue placeholder="Alle Akten" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL_CASES}>Alle Akten</SelectItem>
            {cases.map((c: { slug: string; title: string }) => (
              <SelectItem key={c.slug} value={c.slug}>
                {c.title}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Tabs — echte Links (asChild → <a role="tab">): Copy-Link und
          Middle-Click nativ, Klick bleibt SPA-Tabwechsel ohne Reload. */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <div className="max-w-full [scrollbar-width:none] overflow-x-auto">
          <TabsList>
            {(
              [
                ["all", "Alle"],
                ["billable", "Abrechenbar"],
                ["unbilled", "Nicht abgerechnet"],
                ["auto", "Automatisch"],
                ["manual", "Manuell"],
              ] as const
            ).map(([id, label]) => (
              <TabsTrigger key={id} value={id} asChild>
                <a href={tabHref(id)} onClick={(e) => e.preventDefault()} className="no-underline">
                  {label}
                </a>
              </TabsTrigger>
            ))}
          </TabsList>
        </div>

        <TabsContent value={activeTab} className="mt-4">
          {timeData?.capped && <CappedResultsNotice limit={TIME_READ_LIMIT} />}
          {isLoading ? (
            <RowSkeleton count={4} />
          ) : loadFailed ? (
            <EmptyState
              icon={Clock}
              title="Zeiteinträge konnten nicht geladen werden"
              description="Die Liste ist nicht leer, sie konnte nur nicht gelesen werden."
              actionLabel="Erneut laden"
              onAction={() => void refetchEntries()}
            />
          ) : filteredEntries.length > 0 ? (
            <ul className="divide-y divide-[color:var(--ds-border)] overflow-hidden rounded-xl border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)]">
              {filteredEntries.map((entry: TimeEntryWithMeta) => (
                <li key={entry.id} className="flex items-center gap-3 px-3 py-3 sm:px-4">
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-medium text-[color:var(--ds-text)]">
                      {entry.description}
                    </div>
                    <div className="truncate text-xs text-[color:var(--ds-text-muted)] tabular-nums">
                      {formatDate(entry.date)} ·{" "}
                      {entry.case_slug ? (
                        <Link
                          href={`/dashboard/cases/${encodeSlugPath(entry.case_slug)}`}
                          className="hover:text-[color:var(--brand-primary)] hover:underline"
                        >
                          {entry.case_title || caseTitle(entry.case_slug)}
                        </Link>
                      ) : (
                        entry.case_title || caseTitle(entry.case_slug)
                      )}{" "}
                      · {formatHours(entry.minutes)}
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center gap-1.5">
                    {entry.is_auto_generated && (
                      <Badge className="hidden text-xs sm:inline-flex">Automatisch</Badge>
                    )}
                    {entry.tariff && (
                      <Badge className="text-xs tabular-nums">
                        {entry.tariff.system === "ahk" ? "AHK" : "RATG"}{" "}
                        {formatEur(entry.tariff.amount, lang)}
                      </Badge>
                    )}
                    {entry.billed ? (
                      <Badge className="hidden text-xs sm:inline-flex">Abgerechnet</Badge>
                    ) : entry.billable ? (
                      <Badge className="hidden border-[color:var(--ds-success-border)] bg-[color:var(--ds-success-bg)] text-xs text-[color:var(--ds-success-text)] sm:inline-flex">
                        Abrechenbar
                      </Badge>
                    ) : null}
                    <Button
                      size="icon"
                      variant="ghost"
                      aria-label={`${t("time.edit_title")}: ${entry.description}`}
                      title={t("time.edit_title")}
                      onClick={() => handleEdit(entry)}
                    >
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button
                      size="icon"
                      variant="ghost"
                      aria-label={`${t("time.delete_title")}: ${entry.description}`}
                      title={t("time.delete_title")}
                      onClick={() => setDeleteEntry(entry)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          ) : (entries?.length ?? 0) > 0 ? (
            <EmptyState
              icon={Clock}
              title="Keine Einträge für diesen Filter"
              description="Passen Sie Suche, Akte oder Register an."
            />
          ) : (
            <EmptyState
              icon={Clock}
              title="Noch keine Zeiteinträge"
              description="Erfassen Sie Ihre erste Leistung zu einer Akte."
              actionLabel="Neuer Eintrag"
              onAction={() => setCreateOpen(true)}
            />
          )}
        </TabsContent>
      </Tabs>

      {/* Create Dialog */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle>Neuer Zeiteintrag</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="create-description">Beschreibung</Label>
              <Input
                id="create-description"
                value={createForm.description}
                onChange={(e) => setCreateForm({ ...createForm, description: e.target.value })}
                placeholder="Tätigkeit beschreiben"
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="create-minutes">Minuten</Label>
                <Input
                  id="create-minutes"
                  type="number"
                  inputMode="numeric"
                  value={createForm.minutes}
                  onChange={(e) => setCreateForm({ ...createForm, minutes: e.target.value })}
                  placeholder="60"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="create-date">Datum</Label>
                <Input
                  id="create-date"
                  type="date"
                  value={createForm.date}
                  onChange={(e) => setCreateForm({ ...createForm, date: e.target.value })}
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Akte</Label>
              <Select
                value={createForm.case_slug}
                onValueChange={(v) => setCreateForm({ ...createForm, case_slug: v })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Akte auswählen" />
                </SelectTrigger>
                <SelectContent>
                  {cases.map((c: { slug: string; title: string }) => (
                    <SelectItem key={c.slug} value={c.slug}>
                      {c.title}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Aktivität</Label>
                <Select
                  value={createForm.activity_type}
                  onValueChange={(v) =>
                    setCreateForm({
                      ...createForm,
                      activity_type: v as typeof createForm.activity_type,
                    })
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="research">Recherche</SelectItem>
                    <SelectItem value="drafting">Schriftsatz</SelectItem>
                    <SelectItem value="court">Gericht</SelectItem>
                    <SelectItem value="meeting">Besprechung</SelectItem>
                    <SelectItem value="other">Sonstiges</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="create-rate">Stundensatz (€)</Label>
                <Input
                  id="create-rate"
                  type="number"
                  inputMode="decimal"
                  step="0.01"
                  value={createForm.rate}
                  onChange={(e) => setCreateForm({ ...createForm, rate: e.target.value })}
                  placeholder="250"
                />
              </div>
            </div>
            <div className="flex items-center justify-between gap-3">
              <Label htmlFor="create-billable">Abrechenbar</Label>
              <Switch
                id="create-billable"
                checked={createForm.billable}
                onCheckedChange={(v) => setCreateForm({ ...createForm, billable: v })}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)}>
              {t("time.cancel")}
            </Button>
            <Button
              onClick={handleCreate}
              disabled={
                createMutation.isPending ||
                !createForm.description ||
                !createForm.minutes ||
                !createForm.case_slug
              }
            >
              {createMutation.isPending ? t("time.saving") : t("time.save")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <TariffEntryDialog
        open={tariffOpen}
        onOpenChange={setTariffOpen}
        cases={tariffCases}
        presetCaseSlug={selectedCase !== ALL_CASES ? selectedCase : undefined}
        onSaved={() => void queryClient.invalidateQueries({ queryKey: ["time-entries"] })}
      />

      {/* Edit Dialog */}
      <Dialog open={!!editEntry} onOpenChange={(open) => !open && setEditEntry(null)}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>{t("time.edit_title")}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="edit-description">Beschreibung</Label>
              <Input
                id="edit-description"
                value={editForm.description}
                onChange={(e) => setEditForm({ ...editForm, description: e.target.value })}
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="edit-minutes">Minuten</Label>
                <Input
                  id="edit-minutes"
                  type="number"
                  inputMode="numeric"
                  value={editForm.minutes}
                  onChange={(e) => setEditForm({ ...editForm, minutes: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="edit-date">Datum</Label>
                <Input
                  id="edit-date"
                  type="date"
                  value={editForm.date}
                  onChange={(e) => setEditForm({ ...editForm, date: e.target.value })}
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="edit-rate">Stundensatz (€)</Label>
                <Input
                  id="edit-rate"
                  type="number"
                  inputMode="decimal"
                  step="0.01"
                  value={editForm.rate}
                  onChange={(e) => setEditForm({ ...editForm, rate: e.target.value })}
                />
              </div>
              <div className="flex items-end justify-between gap-3 pb-2">
                <Label htmlFor="edit-billable">{t("time.billable")}</Label>
                <Switch
                  id="edit-billable"
                  checked={editForm.billable}
                  onCheckedChange={(v) => setEditForm({ ...editForm, billable: v })}
                />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditEntry(null)}>
              {t("time.cancel")}
            </Button>
            <Button onClick={handleSaveEdit} disabled={editMutation.isPending}>
              {editMutation.isPending ? t("time.saving") : t("time.save")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <Dialog open={!!deleteEntry} onOpenChange={(open) => !open && setDeleteEntry(null)}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>{t("time.delete_title")}</DialogTitle>
          </DialogHeader>
          <p className="py-4 text-sm text-[color:var(--ds-text-muted)]">
            {t("time.delete_confirm")}
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteEntry(null)}>
              {t("time.cancel")}
            </Button>
            <Button
              variant="danger"
              onClick={handleConfirmDelete}
              disabled={deleteMutation.isPending}
            >
              {deleteMutation.isPending ? t("time.deleting") : t("time.delete")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function TimeStat({ label, value, sub }: { label: string; value: string; sub: string }) {
  return (
    <div className="rounded-xl border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] px-4 py-3">
      <div className="text-xs text-[color:var(--ds-text-muted)]">{label}</div>
      <div className="mt-1 text-xl font-semibold text-[color:var(--ds-text)] tabular-nums">
        {value}
      </div>
      <div className="mt-0.5 text-xs text-[color:var(--ds-text-muted)]">{sub}</div>
    </div>
  );
}

/** Safety stop for the time list (the API reads everything up to it). */
const TIME_READ_LIMIT = 20_000;

/** Decimal with comma and two places for the CSV ("1,50"). */
function decimalDe(n: number): string {
  return n.toFixed(2).replace(".", ",");
}

export default function TimeEntriesPage() {
  return (
    <Suspense fallback={<div className="p-6" />}>
      <TimeEntriesInner />
    </Suspense>
  );
}
