"use client";

/**
 * DmsBrowserDialog — Durchsucht das angebundene DMS (SharePoint/OneDrive,
 * iManage, NetDocuments) und importiert Dokumente in den Vault.
 *
 * Sichtbar nur wenn der Connector serverseitig konfiguriert ist — ohne Config
 * zeigt der Dialog einen ehrlichen Hinweis statt einer leeren Liste.
 */

import { useCallback, useEffect, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/components/ui/toast";
import { api } from "@/lib/api";
import {
  Folder,
  FileText,
  Search,
  Loader2,
  Download,
  CheckCircle2,
  CloudOff,
  ChevronRight,
  ArrowLeft,
} from "lucide-react";

type DmsDoc = {
  id: string;
  name: string;
  type: string;
  author: string;
  modifiedDate: string;
  size?: number;
  version?: string;
};
type DmsFolder = { id: string; name: string; path: string; documentCount?: number };

interface DmsBrowserDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Nach erfolgreichem Import — z. B. Vault-Liste neu laden. */
  onImported?: (slug: string) => void;
}

const PROVIDER_LABEL: Record<string, string> = {
  sharepoint: "SharePoint / OneDrive",
  imanage: "iManage",
  netdocuments: "NetDocuments",
};

function formatSize(bytes?: number): string {
  if (!bytes) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function DmsBrowserDialog({ open, onOpenChange, onImported }: DmsBrowserDialogProps) {
  const { addToast } = useToast();
  const [status, setStatus] = useState<"loading" | "ready" | "unconfigured">("loading");
  const [provider, setProvider] = useState<string>("");
  const [query, setQuery] = useState("");
  const [folderStack, setFolderStack] = useState<DmsFolder[]>([]);
  const [docs, setDocs] = useState<DmsDoc[]>([]);
  const [folders, setFolders] = useState<DmsFolder[]>([]);
  const [searching, setSearching] = useState(false);
  const [importing, setImporting] = useState<string | null>(null);
  const [imported, setImported] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);

  const browse = useCallback(async (folderId?: string, q?: string) => {
    setSearching(true);
    setError(null);
    try {
      const res = await api.dms.search({ q: q ?? "", folderId, limit: 50 });
      setDocs(res.documents);
      setFolders(res.folders);
    } catch {
      setError("Das DMS konnte nicht durchsucht werden. Bitte später erneut versuchen.");
    } finally {
      setSearching(false);
    }
  }, []);

  useEffect(() => {
    if (!open) return;
    setStatus("loading");
    api.dms
      .status()
      .then((s) => {
        if (!s.configured || !s.ready) {
          setStatus("unconfigured");
          return;
        }
        setProvider(s.provider ?? "");
        setStatus("ready");
        setFolderStack([]);
        setQuery("");
        setImported(new Set());
        void browse();
      })
      .catch(() => setStatus("unconfigured"));
  }, [open, browse]);

  function openFolder(folder: DmsFolder) {
    setFolderStack((s) => [...s, folder]);
    void browse(folder.id);
  }

  function goBack() {
    const next = folderStack.slice(0, -1);
    setFolderStack(next);
    void browse(next[next.length - 1]?.id);
  }

  async function importDoc(doc: DmsDoc) {
    setImporting(doc.id);
    try {
      const res = await api.dms.import(doc.id);
      if (res.success) {
        setImported((s) => new Set(s).add(doc.id));
        addToast({ type: "success", description: `„${doc.name}“ wurde importiert.` });
        onImported?.(res.slug);
      } else {
        addToast({ type: "error", description: `Import von „${doc.name}“ fehlgeschlagen.` });
      }
    } catch {
      addToast({ type: "error", description: `Import von „${doc.name}“ fehlgeschlagen.` });
    } finally {
      setImporting(null);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[80vh] max-w-2xl flex-col">
        <DialogHeader>
          <DialogTitle>Aus DMS importieren</DialogTitle>
          <DialogDescription>
            {PROVIDER_LABEL[provider] ?? "Dokumentenverwaltung"} durchsuchen und Dokumente in den
            Vault übernehmen.
          </DialogDescription>
        </DialogHeader>

        {status === "loading" && (
          <div className="flex items-center justify-center py-12" role="status">
            <Loader2 size={24} className="animate-spin text-[color:var(--ds-text-muted)]" />
          </div>
        )}

        {status === "unconfigured" && (
          <div className="flex flex-col items-center gap-3 py-10 text-center">
            <CloudOff size={32} className="text-[color:var(--ds-text-muted)]" aria-hidden="true" />
            <p className="max-w-sm text-sm text-[color:var(--ds-text-muted)]">
              Es ist kein Dokumentenmanagementsystem eingerichtet. Ihr technischer Betreuer kann
              SharePoint/OneDrive, iManage oder NetDocuments über die Server-Konfiguration anbinden.
            </p>
          </div>
        )}

        {status === "ready" && (
          <>
            <form
              className="flex gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                setFolderStack([]);
                void browse(undefined, query);
              }}
            >
              <div className="relative flex-1">
                <Search
                  size={14}
                  className="absolute top-1/2 left-3 -translate-y-1/2 text-[color:var(--ds-text-muted)]"
                  aria-hidden="true"
                />
                <Input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Dokumente suchen …"
                  className="pl-8"
                  aria-label="DMS durchsuchen"
                />
              </div>
              <Button type="submit" variant="secondary" disabled={searching}>
                Suchen
              </Button>
            </form>

            {/* Breadcrumb */}
            <div className="flex items-center gap-1 text-xs text-[color:var(--ds-text-muted)]">
              <button
                type="button"
                className="hover:text-[color:var(--ds-text)] hover:underline"
                onClick={() => {
                  setFolderStack([]);
                  void browse();
                }}
              >
                Stamm
              </button>
              {folderStack.map((f, i) => (
                <span key={f.id} className="flex items-center gap-1">
                  <ChevronRight size={10} aria-hidden="true" />
                  <span className={i === folderStack.length - 1 ? "font-medium" : ""}>
                    {f.name}
                  </span>
                </span>
              ))}
              {folderStack.length > 0 && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="ml-auto h-6 gap-1 text-xs"
                  onClick={goBack}
                >
                  <ArrowLeft size={10} /> Zurück
                </Button>
              )}
            </div>

            {error && (
              <div
                role="alert"
                className="rounded-lg border border-[color:var(--ds-danger-border)] bg-[color:var(--ds-danger-bg)] px-3 py-2 text-sm text-[color:var(--ds-danger-text)]"
              >
                {error}
              </div>
            )}

            <div className="min-h-0 flex-1 overflow-y-auto rounded-lg border border-[color:var(--ds-border)]">
              {searching ? (
                <div className="flex items-center justify-center py-10" role="status">
                  <Loader2 size={20} className="animate-spin text-[color:var(--ds-text-muted)]" />
                </div>
              ) : folders.length === 0 && docs.length === 0 ? (
                <div className="py-10 text-center text-sm text-[color:var(--ds-text-muted)]">
                  {query ? "Keine Treffer für diese Suche." : "Dieser Ordner ist leer."}
                </div>
              ) : (
                <ul className="divide-y divide-[color:var(--ds-border)]">
                  {folders.map((f) => (
                    <li key={f.id}>
                      <button
                        type="button"
                        className="flex w-full items-center gap-3 px-3 py-2.5 text-left transition-colors hover:bg-[color:var(--ds-surface-2)]"
                        onClick={() => openFolder(f)}
                      >
                        <Folder
                          size={16}
                          className="shrink-0 text-[color:var(--ds-warning-text)]"
                          aria-hidden="true"
                        />
                        <span className="min-w-0 flex-1 truncate text-sm font-medium text-[color:var(--ds-text)]">
                          {f.name}
                        </span>
                        {f.documentCount != null && (
                          <Badge variant="default">{f.documentCount}</Badge>
                        )}
                        <ChevronRight
                          size={14}
                          className="text-[color:var(--ds-text-muted)]"
                          aria-hidden="true"
                        />
                      </button>
                    </li>
                  ))}
                  {docs.map((d) => (
                    <li key={d.id} className="flex items-center gap-3 px-3 py-2.5">
                      <FileText
                        size={16}
                        className="shrink-0 text-[color:var(--ds-text-muted)]"
                        aria-hidden="true"
                      />
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-sm font-medium text-[color:var(--ds-text)]">
                          {d.name}
                        </div>
                        <div className="mt-0.5 flex gap-2 text-xs text-[color:var(--ds-text-muted)]">
                          {d.author && <span>{d.author}</span>}
                          {d.modifiedDate && (
                            <span>{new Date(d.modifiedDate).toLocaleDateString("de-AT")}</span>
                          )}
                          {d.size != null && <span>{formatSize(d.size)}</span>}
                          {d.version && <span>v{d.version}</span>}
                        </div>
                      </div>
                      {imported.has(d.id) ? (
                        <Badge variant="success" className="gap-1">
                          <CheckCircle2 size={11} aria-hidden="true" /> Importiert
                        </Badge>
                      ) : (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="gap-1 text-xs"
                          disabled={importing === d.id}
                          onClick={() => importDoc(d)}
                          aria-label={`${d.name} importieren`}
                        >
                          {importing === d.id ? (
                            <Loader2 size={12} className="animate-spin" />
                          ) : (
                            <Download size={12} aria-hidden="true" />
                          )}
                          Importieren
                        </Button>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
