"use client";

/**
 * Mobile: Zeiterfassung (Time Entry)
 * Start/stop timer, manual entry, select matter, save to brain.
 * Integrates with /api/timetracking if available, falls back to brain pages.
 */

import { useState, useEffect, useRef } from "react";
import {
  Play,
  Pause,
  Square,
  Save,
  Loader2,
  CheckCircle2,
  FolderOpen,
  AlertCircle,
  RefreshCw,
} from "lucide-react";
import { api } from "@/lib/api";
import { isOnline, enqueueMutation } from "@/lib/offline-store";

function formatDuration(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

export default function MobileTimePage() {
  const [running, setRunning] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [startTime, setStartTime] = useState<Date | null>(null);
  const [description, setDescription] = useState("");
  const [matter, setMatter] = useState("");
  const [manualHours, setManualHours] = useState("");
  const [manualMinutes, setManualMinutes] = useState("");
  const [mode, setMode] = useState<"timer" | "manual">("timer");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [pendingSync, setPendingSync] = useState(false);
  const [todayEntries, setTodayEntries] = useState<
    { duration: number; description: string; matter?: string }[]
  >([]);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (running) {
      intervalRef.current = setInterval(() => setElapsed((e) => e + 1), 1000);
    } else {
      if (intervalRef.current) clearInterval(intervalRef.current);
    }
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [running]);

  const totalTodaySecs = todayEntries.reduce((sum, e) => sum + e.duration, 0);

  const start = () => {
    setStartTime(new Date());
    setElapsed(0);
    setRunning(true);
    setSaved(false);
  };

  const pause = () => setRunning(false);
  const resume = () => setRunning(true);

  const stop = () => {
    setRunning(false);
  };

  const save = async () => {
    const durationSecs =
      mode === "timer"
        ? elapsed
        : parseInt(manualHours || "0") * 3600 + parseInt(manualMinutes || "0") * 60;

    if (durationSecs === 0) return;
    setSaving(true);
    setSaveError(null);
    const durationHours = durationSecs / 3600;
    const now = new Date();
    try {
      // Try dedicated timetracking API first
      const ttRes = await fetch("/api/timetracking", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          matter_slug: matter || undefined,
          description: description || "Zeiteintrag",
          duration_hours: durationHours,
          date: now.toISOString().split("T")[0],
          started_at: startTime?.toISOString() ?? now.toISOString(),
        }),
        signal: AbortSignal.timeout(15_000),
      });

      // Fallback: save as brain page
      if (!ttRes.ok) {
        await api.brain.createPage({
          slug: `time-${Date.now()}`,
          title: `Zeit ${now.toLocaleDateString("de-AT")} — ${description || "Zeiteintrag"}`,
          content: `## Zeiteintrag\n\n**Dauer:** ${formatDuration(durationSecs)}\n**Beschreibung:** ${description || "—"}\n**Akte:** ${matter || "—"}\n**Datum:** ${now.toLocaleDateString("de-AT")}`,
          type: "time_entry",
          frontmatter: {
            type: "time_entry",
            date: now.toISOString().split("T")[0],
            matter: matter || undefined,
            description: description || "Zeiteintrag",
            duration_hours: durationHours,
            started_at: startTime?.toISOString(),
          },
        });
      }

      setTodayEntries((prev) => [
        ...prev,
        {
          duration: durationSecs,
          description: description || "Zeiteintrag",
          matter: matter || undefined,
        },
      ]);
      setSaved(true);
      setElapsed(0);
      setStartTime(null);
      setDescription("");
      setManualHours("");
      setManualMinutes("");
      setSaveError(null);
      setPendingSync(false);
      setTimeout(() => setSaved(false), 2000);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Speichern fehlgeschlagen";
      setSaveError(msg);
      // Store offline for later sync
      if (!isOnline()) {
        try {
          await enqueueMutation({
            type: "createPage",
            payload: {
              slug: `time-${Date.now()}`,
              title: `Zeit ${now.toLocaleDateString("de-AT")} — ${description || "Zeiteintrag"}`,
              content: `## Zeiteintrag\n\n**Dauer:** ${formatDuration(durationSecs)}\n**Beschreibung:** ${description || "—"}\n**Akte:** ${matter || "—"}\n**Datum:** ${now.toLocaleDateString("de-AT")}`,
              type: "time_entry",
              frontmatter: {
                type: "time_entry",
                date: now.toISOString().split("T")[0],
                matter: matter || undefined,
                description: description || "Zeiteintrag",
                duration_hours: durationHours,
                started_at: startTime?.toISOString(),
              },
            },
          });
          setPendingSync(true);
        } catch {
          // offline store also failed — nothing more we can do
        }
      }
    } finally {
      setSaving(false);
    }
  };

  const currentSecs =
    mode === "timer"
      ? elapsed
      : parseInt(manualHours || "0") * 3600 + parseInt(manualMinutes || "0") * 60;

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
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <h1 style={{ fontSize: 20, fontWeight: 700, color: "var(--ds-text)" }}>Zeiterfassung</h1>
          <div style={{ fontSize: 12, color: "var(--ds-text-muted)" }}>
            Heute:{" "}
            <span style={{ color: "var(--brand-500)", fontWeight: 600 }}>
              {formatDuration(totalTodaySecs)}
            </span>
          </div>
        </div>

        {/* Mode toggle */}
        <div style={{ display: "flex", gap: 6, marginTop: 10 }}>
          {(["timer", "manual"] as const).map((m) => (
            <button
              key={m}
              onClick={() => {
                setMode(m);
                setRunning(false);
                setElapsed(0);
              }}
              style={{
                padding: "4px 14px",
                borderRadius: 20,
                fontSize: 12,
                border: "none",
                cursor: "pointer",
                background: mode === m ? "var(--brand-500)" : "var(--ds-border)",
                color: mode === m ? "#fff" : "var(--ds-text-subtle)",
              }}
            >
              {m === "timer" ? "Timer" : "Manuell"}
            </button>
          ))}
        </div>
      </div>

      <div style={{ flex: 1, overflowY: "auto", padding: "16px" }}>
        {/* Timer display */}
        <div style={{ textAlign: "center", padding: "20px 0 16px" }}>
          {mode === "timer" ? (
            <>
              <div
                style={{
                  fontSize: 56,
                  fontWeight: 700,
                  fontVariantNumeric: "tabular-nums",
                  color: running ? "var(--brand-500)" : "var(--ds-text)",
                  letterSpacing: "-1px",
                  lineHeight: 1,
                }}
              >
                {formatDuration(elapsed)}
              </div>
              {running && (
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: 5,
                    marginTop: 6,
                  }}
                >
                  <div
                    style={{
                      width: 6,
                      height: 6,
                      borderRadius: "50%",
                      background: "var(--signal-danger-500)",
                      animation: "pulse 1s infinite",
                    }}
                  />
                  <span style={{ fontSize: 12, color: "var(--ds-text-subtle)" }}>
                    Läuft seit{" "}
                    {startTime?.toLocaleTimeString("de-AT", { hour: "2-digit", minute: "2-digit" })}
                  </span>
                </div>
              )}

              <div style={{ display: "flex", justifyContent: "center", gap: 12, marginTop: 20 }}>
                {!running && elapsed === 0 && (
                  <button
                    onClick={start}
                    style={{
                      padding: "14px 32px",
                      background: "var(--brand-500)",
                      border: "none",
                      borderRadius: 50,
                      color: "#fff",
                      fontSize: 15,
                      fontWeight: 600,
                      cursor: "pointer",
                      display: "flex",
                      alignItems: "center",
                      gap: 7,
                    }}
                  >
                    <Play size={18} /> Start
                  </button>
                )}
                {running && (
                  <button
                    onClick={pause}
                    style={{
                      padding: "14px 24px",
                      background: "var(--ds-border)",
                      border: "1px solid hsl(230, 10%, 30%)",
                      borderRadius: 50,
                      color: "hsl(230, 8%, 80%)",
                      fontSize: 15,
                      cursor: "pointer",
                      display: "flex",
                      alignItems: "center",
                      gap: 7,
                    }}
                  >
                    <Pause size={18} /> Pause
                  </button>
                )}
                {!running && elapsed > 0 && (
                  <>
                    <button
                      onClick={resume}
                      style={{
                        padding: "14px 24px",
                        background: "var(--brand-500)",
                        border: "none",
                        borderRadius: 50,
                        color: "#fff",
                        fontSize: 15,
                        fontWeight: 600,
                        cursor: "pointer",
                        display: "flex",
                        alignItems: "center",
                        gap: 7,
                      }}
                    >
                      <Play size={18} /> Weiter
                    </button>
                    <button
                      onClick={stop}
                      style={{
                        padding: "14px 24px",
                        background: "hsla(0, 60%, 50%, 0.13)",
                        border: "1px solid hsla(0, 60%, 50%, 0.19)",
                        borderRadius: 50,
                        color: "var(--signal-danger-500)",
                        fontSize: 15,
                        cursor: "pointer",
                        display: "flex",
                        alignItems: "center",
                        gap: 7,
                      }}
                    >
                      <Square size={18} /> Stop
                    </button>
                  </>
                )}
              </div>
            </>
          ) : (
            <div
              style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 10 }}
            >
              <div>
                <label
                  style={{
                    fontSize: 10,
                    color: "var(--ds-text-muted)",
                    display: "block",
                    marginBottom: 4,
                  }}
                >
                  Stunden
                </label>
                <input
                  type="number"
                  min="0"
                  max="24"
                  value={manualHours}
                  onChange={(e) => setManualHours(e.target.value)}
                  placeholder="0"
                  style={{
                    width: 70,
                    background: "var(--ds-surface-2)",
                    border: "1px solid var(--ds-border)",
                    borderRadius: 10,
                    padding: "10px",
                    color: "var(--ds-text)",
                    fontSize: 22,
                    textAlign: "center",
                    outline: "none",
                  }}
                />
              </div>
              <span style={{ fontSize: 28, color: "hsl(230, 8%, 35%)", marginTop: 16 }}>:</span>
              <div>
                <label
                  style={{
                    fontSize: 10,
                    color: "var(--ds-text-muted)",
                    display: "block",
                    marginBottom: 4,
                  }}
                >
                  Minuten
                </label>
                <input
                  type="number"
                  min="0"
                  max="59"
                  value={manualMinutes}
                  onChange={(e) => setManualMinutes(e.target.value)}
                  placeholder="00"
                  style={{
                    width: 70,
                    background: "var(--ds-surface-2)",
                    border: "1px solid var(--ds-border)",
                    borderRadius: 10,
                    padding: "10px",
                    color: "var(--ds-text)",
                    fontSize: 22,
                    textAlign: "center",
                    outline: "none",
                  }}
                />
              </div>
            </div>
          )}
        </div>

        {/* Description + matter */}
        {(elapsed > 0 || mode === "manual") && (
          <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 8 }}>
            {saveError && (
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  padding: "10px 12px",
                  background: "hsla(0, 60%, 50%, 0.13)",
                  border: "1px solid hsla(0, 60%, 50%, 0.19)",
                  borderRadius: 10,
                  fontSize: 13,
                  color: "var(--signal-danger-500)",
                }}
              >
                <AlertCircle size={15} />
                <span style={{ flex: 1 }}>{saveError}</span>
                <button
                  onClick={save}
                  disabled={saving || currentSecs === 0}
                  style={{
                    background: "none",
                    border: "none",
                    color: "var(--signal-danger-500)",
                    cursor: "pointer",
                    display: "flex",
                    alignItems: "center",
                    gap: 4,
                    fontSize: 12,
                    fontWeight: 600,
                  }}
                >
                  <RefreshCw size={13} />
                  Retry
                </button>
              </div>
            )}
            {pendingSync && !saveError && (
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  padding: "10px 12px",
                  background: "hsla(40, 70%, 45%, 0.13)",
                  border: "1px solid hsla(40, 70%, 45%, 0.19)",
                  borderRadius: 10,
                  fontSize: 12,
                  color: "var(--signal-warning-500)",
                }}
              >
                <Loader2 size={13} style={{ animation: "spin 1s linear infinite" }} />
                Offline gespeichert — wird synchronisiert wenn online
              </div>
            )}
            <input
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Beschreibung der Tätigkeit…"
              style={
                {
                  width: "100%",
                  background: "var(--ds-surface-2)",
                  border: "1px solid var(--ds-border)",
                  borderRadius: 10,
                  padding: "11px 14px",
                  color: "var(--ds-text)",
                  fontSize: 14,
                  outline: "none",
                  boxSizing: "border-box",
                } as React.CSSProperties
              }
            />
            <div style={{ position: "relative" }}>
              <FolderOpen
                size={14}
                style={{
                  position: "absolute",
                  left: 12,
                  top: "50%",
                  transform: "translateY(-50%)",
                  color: "var(--ds-text-muted)",
                }}
              />
              <input
                value={matter}
                onChange={(e) => setMatter(e.target.value)}
                placeholder="Akte (optional)"
                style={
                  {
                    width: "100%",
                    background: "var(--ds-surface-2)",
                    border: "1px solid var(--ds-border)",
                    borderRadius: 10,
                    padding: "11px 14px 11px 34px",
                    color: "var(--ds-text)",
                    fontSize: 14,
                    outline: "none",
                    boxSizing: "border-box",
                  } as React.CSSProperties
                }
              />
            </div>
            <button
              onClick={save}
              disabled={currentSecs === 0 || saving}
              style={{
                width: "100%",
                padding: "13px",
                background:
                  currentSecs > 0
                    ? saved
                      ? "var(--signal-success-500)"
                      : "var(--brand-500)"
                    : "var(--ds-border)",
                border: "none",
                borderRadius: 12,
                color: "#fff",
                fontSize: 15,
                fontWeight: 600,
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: 7,
              }}
            >
              {saving ? (
                <Loader2 size={17} style={{ animation: "spin 1s linear infinite" }} />
              ) : saved ? (
                <CheckCircle2 size={17} />
              ) : (
                <Save size={17} />
              )}
              {saving
                ? "Speichern…"
                : saved
                  ? "Gespeichert!"
                  : `${formatDuration(currentSecs)} speichern`}
            </button>
          </div>
        )}

        {/* Today's entries */}
        {todayEntries.length > 0 && (
          <div style={{ marginTop: 20 }}>
            <div
              style={{
                fontSize: 11,
                color: "var(--ds-text-muted)",
                textTransform: "uppercase",
                letterSpacing: "0.4px",
                marginBottom: 10,
              }}
            >
              Heutige Einträge
            </div>
            {todayEntries.map((e, i) => (
              <div
                key={i}
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  padding: "8px 0",
                  borderBottom: "1px solid hsl(230, 10%, 12%)",
                  fontSize: 13,
                }}
              >
                <div>
                  <span style={{ color: "hsl(230, 8%, 80%)" }}>{e.description}</span>
                  {e.matter && (
                    <span style={{ color: "var(--ds-text-muted)", fontSize: 11 }}>
                      {" "}
                      · {e.matter}
                    </span>
                  )}
                </div>
                <span style={{ color: "var(--brand-500)", fontWeight: 600 }}>
                  {formatDuration(e.duration)}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      <style jsx global>{`
        @keyframes spin {
          to {
            transform: rotate(360deg);
          }
        }
        @keyframes pulse {
          0%,
          100% {
            opacity: 1;
          }
          50% {
            opacity: 0.3;
          }
        }
      `}</style>
    </div>
  );
}
