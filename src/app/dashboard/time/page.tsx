"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Calendar, Download, Edit, Trash2, Filter, FileText } from "lucide-react";
import { PageHeader } from "@/components/dashboard/page-header";
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
import { tracking } from "@/lib/tracking";

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
};

export default function TimeEntriesPage() {
  const { t } = useLang();
  const { addToast } = useToast();
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCase, setSelectedCase] = useState<string>("");
  const [editEntry, setEditEntry] = useState<TimeEntryWithMeta | null>(null);
  const [deleteEntry, setDeleteEntry] = useState<TimeEntryWithMeta | null>(null);
  const [editForm, setEditForm] = useState({
    description: "",
    minutes: "",
    date: "",
    rate: "",
    billable: true,
  });

  // Fetch time entries
  const { data: entries, isLoading } = useQuery({
    queryKey: ["time-entries"],
    queryFn: async () => {
      const data = await api.time.list({ limit: 500 });
      return data.entries || [];
    },
  });

  // Filter entries
  const filteredEntries =
    entries?.filter((entry: TimeEntryWithMeta) => {
      if (searchQuery && !entry.description.toLowerCase().includes(searchQuery.toLowerCase())) {
        return false;
      }
      if (selectedCase && entry.case_slug !== selectedCase) {
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

  // Calculate totals
  const totalMinutes = filteredEntries.reduce(
    (sum: number, e: TimeEntryWithMeta) => sum + (e.minutes || 0),
    0
  );
  const totalHours = (totalMinutes / 60).toFixed(2);
  const billableAmount = filteredEntries
    .filter((e: TimeEntryWithMeta) => e.billable && !e.billed)
    .reduce((sum: number, e: TimeEntryWithMeta) => sum + ((e.minutes || 0) / 60) * (e.rate || 0), 0)
    .toFixed(2);

  // Export entries as CSV or PDF
  function handleExport(format: "csv" | "pdf") {
    tracking.timeTracking.exported(format);
    if (format === "pdf") {
      const printWindow = window.open("", "_blank");
      if (!printWindow) return;
      printWindow.document.write(`
        <html><head><title>Zeiteinträge Export</title>
        <style>body{font-family:sans-serif;padding:20px}table{width:100%;border-collapse:collapse}th,td{border:1px solid hsl(230,8%,85%);padding:8px;text-align:left}th{background:hsl(230,8%,96%)}</style>
        </head><body>
        <h1>Zeiteinträge Export — ${new Date().toLocaleDateString("de-DE")}</h1>
        <table><thead><tr><th>Datum</th><th>Beschreibung</th><th>Akte</th><th>Minuten</th><th>Stunden</th><th>Abrechenbar</th><th>Satz</th><th>Betrag</th></tr></thead><tbody>
        ${filteredEntries.map((e: TimeEntryWithMeta) => `<tr><td>${formatDate(e.date)}</td><td>${e.description}</td><td>${e.case_slug || "—"}</td><td>${e.minutes}</td><td>${(e.minutes / 60).toFixed(2)}</td><td>${e.billable ? "Ja" : "Nein"}</td><td>${e.rate ? `€${e.rate}` : "—"}</td><td>${e.billable && e.rate ? `€${((e.minutes / 60) * e.rate).toFixed(2)}` : "—"}</td></tr>`).join("")}
        </tbody></table>
        <p><strong>Gesamt:</strong> ${totalHours}h — Abrechenbar: €${billableAmount}</p>
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
      e.case_title || "",
      String(e.minutes),
      (e.minutes / 60).toFixed(2),
      e.billable ? "Ja" : "Nein",
      e.billed ? "Ja" : "Nein",
      e.rate ? String(e.rate) : "",
      e.billable && e.rate ? ((e.minutes / 60) * e.rate).toFixed(2) : "",
      e.lawyer || "",
      e.activity_type || "",
    ]);
    const csv = [headers.join(","), ...rows.map((r) => r.join(","))].join("\n");
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
      title: "Export erfolgreich",
      description: `${filteredEntries.length} Einträge als CSV exportiert`,
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
      addToast({ title: "Fehler", description: err.message, type: "error" });
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
      addToast({ title: "Fehler", description: err.message, type: "error" });
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

  function formatDate(dateStr: string): string {
    return new Date(dateStr).toLocaleDateString("de-DE");
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title={t("nav.time_tracking")}
        description={t("nav.time_tracking")}
        actions={[
          <Button key="export-csv" variant="outline" size="sm" onClick={() => handleExport("csv")}>
            <Download className="mr-2 h-4 w-4" />
            CSV Export
          </Button>,
          <Button key="export-pdf" variant="outline" size="sm" onClick={() => handleExport("pdf")}>
            <FileText className="mr-2 h-4 w-4" />
            PDF Export
          </Button>,
        ]}
      />

      {/* Stats Cards */}
      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Gesamtzeit</CardTitle>
            <Calendar className="text-muted-foreground h-4 w-4" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{totalHours}h</div>
            <p className="text-muted-foreground text-xs">{totalMinutes} Minuten</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Abrechenbar</CardTitle>
            <Calendar className="text-muted-foreground h-4 w-4" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">€{billableAmount}</div>
            <p className="text-muted-foreground text-xs">Nicht abgerechnet</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Einträge</CardTitle>
            <Calendar className="text-muted-foreground h-4 w-4" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{filteredEntries.length}</div>
            <p className="text-muted-foreground text-xs">Gefiltert</p>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-sm font-medium">
            <Filter className="h-4 w-4" />
            Filter
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex gap-4">
            <Input
              placeholder="Suche..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="max-w-xs"
            />
            <Input
              placeholder="Case..."
              value={selectedCase}
              onChange={(e) => setSelectedCase(e.target.value)}
              className="max-w-xs"
            />
          </div>
        </CardContent>
      </Card>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="all">Alle</TabsTrigger>
          <TabsTrigger value="billable">Abrechenbar</TabsTrigger>
          <TabsTrigger value="unbilled">Nicht abgerechnet</TabsTrigger>
          <TabsTrigger value="auto">Automatisch</TabsTrigger>
          <TabsTrigger value="manual">Manuell</TabsTrigger>
        </TabsList>

        <TabsContent value={activeTab} className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Zeiteinträge</CardTitle>
              <CardDescription>{filteredEntries.length} Einträge</CardDescription>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <div className="text-muted-foreground py-8 text-center">Laden...</div>
              ) : filteredEntries.length > 0 ? (
                <div className="space-y-4">
                  {filteredEntries.map((entry: TimeEntryWithMeta) => (
                    <div
                      key={entry.id}
                      className="flex items-center justify-between rounded-lg border p-4"
                    >
                      <div className="flex-1">
                        <div className="font-medium">{entry.description}</div>
                        <div className="text-muted-foreground text-sm">
                          {formatDate(entry.date)} • {entry.case_slug || "Global"} • {entry.minutes}{" "}
                          min
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        {entry.is_auto_generated && <Badge className="text-xs">Auto</Badge>}
                        {entry.billable && !entry.billed && (
                          <Badge className="border-green-500/20 bg-green-500/10 text-green-500">
                            Abrechenbar
                          </Badge>
                        )}
                        <Button size="sm" variant="ghost" onClick={() => handleEdit(entry)}>
                          <Edit className="h-4 w-4" />
                        </Button>
                        <Button size="sm" variant="ghost" onClick={() => setDeleteEntry(entry)}>
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-muted-foreground py-8 text-center">
                  Keine Einträge gefunden
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Edit Dialog */}
      <Dialog open={!!editEntry} onOpenChange={(open) => !open && setEditEntry(null)}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>Zeiteintrag bearbeiten</DialogTitle>
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
                  step="0.01"
                  value={editForm.rate}
                  onChange={(e) => setEditForm({ ...editForm, rate: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="edit-billable">Abrechenbar</Label>
                <Button
                  id="edit-billable"
                  variant={editForm.billable ? "primary" : "outline"}
                  className="w-full"
                  onClick={() => setEditForm({ ...editForm, billable: !editForm.billable })}
                >
                  {editForm.billable ? "Ja" : "Nein"}
                </Button>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditEntry(null)}>
              Abbrechen
            </Button>
            <Button onClick={handleSaveEdit} disabled={editMutation.isPending}>
              {editMutation.isPending ? "Speichern..." : "Speichern"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <Dialog open={!!deleteEntry} onOpenChange={(open) => !open && setDeleteEntry(null)}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>Zeiteintrag löschen</DialogTitle>
          </DialogHeader>
          <p className="text-muted-foreground py-4 text-sm">
            Möchten Sie den Eintrag &ldquo;{deleteEntry?.description}&rdquo; wirklich löschen? Diese
            Aktion kann nicht rückgängig gemacht werden.
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteEntry(null)}>
              Abbrechen
            </Button>
            <Button
              variant="danger"
              onClick={handleConfirmDelete}
              disabled={deleteMutation.isPending}
            >
              {deleteMutation.isPending ? "Löschen..." : "Löschen"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
