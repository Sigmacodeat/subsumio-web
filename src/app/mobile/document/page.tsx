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
  Download,
} from "lucide-react";
import { api } from "@/lib/api";

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

  useEffect(() => {
    const debounce = setTimeout(async () => {
      if (!query.trim()) {
        setResults([]);
        return;
      }
      setLoading(true);
      try {
        const pages = await api.brain.search(query, 30);
        setResults(pages as unknown as BrainPage[]);
      } catch (e) {
        console.error(e);
      } finally {
        setLoading(false);
      }
    }, 400);
    return () => clearTimeout(debounce);
  }, [query]);

  const openDocument = async (page: BrainPage) => {
    setSelected(page);
    setFullContent(null);
    try {
      const detail = await api.brain.getPage(page.slug);
      setFullContent(
        (detail as unknown as BrainPage).content ?? page.snippet ?? "Kein Inhalt verfügbar."
      );
    } catch {
      setFullContent(page.snippet ?? "Kein Inhalt verfügbar.");
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
        style={{ display: "flex", flexDirection: "column", height: "100%", background: "#06060f" }}
      >
        {/* Header */}
        <div
          style={{
            padding: "12px 16px",
            background: "#0a0a18",
            borderBottom: "1px solid #1e1e3a",
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
              color: "#6366f1",
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
                color: "#e8e8f0",
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
            >
              {selected.title}
            </div>
            {selected.created_at && (
              <div style={{ fontSize: 11, color: "#6a6a8a" }}>
                {new Date(selected.created_at).toLocaleDateString("de-AT")}
              </div>
            )}
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <button
              onClick={share}
              disabled={sharing}
              style={{
                background: "#1e1e3a",
                border: "none",
                borderRadius: 8,
                padding: "7px 8px",
                cursor: "pointer",
                color: "#c0c0d8",
                display: "flex",
              }}
            >
              <Share2 size={16} />
            </button>
            <a
              href={`/dashboard/pages/${selected.slug}`}
              style={{
                background: "#1e1e3a",
                border: "none",
                borderRadius: 8,
                padding: "7px 8px",
                cursor: "pointer",
                color: "#c0c0d8",
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
          {!fullContent ? (
            <div style={{ display: "flex", justifyContent: "center", padding: 40 }}>
              <Loader2
                size={24}
                style={{ color: "#6366f1", animation: "spin 1s linear infinite" }}
              />
            </div>
          ) : (
            <div
              style={{
                fontSize: 14,
                lineHeight: 1.7,
                color: "#c0c0d8",
                whiteSpace: "pre-wrap",
                wordBreak: "break-word",
              }}
            >
              {fullContent}
            </div>
          )}
        </div>
      </div>
    );
  }

  // ── Search view ────────────────────────────────────────────────────

  return (
    <div
      style={{ display: "flex", flexDirection: "column", height: "100%", background: "#06060f" }}
    >
      {/* Header */}
      <div
        style={{
          padding: "14px 16px 12px",
          background: "#0a0a18",
          borderBottom: "1px solid #1e1e3a",
        }}
      >
        <h1 style={{ fontSize: 20, fontWeight: 700, color: "#e8e8f0", marginBottom: 10 }}>
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
              color: "#6a6a8a",
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
                color: "#6366f1",
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
                background: "#12122a",
                border: "1px solid #1e1e3a",
                borderRadius: 10,
                padding: "10px 36px",
                color: "#e8e8f0",
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
          <div style={{ textAlign: "center", padding: "50px 20px", color: "#6a6a8a" }}>
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
                borderBottom: "1px solid #0e0e20",
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
              style={{ color: "#6366f1", marginTop: 2, flexShrink: 0, marginRight: 10 }}
            />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div
                style={{
                  fontSize: 14,
                  fontWeight: 500,
                  color: "#e8e8f0",
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
                      color: "#6a6a8a",
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
                <div style={{ fontSize: 10, color: "#4a4a6a", marginTop: 4 }}>
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
