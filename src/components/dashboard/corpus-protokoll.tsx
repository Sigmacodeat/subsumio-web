"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ExternalLink } from "lucide-react";
import {
  INGEST_ACTION_LABELS,
  SOURCE_LABELS,
  type IngestLogEntry,
  type IngestLogPage,
} from "@/lib/corpus-labels";

const PAGE_SIZE = 50;
const ALL = "__all";

const ACTION_STYLE: Record<IngestLogEntry["action"], string> = {
  added: "bg-[color:var(--ds-success-bg)] text-[color:var(--ds-success-text)]",
  updated: "bg-[color:var(--ds-info-bg)] text-[color:var(--ds-info-text)]",
  removed: "bg-[color:var(--ds-warning-bg)] text-[color:var(--ds-warning-text)]",
  rejected: "bg-[color:var(--ds-danger-bg)] text-[color:var(--ds-danger-text)]",
};

/** Only official RIS pages are offered as links. */
function officialRisUrl(url: string | null): string | null {
  if (!url) return null;
  return /^https:\/\/(www\.)?ris\.bka\.gv\.at\//.test(url) ? url.replace(/\.xml$/, ".html") : null;
}

export function CorpusProtokoll() {
  const [source, setSource] = useState(ALL);
  const [action, setAction] = useState(ALL);
  const [day, setDay] = useState("");
  const [search, setSearch] = useState("");
  const [appliedSearch, setAppliedSearch] = useState("");
  const [offset, setOffset] = useState(0);

  const params = new URLSearchParams({ limit: String(PAGE_SIZE), offset: String(offset) });
  if (source !== ALL) params.set("source", source);
  if (action !== ALL) params.set("action", action);
  if (day) params.set("day", day);
  if (appliedSearch) params.set("q", appliedSearch);

  const query = useQuery({
    queryKey: ["corpus-ingest-log", params.toString()],
    queryFn: async () => {
      const r = await fetch(`/api/admin/corpus-ingest-log?${params}`, {
        credentials: "same-origin",
      });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      return ((await r.json()) as { data: IngestLogPage }).data;
    },
  });

  const reset = (fn: () => void) => {
    fn();
    setOffset(0);
  };
  const data = query.data;
  const pageNo = Math.floor(offset / PAGE_SIZE) + 1;
  const pages = data ? Math.max(1, Math.ceil(data.total / PAGE_SIZE)) : 1;

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-4">
          <div className="space-y-1">
            <label htmlFor="log-source" className="text-xs text-[color:var(--ds-text-muted)]">
              Quelle
            </label>
            <Select value={source} onValueChange={(v) => reset(() => setSource(v))}>
              <SelectTrigger id="log-source">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>Alle Quellen</SelectItem>
                {Object.entries(SOURCE_LABELS).map(([id, label]) => (
                  <SelectItem key={id} value={id}>
                    {label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <label htmlFor="log-action" className="text-xs text-[color:var(--ds-text-muted)]">
              Art
            </label>
            <Select value={action} onValueChange={(v) => reset(() => setAction(v))}>
              <SelectTrigger id="log-action">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>Alle</SelectItem>
                {Object.entries(INGEST_ACTION_LABELS).map(([id, label]) => (
                  <SelectItem key={id} value={id}>
                    {label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <label htmlFor="log-day" className="text-xs text-[color:var(--ds-text-muted)]">
              Tag
            </label>
            <Input
              id="log-day"
              type="date"
              value={day}
              onChange={(e) => reset(() => setDay(e.target.value))}
            />
          </div>
          <form
            className="space-y-1"
            onSubmit={(e) => {
              e.preventDefault();
              reset(() => setAppliedSearch(search.trim()));
            }}
          >
            <label htmlFor="log-search" className="text-xs text-[color:var(--ds-text-muted)]">
              Titel, Dokumentnummer oder Pfad
            </label>
            <Input
              id="log-search"
              value={search}
              placeholder="z. B. ABGB oder JWT_2024…"
              onChange={(e) => setSearch(e.target.value)}
            />
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-0">
          <div className="flex items-center justify-between border-b border-[color:var(--ds-border)] px-4 py-3">
            <h3 className="text-sm font-semibold">
              {data ? `${data.total.toLocaleString("de-AT")} Einträge` : "Protokoll"}
            </h3>
            <span className="text-xs text-[color:var(--ds-text-subtle)]">
              Jeder Import schreibt hier jedes neue oder geänderte Dokument hinein.
            </span>
          </div>
          {query.isLoading ? (
            <div className="space-y-2 p-4">
              {Array.from({ length: 8 }).map((_, i) => (
                <Skeleton key={i} className="h-8 w-full" />
              ))}
            </div>
          ) : query.isError ? (
            <p className="p-6 text-sm text-[color:var(--ds-danger-text)]">
              Protokoll konnte nicht geladen werden.
            </p>
          ) : data && data.entries.length === 0 ? (
            <p className="p-6 text-sm text-[color:var(--ds-text-muted)]">
              Keine Einträge für diese Auswahl.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Zeitpunkt</TableHead>
                    <TableHead>Quelle</TableHead>
                    <TableHead>Dokument</TableHead>
                    <TableHead>Art</TableHead>
                    <TableHead>Über</TableHead>
                    <TableHead>RIS</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data?.entries.map((e) => {
                    const ris = officialRisUrl(e.risUrl);
                    return (
                      <TableRow key={e.id}>
                        <TableCell className="text-xs whitespace-nowrap tabular-nums">
                          {new Date(e.occurredAt).toLocaleString("de-AT", {
                            dateStyle: "short",
                            timeStyle: "medium",
                          })}
                        </TableCell>
                        <TableCell className="text-xs">{e.sourceLabel}</TableCell>
                        <TableCell>
                          <div className="max-w-[28rem] truncate text-sm" title={e.title ?? e.slug}>
                            {e.title ?? e.slug}
                          </div>
                          <div className="text-xs text-[color:var(--ds-text-subtle)]">
                            {e.docId ?? "—"}
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge className={ACTION_STYLE[e.action]}>
                            {INGEST_ACTION_LABELS[e.action]}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-xs text-[color:var(--ds-text-muted)]">
                          {e.origin}
                        </TableCell>
                        <TableCell>
                          {ris ? (
                            <a
                              href={ris}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center gap-1 text-xs underline"
                              aria-label={`${e.title ?? e.docId ?? "Dokument"} im RIS öffnen`}
                            >
                              öffnen <ExternalLink className="h-3 w-3" />
                            </a>
                          ) : (
                            <span className="text-xs text-[color:var(--ds-text-subtle)]">—</span>
                          )}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
          {data && data.total > PAGE_SIZE && (
            <div className="flex items-center justify-between border-t border-[color:var(--ds-border)] px-4 py-3">
              <Button
                variant="outline"
                size="sm"
                disabled={offset === 0}
                onClick={() => setOffset(Math.max(0, offset - PAGE_SIZE))}
              >
                Zurück
              </Button>
              <span className="text-xs text-[color:var(--ds-text-muted)] tabular-nums">
                Seite {pageNo} von {pages}
              </span>
              <Button
                variant="outline"
                size="sm"
                disabled={pageNo >= pages}
                onClick={() => setOffset(offset + PAGE_SIZE)}
              >
                Weiter
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
