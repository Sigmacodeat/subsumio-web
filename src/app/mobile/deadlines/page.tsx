"use client";

/**
 * Mobile: Fristen-Übersicht
 * Shows upcoming deadlines sorted by urgency with overdue alerts.
 * Pulls from /api/legal/ai-deadlines.
 */

import { useState, useEffect, useMemo } from "react";
import {
  CalendarClock,
  AlertTriangle,
  CheckCircle2,
  Clock,
  ChevronRight,
  Loader2,
} from "lucide-react";

interface Deadline {
  id: string;
  title: string;
  dueDate: string;
  matter?: string;
  type: string;
  priority: "critical" | "high" | "medium" | "low";
  done: boolean;
}

const PRIORITY_COLORS = { critical: "#ef4444", high: "#f59e0b", medium: "#6366f1", low: "#6a6a8a" };
const PRIORITY_LABELS = { critical: "Kritisch", high: "Hoch", medium: "Mittel", low: "Niedrig" };

function daysUntil(dateStr: string): number {
  const diff = new Date(dateStr).getTime() - Date.now();
  return Math.ceil(diff / 86_400_000);
}

export default function MobileDeadlinesPage() {
  const [deadlines, setDeadlines] = useState<Deadline[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<"all" | "overdue" | "today" | "week">("all");

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/legal/ai-deadlines?limit=100", {
          signal: AbortSignal.timeout(15_000),
        });
        if (res.ok) {
          const data = (await res.json()) as { deadlines?: Deadline[]; results?: Deadline[] };
          setDeadlines(data.deadlines ?? data.results ?? []);
        }
      } catch (e) {
        console.error(e);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const filtered = useMemo(() => {
    const now = Date.now();
    return deadlines
      .filter((d) => {
        if (d.done) return false;
        const days = daysUntil(d.dueDate);
        if (filter === "overdue") return days < 0;
        if (filter === "today") return days === 0;
        if (filter === "week") return days >= 0 && days <= 7;
        return true;
      })
      .sort((a, b) => new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime());
  }, [deadlines, filter]);

  const overdueCount = deadlines.filter((d) => !d.done && daysUntil(d.dueDate) < 0).length;
  const todayCount = deadlines.filter((d) => !d.done && daysUntil(d.dueDate) === 0).length;

  return (
    <div
      style={{ display: "flex", flexDirection: "column", height: "100%", background: "#06060f" }}
    >
      {/* Header */}
      <div style={{ padding: "14px 16px 10px", background: "#0a0a18" }}>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            marginBottom: 10,
          }}
        >
          <h1 style={{ fontSize: 20, fontWeight: 700, color: "#e8e8f0" }}>Fristen</h1>
          {overdueCount > 0 && (
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 5,
                background: "#ef444415",
                border: "1px solid #ef444430",
                borderRadius: 20,
                padding: "3px 10px",
              }}
            >
              <AlertTriangle size={12} style={{ color: "#ef4444" }} />
              <span style={{ fontSize: 12, color: "#ef4444", fontWeight: 600 }}>
                {overdueCount} überfällig
              </span>
            </div>
          )}
        </div>

        {/* Urgency summary pills */}
        <div style={{ display: "flex", gap: 8, marginBottom: 10 }}>
          <div
            style={{
              flex: 1,
              background: "#1a0a0a",
              border: "1px solid #ef444430",
              borderRadius: 8,
              padding: "8px 10px",
              textAlign: "center",
            }}
          >
            <div style={{ fontSize: 18, fontWeight: 700, color: "#ef4444" }}>{overdueCount}</div>
            <div style={{ fontSize: 10, color: "#8a3a3a" }}>Überfällig</div>
          </div>
          <div
            style={{
              flex: 1,
              background: "#1a140a",
              border: "1px solid #f59e0b30",
              borderRadius: 8,
              padding: "8px 10px",
              textAlign: "center",
            }}
          >
            <div style={{ fontSize: 18, fontWeight: 700, color: "#f59e0b" }}>{todayCount}</div>
            <div style={{ fontSize: 10, color: "#8a7a3a" }}>Heute</div>
          </div>
          <div
            style={{
              flex: 1,
              background: "#0a0a1a",
              border: "1px solid #6366f130",
              borderRadius: 8,
              padding: "8px 10px",
              textAlign: "center",
            }}
          >
            <div style={{ fontSize: 18, fontWeight: 700, color: "#6366f1" }}>
              {
                deadlines.filter(
                  (d) => !d.done && daysUntil(d.dueDate) >= 1 && daysUntil(d.dueDate) <= 7
                ).length
              }
            </div>
            <div style={{ fontSize: 10, color: "#5a5a8a" }}>7 Tage</div>
          </div>
        </div>

        {/* Filter pills */}
        <div style={{ display: "flex", gap: 6 }}>
          {(["all", "overdue", "today", "week"] as const).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              style={{
                padding: "4px 11px",
                borderRadius: 20,
                fontSize: 12,
                border: "none",
                background: filter === f ? "#6366f1" : "#1e1e3a",
                color: filter === f ? "#fff" : "#8a8aa8",
                cursor: "pointer",
              }}
            >
              {{ all: "Alle", overdue: "Überfällig", today: "Heute", week: "7 Tage" }[f]}
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
            <CheckCircle2 size={32} style={{ margin: "0 auto 10px", opacity: 0.4 }} />
            <div style={{ fontSize: 14 }}>Keine Fristen in diesem Zeitraum</div>
          </div>
        ) : (
          filtered.map((d) => {
            const days = daysUntil(d.dueDate);
            const overdue = days < 0;
            const color = overdue ? "#ef4444" : PRIORITY_COLORS[d.priority];
            return (
              <div
                key={d.id}
                style={{
                  display: "flex",
                  alignItems: "center",
                  padding: "13px 16px",
                  borderBottom: "1px solid #0e0e20",
                }}
              >
                <div
                  style={{
                    width: 3,
                    height: 44,
                    borderRadius: 2,
                    background: color,
                    marginRight: 12,
                    flexShrink: 0,
                  }}
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
                    {d.title}
                  </div>
                  <div style={{ fontSize: 11, color: "#6a6a8a" }}>
                    {d.matter && <span>{d.matter} · </span>}
                    <span>
                      {new Date(d.dueDate).toLocaleDateString("de-AT", {
                        weekday: "short",
                        day: "2-digit",
                        month: "short",
                      })}
                    </span>
                  </div>
                </div>
                <div style={{ textAlign: "right", flexShrink: 0, marginLeft: 10 }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color }}>
                    {overdue ? `${Math.abs(days)}d überfällig` : days === 0 ? "Heute" : `${days}d`}
                  </div>
                  <div style={{ fontSize: 10, color: "#4a4a6a" }}>
                    {PRIORITY_LABELS[d.priority]}
                  </div>
                </div>
              </div>
            );
          })
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
