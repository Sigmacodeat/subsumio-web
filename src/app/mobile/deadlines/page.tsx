"use client";

/**
 * Mobile: Fristen-Übersicht
 * Shows upcoming deadlines sorted by urgency with overdue alerts.
 * Pulls from /api/legal/ai-deadlines.
 */

import { useState, useEffect, useMemo } from "react";
import { AlertTriangle, CheckCircle2, Loader2 } from "lucide-react";

interface Deadline {
  id: string;
  title: string;
  dueDate: string;
  matter?: string;
  type: string;
  priority: "critical" | "high" | "medium" | "low";
  done: boolean;
}

const PRIORITY_COLORS = {
  critical: "var(--signal-danger-500)",
  high: "var(--signal-warning-500)",
  medium: "var(--brand-500)",
  low: "var(--ds-text-muted)",
};
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
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/legal/ai-deadlines?limit=100", {
          signal: AbortSignal.timeout(15_000),
        });
        if (res.ok) {
          const data = (await res.json()) as { deadlines?: Deadline[]; results?: Deadline[] };
          if (!cancelled) setDeadlines(data.deadlines ?? data.results ?? []);
        }
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
      style={{
        display: "flex",
        flexDirection: "column",
        height: "100%",
        background: "var(--ds-bg)",
      }}
    >
      {/* Header */}
      <div style={{ padding: "14px 16px 10px", background: "var(--ds-surface)" }}>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            marginBottom: 10,
          }}
        >
          <h1 style={{ fontSize: 20, fontWeight: 700, color: "var(--ds-text)" }}>Fristen</h1>
          {overdueCount > 0 && (
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 5,
                background: "var(--ds-danger-bg)",
                border: "1px solid var(--ds-danger-border)",
                borderRadius: 20,
                padding: "3px 10px",
              }}
            >
              <AlertTriangle size={12} style={{ color: "var(--signal-danger-500)" }} />
              <span style={{ fontSize: 12, color: "var(--signal-danger-500)", fontWeight: 600 }}>
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
              background: "var(--ds-danger-bg)",
              border: "1px solid var(--ds-danger-border)",
              borderRadius: 8,
              padding: "8px 10px",
              textAlign: "center",
            }}
          >
            <div style={{ fontSize: 18, fontWeight: 700, color: "var(--signal-danger-500)" }}>
              {overdueCount}
            </div>
            <div style={{ fontSize: 10, color: "var(--signal-danger-500)" }}>Überfällig</div>
          </div>
          <div
            style={{
              flex: 1,
              background: "var(--ds-warning-bg)",
              border: "1px solid var(--ds-warning-border)",
              borderRadius: 8,
              padding: "8px 10px",
              textAlign: "center",
            }}
          >
            <div style={{ fontSize: 18, fontWeight: 700, color: "var(--signal-warning-500)" }}>
              {todayCount}
            </div>
            <div style={{ fontSize: 10, color: "var(--signal-warning-500)" }}>Heute</div>
          </div>
          <div
            style={{
              flex: 1,
              background: "var(--ds-info-bg)",
              border: "1px solid var(--ds-info-border)",
              borderRadius: 8,
              padding: "8px 10px",
              textAlign: "center",
            }}
          >
            <div style={{ fontSize: 18, fontWeight: 700, color: "var(--brand-500)" }}>
              {
                deadlines.filter(
                  (d) => !d.done && daysUntil(d.dueDate) >= 1 && daysUntil(d.dueDate) <= 7
                ).length
              }
            </div>
            <div style={{ fontSize: 10, color: "var(--ds-text-subtle)" }}>7 Tage</div>
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
                background: filter === f ? "var(--brand-500)" : "var(--ds-border)",
                color: filter === f ? "#fff" : "var(--ds-text-subtle)",
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
            <Loader2
              size={24}
              style={{ color: "var(--brand-500)", animation: "spin 1s linear infinite" }}
            />
          </div>
        ) : filtered.length === 0 ? (
          <div style={{ textAlign: "center", padding: "40px 20px", color: "var(--ds-text-muted)" }}>
            <CheckCircle2 size={32} style={{ margin: "0 auto 10px", opacity: 0.4 }} />
            <div style={{ fontSize: 14 }}>Keine Fristen in diesem Zeitraum</div>
          </div>
        ) : (
          filtered.map((d) => {
            const days = daysUntil(d.dueDate);
            const overdue = days < 0;
            const color = overdue ? "var(--signal-danger-500)" : PRIORITY_COLORS[d.priority];
            return (
              <div
                key={d.id}
                style={{
                  display: "flex",
                  alignItems: "center",
                  padding: "13px 16px",
                  borderBottom: "1px solid var(--ds-border)",
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
                      color: "var(--ds-text)",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                      marginBottom: 3,
                    }}
                  >
                    {d.title}
                  </div>
                  <div style={{ fontSize: 11, color: "var(--ds-text-muted)" }}>
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
                  <div style={{ fontSize: 10, color: "var(--ds-text-subtle)" }}>
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
