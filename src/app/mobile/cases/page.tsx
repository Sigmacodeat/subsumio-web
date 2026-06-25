"use client";

/**
 * Mobile: Akten-Übersicht
 * Lists all matters with quick search, status filter, and tap-to-open.
 */

import { useState, useEffect, useMemo } from "react";
import {
  Search,
  FolderOpen,
  Clock,
  ChevronRight,
  AlertCircle,
  CheckCircle2,
  Loader2,
} from "lucide-react";
import { api } from "@/lib/api";

interface Matter {
  slug: string;
  title: string;
  status: string;
  client?: string;
  legalArea?: string;
  updatedAt?: string;
  urgent?: boolean;
}

const STATUS_COLORS: Record<string, string> = {
  active: "#22c55e",
  pending: "#f59e0b",
  closed: "#6a6a8a",
  urgent: "#ef4444",
};

export default function MobileCasesPage() {
  const [matters, setMatters] = useState<Matter[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");

  useEffect(() => {
    (async () => {
      try {
        const pages = await api.brain.search("Akte Mandat Fall Klient", 100);
        const parsed: Matter[] = pages.map((p: Record<string, unknown>) => {
          const fm = (p.frontmatter ?? {}) as Record<string, unknown>;
          return {
            slug: String(p.slug ?? ""),
            title: String(p.title ?? ""),
            status: String(fm.status ?? p.status ?? "active"),
            client: String(fm.client ?? fm.klient ?? ""),
            legalArea: String(fm.legal_area ?? fm.rechtsgebiet ?? ""),
            updatedAt: String(p.updated_at ?? p.created_at ?? ""),
            urgent: Boolean(fm.urgent ?? false),
          };
        });
        setMatters(parsed);
      } catch (e) {
        console.error(e);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const filtered = useMemo(() => {
    return matters.filter((m) => {
      if (statusFilter !== "all" && m.status !== statusFilter) return false;
      if (search) {
        const q = search.toLowerCase();
        return m.title.toLowerCase().includes(q) || (m.client?.toLowerCase().includes(q) ?? false);
      }
      return true;
    });
  }, [matters, search, statusFilter]);

  return (
    <div
      style={{ display: "flex", flexDirection: "column", height: "100%", background: "#06060f" }}
    >
      {/* Header */}
      <div style={{ padding: "14px 16px 10px", background: "#0a0a18" }}>
        <h1 style={{ fontSize: 20, fontWeight: 700, color: "#e8e8f0", marginBottom: 10 }}>Akten</h1>
        {/* Search */}
        <div style={{ position: "relative", marginBottom: 10 }}>
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
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Akte, Klient suchen…"
            style={
              {
                width: "100%",
                background: "#12122a",
                border: "1px solid #1e1e3a",
                borderRadius: 10,
                padding: "9px 12px 9px 32px",
                color: "#e8e8f0",
                fontSize: 15,
                outline: "none",
                boxSizing: "border-box",
              } as React.CSSProperties
            }
          />
        </div>
        {/* Status filter pills */}
        <div style={{ display: "flex", gap: 6, overflowX: "auto", paddingBottom: 2 }}>
          {["all", "active", "pending", "closed"].map((s) => (
            <button
              key={s}
              onClick={() => setStatusFilter(s)}
              style={{
                padding: "4px 12px",
                borderRadius: 20,
                fontSize: 12,
                border: "none",
                background: statusFilter === s ? "#6366f1" : "#1e1e3a",
                color: statusFilter === s ? "#fff" : "#8a8aa8",
                cursor: "pointer",
                whiteSpace: "nowrap",
                flexShrink: 0,
              }}
            >
              {{ all: "Alle", active: "Aktiv", pending: "Ausstehend", closed: "Geschlossen" }[s]}
            </button>
          ))}
        </div>
      </div>

      {/* List */}
      <div style={{ flex: 1, overflowY: "auto" }}>
        {loading ? (
          <div style={{ display: "flex", justifyContent: "center", padding: 40 }}>
            <Loader2 size={24} style={{ color: "#6366f1", animation: "spin 1s linear infinite" }} />
          </div>
        ) : filtered.length === 0 ? (
          <div style={{ textAlign: "center", padding: "40px 20px", color: "#6a6a8a" }}>
            <FolderOpen size={32} style={{ margin: "0 auto 10px", opacity: 0.4 }} />
            <div style={{ fontSize: 14 }}>Keine Akten gefunden</div>
          </div>
        ) : (
          filtered.map((m) => (
            <a
              key={m.slug}
              href={`/dashboard/matters/${m.slug}`}
              style={
                {
                  display: "flex",
                  alignItems: "center",
                  padding: "13px 16px",
                  borderBottom: "1px solid #0e0e20",
                  textDecoration: "none",
                  WebkitTapHighlightColor: "transparent",
                } as React.CSSProperties
              }
            >
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 3 }}>
                  {m.urgent && (
                    <AlertCircle size={13} style={{ color: "#ef4444", flexShrink: 0 }} />
                  )}
                  <span
                    style={{
                      fontSize: 15,
                      fontWeight: 500,
                      color: "#e8e8f0",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {m.title}
                  </span>
                </div>
                <div
                  style={{
                    fontSize: 12,
                    color: "#6a6a8a",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  }}
                >
                  {m.client && <span>{m.client}</span>}
                  {m.client && m.legalArea && <span> · </span>}
                  {m.legalArea && <span>{m.legalArea}</span>}
                </div>
              </div>
              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "flex-end",
                  gap: 4,
                  marginLeft: 10,
                  flexShrink: 0,
                }}
              >
                <div
                  style={{
                    width: 8,
                    height: 8,
                    borderRadius: "50%",
                    background: STATUS_COLORS[m.status] ?? "#6a6a8a",
                  }}
                />
                {m.updatedAt && (
                  <span style={{ fontSize: 10, color: "#4a4a6a" }}>
                    {new Date(m.updatedAt).toLocaleDateString("de-AT", {
                      day: "2-digit",
                      month: "2-digit",
                    })}
                  </span>
                )}
              </div>
              <ChevronRight size={16} style={{ color: "#2e2e5a", marginLeft: 6, flexShrink: 0 }} />
            </a>
          ))
        )}
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
