"use client";

/**
 * Mobile: Zeiterfassung (Time Entry)
 * Start/stop timer, manual entry, select matter, save to brain.
 * Integrates with /api/timetracking if available, falls back to brain pages.
 */

import { useState, useEffect, useRef } from "react";
import { Play, Pause, Square, Save, Loader2, CheckCircle2, FolderOpen } from "lucide-react";
import { api } from "@/lib/api";

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
    try {
      const durationHours = durationSecs / 3600;
      const now = new Date();

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
      setTimeout(() => setSaved(false), 2000);
    } catch (e) {
      console.error("[time] save error:", e);
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
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <h1 style={{ fontSize: 20, fontWeight: 700, color: "#e8e8f0" }}>Zeiterfassung</h1>
          <div style={{ fontSize: 12, color: "#6a6a8a" }}>
            Heute:{" "}
            <span style={{ color: "#6366f1", fontWeight: 600 }}>
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
                background: mode === m ? "#6366f1" : "#1e1e3a",
                color: mode === m ? "#fff" : "#8a8aa8",
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
                  color: running ? "#6366f1" : "#e8e8f0",
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
                      background: "#ef4444",
                      animation: "pulse 1s infinite",
                    }}
                  />
                  <span style={{ fontSize: 12, color: "#8a8aa8" }}>
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
                      background: "#6366f1",
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
                      background: "#1e1e3a",
                      border: "1px solid #2e2e5a",
                      borderRadius: 50,
                      color: "#c0c0d8",
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
                        background: "#6366f1",
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
                        background: "#ef444420",
                        border: "1px solid #ef444430",
                        borderRadius: 50,
                        color: "#ef4444",
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
                  style={{ fontSize: 10, color: "#6a6a8a", display: "block", marginBottom: 4 }}
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
                    background: "#0d0d1a",
                    border: "1px solid #1e1e3a",
                    borderRadius: 10,
                    padding: "10px",
                    color: "#e8e8f0",
                    fontSize: 22,
                    textAlign: "center",
                    outline: "none",
                  }}
                />
              </div>
              <span style={{ fontSize: 28, color: "#4a4a6a", marginTop: 16 }}>:</span>
              <div>
                <label
                  style={{ fontSize: 10, color: "#6a6a8a", display: "block", marginBottom: 4 }}
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
                    background: "#0d0d1a",
                    border: "1px solid #1e1e3a",
                    borderRadius: 10,
                    padding: "10px",
                    color: "#e8e8f0",
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
            <input
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Beschreibung der Tätigkeit…"
              style={
                {
                  width: "100%",
                  background: "#0d0d1a",
                  border: "1px solid #1e1e3a",
                  borderRadius: 10,
                  padding: "11px 14px",
                  color: "#e8e8f0",
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
                  color: "#6a6a8a",
                }}
              />
              <input
                value={matter}
                onChange={(e) => setMatter(e.target.value)}
                placeholder="Akte (optional)"
                style={
                  {
                    width: "100%",
                    background: "#0d0d1a",
                    border: "1px solid #1e1e3a",
                    borderRadius: 10,
                    padding: "11px 14px 11px 34px",
                    color: "#e8e8f0",
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
                background: currentSecs > 0 ? (saved ? "#22c55e" : "#6366f1") : "#1e1e3a",
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
                color: "#6a6a8a",
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
                  borderBottom: "1px solid #0e0e20",
                  fontSize: 13,
                }}
              >
                <div>
                  <span style={{ color: "#c0c0d8" }}>{e.description}</span>
                  {e.matter && (
                    <span style={{ color: "#6a6a8a", fontSize: 11 }}> · {e.matter}</span>
                  )}
                </div>
                <span style={{ color: "#6366f1", fontWeight: 600 }}>
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
