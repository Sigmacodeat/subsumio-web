"use client";

/**
 * Mobile: Akten-Übersicht
 * Lists all matters with quick search, status filter, and tap-to-open.
 */

import { useState, useEffect, useMemo } from "react";
import { Search, FolderOpen, ChevronRight, AlertCircle, Loader2 } from "lucide-react";
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
  active: "var(--signal-success-500)",
  pending: "var(--signal-warning-500)",
  closed: "var(--ds-text-muted)",
  urgent: "var(--signal-danger-500)",
};

export default function MobileCasesPage() {
  const [matters, setMatters] = useState<Matter[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const pages = await api.brain.search("Akte Mandat Fall Klient", 100);
        if (cancelled) return;
        const parsed: Matter[] = pages.map((p) => {
          const r = p as unknown as Record<string, unknown>;
          const fm = (r.frontmatter ?? {}) as Record<string, unknown>;
          return {
            slug: String(r.slug ?? ""),
            title: String(r.title ?? ""),
            status: String(fm.status ?? r.status ?? "active"),
            client: String(fm.client ?? fm.klient ?? ""),
            legalArea: String(fm.legal_area ?? fm.rechtsgebiet ?? ""),
            updatedAt: String(r.updated_at ?? r.created_at ?? ""),
            urgent: Boolean(fm.urgent ?? false),
          };
        });
        if (!cancelled) setMatters(parsed);
      } catch (e) {
        if (!cancelled) console.error(e);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
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
      style={{
        display: "flex",
        flexDirection: "column",
        height: "100%",
        background: "var(--ds-bg)",
      }}
    >
      {/* Header */}
      <div style={{ padding: "14px 16px 10px", background: "var(--ds-surface)" }}>
        <h1 style={{ fontSize: 20, fontWeight: 700, color: "var(--ds-text)", marginBottom: 10 }}>
          Akten
        </h1>
        {/* Search */}
        <div style={{ position: "relative", marginBottom: 10 }}>
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
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Akte, Klient suchen…"
            style={
              {
                width: "100%",
                background: "var(--ds-surface-2)",
                border: "1px solid var(--ds-border)",
                borderRadius: 10,
                padding: "9px 12px 9px 32px",
                color: "var(--ds-text)",
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
                background: statusFilter === s ? "var(--brand-500)" : "var(--ds-border)",
                color: statusFilter === s ? "#fff" : "var(--ds-text-subtle)",
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
            <Loader2
              size={24}
              style={{ color: "var(--brand-500)", animation: "spin 1s linear infinite" }}
            />
          </div>
        ) : filtered.length === 0 ? (
          <div style={{ textAlign: "center", padding: "40px 20px", color: "var(--ds-text-muted)" }}>
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
                  borderBottom: "1px solid var(--ds-border)",
                  textDecoration: "none",
                  WebkitTapHighlightColor: "transparent",
                } as React.CSSProperties
              }
            >
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 3 }}>
                  {m.urgent && (
                    <AlertCircle
                      size={13}
                      style={{ color: "var(--signal-danger-500)", flexShrink: 0 }}
                    />
                  )}
                  <span
                    style={{
                      fontSize: 15,
                      fontWeight: 500,
                      color: "var(--ds-text)",
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
                    color: "var(--ds-text-muted)",
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
                    background: STATUS_COLORS[m.status] ?? "var(--ds-text-muted)",
                  }}
                />
                {m.updatedAt && (
                  <span style={{ fontSize: 10, color: "var(--ds-text-subtle)" }}>
                    {new Date(m.updatedAt).toLocaleDateString("de-AT", {
                      day: "2-digit",
                      month: "2-digit",
                    })}
                  </span>
                )}
              </div>
              <ChevronRight
                size={16}
                style={{ color: "var(--ds-text-subtle)", marginLeft: 6, flexShrink: 0 }}
              />
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
