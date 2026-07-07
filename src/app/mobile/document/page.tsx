"use client";

/**
 * Mobile: Dokument-Viewer
 * Search brain, view document content, share via Capacitor Share.
 * Tap-to-read any page from the brain with full text.
 */

import { useState, useEffect } from "react";
import {
  Search,
  FileText,
  Share2,
  ChevronLeft,
  Loader2,
  ExternalLink,
  FileWarning,
  WifiOff,
} from "lucide-react";
import { api } from "@/lib/api";
import { PdfViewer } from "@/components/mobile/pdf-viewer";
import { getCache, setCache, OFFLINE_KEYS, isOnline } from "@/lib/offline-store";

interface BrainPage {
  slug: string;
  title: string;
  content?: string;
  snippet?: string;
  created_at?: string;
  type?: string;
  [key: string]: unknown;
}

export default function MobileDocumentPage() {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<BrainPage[]>([]);
  const [selected, setSelected] = useState<BrainPage | null>(null);
  const [loading, setLoading] = useState(false);
  const [fullContent, setFullContent] = useState<string | null>(null);
  const [sharing, setSharing] = useState(false);
  const [pdfOpen, setPdfOpen] = useState(false);
  const [pdfUrl, setPdfUrl] = useState("");
  const [pdfFilename, setPdfFilename] = useState("");
  const [loadError, setLoadError] = useState<string | null>(null);
  const [fromCache, setFromCache] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const debounce = setTimeout(async () => {
      if (!query.trim()) {
        if (!cancelled) setResults([]);
        return;
      }
      if (!cancelled) setLoading(true);
      try {
        const pages = await api.brain.search(query, 30);
        if (!cancelled) setResults(pages as unknown as BrainPage[]);
      } catch (e) {
        if (!cancelled) console.error(e);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }, 400);
    return () => {
      cancelled = true;
      clearTimeout(debounce);
    };
  }, [query]);

  const openDocument = async (page: BrainPage) => {
    setSelected(page);
    setFullContent(null);
    setLoadError(null);
    setFromCache(false);

    // Try cache first (offline support)
    const cacheKey = `${OFFLINE_KEYS.mobileDocPrefix}${page.slug}`;
    const cached = await getCache<{ content: string; title: string }>(cacheKey);
    if (cached) {
      setFromCache(true);
      setFullContent(cached.content);
    }

    if (!isOnline()) {
      if (!cached) {
        setLoadError("offline_no_cache");
      }
      return;
    }

    try {
      const detail = await api.brain.getPage(page.slug);
      const content =
        (detail as unknown as BrainPage).content ?? page.snippet ?? "Kein Inhalt verfügbar.";
      setFullContent(content);
      setFromCache(false);

      // Cache for offline access
      await setCache(cacheKey, { content, title: page.title });

      // Check if this is a PDF document
      const fm = (detail as unknown as { frontmatter?: Record<string, unknown> }).frontmatter;
      const fileUrl = fm?.file_url as string | undefined;
      const mimeType = fm?.mime_type as string | undefined;
      if (fileUrl && (mimeType === "application/pdf" || fileUrl.toLowerCase().endsWith(".pdf"))) {
        setPdfUrl(fileUrl);
        setPdfFilename(page.title);
      }
    } catch {
      if (!cached) {
        setLoadError("load_failed");
        setFullContent(page.snippet ?? "Kein Inhalt verfügbar.");
      }
    }
  };

  const share = async () => {
    if (!selected) return;
    setSharing(true);
    try {
      // Try Capacitor Share plugin first
      const { Share } = await import("@capacitor/share");
      await Share.share({
        title: selected.title,
        text: fullContent?.slice(0, 200) ?? selected.snippet ?? "",
        url: `${window.location.origin}/dashboard/pages/${selected.slug}`,
      });
    } catch {
      // Web fallback — copy to clipboard
      const text = `${selected.title}\n\n${window.location.origin}/dashboard/pages/${selected.slug}`;
      await navigator.clipboard.writeText(text).catch(() => {});
    } finally {
      setSharing(false);
    }
  };

  // ── Document detail view ───────────────────────────────────────────

  if (selected) {
    return (
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          height: "100%",
          background: "var(--ds-bg)",
        }}
      >
        {/* Header */}
        <div
          style={{
            padding: "12px 16px",
            background: "var(--ds-surface)",
            borderBottom: "1px solid var(--ds-border)",
            display: "flex",
            alignItems: "center",
            gap: 10,
          }}
        >
          <button
            onClick={() => {
              setSelected(null);
              setFullContent(null);
            }}
            style={{
              background: "none",
              border: "none",
              cursor: "pointer",
              color: "var(--brand-500)",
              padding: 0,
              display: "flex",
            }}
          >
            <ChevronLeft size={22} />
          </button>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div
              style={{
                fontSize: 14,
                fontWeight: 600,
                color: "var(--ds-text)",
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
            >
              {selected.title}
            </div>
            {selected.created_at && (
              <div style={{ fontSize: 11, color: "var(--ds-text-muted)" }}>
                {new Date(selected.created_at).toLocaleDateString("de-AT")}
              </div>
            )}
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            {pdfUrl && (
              <button
                onClick={() => setPdfOpen(true)}
                style={{
                  background: "var(--brand-500)",
                  border: "none",
                  borderRadius: 8,
                  padding: "7px 10px",
                  cursor: "pointer",
                  color: "#fff",
                  fontSize: 12,
                  fontWeight: 600,
                  display: "flex",
                  alignItems: "center",
                  gap: 4,
                }}
              >
                <FileText size={14} />
                PDF
              </button>
            )}
            <button
              onClick={share}
              disabled={sharing}
              style={{
                background: "var(--ds-border)",
                border: "none",
                borderRadius: 8,
                padding: "7px 8px",
                cursor: "pointer",
                color: "hsl(230, 8%, 80%)",
                display: "flex",
              }}
            >
              <Share2 size={16} />
            </button>
            <a
              href={`/dashboard/pages/${selected.slug}`}
              style={{
                background: "var(--ds-border)",
                border: "none",
                borderRadius: 8,
                padding: "7px 8px",
                cursor: "pointer",
                color: "hsl(230, 8%, 80%)",
                display: "flex",
                textDecoration: "none",
              }}
            >
              <ExternalLink size={16} />
            </a>
          </div>
        </div>

        {/* Content */}
        <div style={{ flex: 1, overflowY: "auto", padding: "16px" }}>
          {fromCache && (
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 6,
                padding: "8px 12px",
                marginBottom: 12,
                background: "hsla(40, 70%, 45%, 0.13)",
                border: "1px solid hsla(40, 70%, 45%, 0.19)",
                borderRadius: 8,
                fontSize: 12,
                color: "var(--signal-warning-500)",
              }}
            >
              <WifiOff size={13} />
              Offline-Cache — Inhalt vom letzten Aufruf
            </div>
          )}
          {loadError === "offline_no_cache" && (
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                gap: 12,
                padding: 40,
                textAlign: "center",
              }}
            >
              <FileWarning size={40} style={{ color: "var(--ds-text-muted)", opacity: 0.5 }} />
              <div style={{ fontSize: 14, color: "var(--ds-text-subtle)" }}>
                Offline — dieses Dokument wurde noch nicht geöffnet.
              </div>
            </div>
          )}
          {!loadError && !fullContent ? (
            <div style={{ display: "flex", justifyContent: "center", padding: 40 }}>
              <Loader2
                size={24}
                style={{ color: "var(--brand-500)", animation: "spin 1s linear infinite" }}
              />
            </div>
          ) : (
            <div
              style={{
                fontSize: 14,
                lineHeight: 1.7,
                color: "hsl(230, 8%, 80%)",
                whiteSpace: "pre-wrap",
                wordBreak: "break-word",
              }}
            >
              {fullContent}
            </div>
          )}
        </div>

        {pdfOpen && (
          <PdfViewer url={pdfUrl} filename={pdfFilename} open={pdfOpen} onOpenChange={setPdfOpen} />
        )}
      </div>
    );
  }

  // ── Search view ────────────────────────────────────────────────────

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        height: "100%",
        background: "var(--ds-bg)",
      }}
    >
      {/* Header */}
      <div
        style={{
          padding: "14px 16px 12px",
          background: "var(--ds-surface)",
          borderBottom: "1px solid var(--ds-border)",
        }}
      >
        <h1 style={{ fontSize: 20, fontWeight: 700, color: "var(--ds-text)", marginBottom: 10 }}>
          Dokumente
        </h1>
        <div style={{ position: "relative" }}>
          <Search
            size={15}
            style={{
              position: "absolute",
              left: 10,
              top: "50%",
              transform: "translateY(-50%)",
              color: "var(--ds-text-muted)",
            }}
          />
          {loading && (
            <Loader2
              size={14}
              style={{
                position: "absolute",
                right: 10,
                top: "50%",
                transform: "translateY(-50%)",
                color: "var(--brand-500)",
                animation: "spin 1s linear infinite",
              }}
            />
          )}
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Dokument suchen…"
            autoFocus
            style={
              {
                width: "100%",
                background: "var(--ds-surface-2)",
                border: "1px solid var(--ds-border)",
                borderRadius: 10,
                padding: "10px 36px",
                color: "var(--ds-text)",
                fontSize: 15,
                outline: "none",
                boxSizing: "border-box",
              } as React.CSSProperties
            }
          />
        </div>
      </div>

      <div style={{ flex: 1, overflowY: "auto" }}>
        {!query && (
          <div style={{ textAlign: "center", padding: "50px 20px", color: "var(--ds-text-muted)" }}>
            <FileText size={32} style={{ margin: "0 auto 12px", opacity: 0.3 }} />
            <div style={{ fontSize: 14 }}>Suchbegriff eingeben</div>
            <div style={{ fontSize: 12, marginTop: 4 }}>Verträge, Urteile, Notizen, Memos…</div>
          </div>
        )}
        {results.map((page) => (
          <button
            key={page.slug}
            onClick={() => openDocument(page)}
            style={
              {
                width: "100%",
                display: "flex",
                alignItems: "flex-start",
                padding: "13px 16px",
                borderBottom: "1px solid hsl(230, 10%, 12%)",
                background: "none",
                border: "none",
                cursor: "pointer",
                textAlign: "left",
                WebkitTapHighlightColor: "transparent",
              } as React.CSSProperties
            }
          >
            <FileText
              size={16}
              style={{ color: "var(--brand-500)", marginTop: 2, flexShrink: 0, marginRight: 10 }}
            />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div
                style={{
                  fontSize: 14,
                  fontWeight: 500,
                  color: "var(--ds-text)",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                  marginBottom: 3,
                }}
              >
                {page.title}
              </div>
              {page.snippet && (
                <div
                  style={
                    {
                      fontSize: 12,
                      color: "var(--ds-text-muted)",
                      overflow: "hidden",
                      display: "-webkit-box",
                      WebkitLineClamp: 2,
                      WebkitBoxOrient: "vertical",
                    } as React.CSSProperties
                  }
                >
                  {page.snippet}
                </div>
              )}
              {page.created_at && (
                <div style={{ fontSize: 10, color: "hsl(230, 8%, 35%)", marginTop: 4 }}>
                  {new Date(page.created_at).toLocaleDateString("de-AT")}
                </div>
              )}
            </div>
          </button>
        ))}
      </div>
      <style jsx global>{`
        @keyframes spin {
          to {
            transform: rotate(360deg);
          }
        }
      `}</style>
    </div>
  );
}
