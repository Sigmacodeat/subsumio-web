"use client";

/**
 * Mobile: Zeiterfassung (Time Entry)
 * Start/stop timer or manual entry, pick a matter, book via POST /api/time —
 * the same billable entry the desktop creates. Offline, the entry is queued
 * in exactly that shape and booked on reconnect.
 */

import { useState, useEffect, useMemo } from "react";
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
import { csrfFetch } from "@/lib/csrf";
import { isOnline, enqueueMutation } from "@/lib/offline-store";
import { toMobileMatter, type MobileMatter } from "@/lib/mobile-cases";
import {
  IDLE_TIMER,
  buildMobileTimeEntry,
  pauseTimer,
  startTimer,
  timerElapsedSeconds,
  type TimerState,
} from "@/lib/mobile-time";

function formatDuration(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

export default function MobileTimePage() {
  const [timer, setTimer] = useState<TimerState>(IDLE_TIMER);
  // Re-render trigger only; the elapsed time comes from the wall clock.
  const [now, setNow] = useState(() => Date.now());
  const [startTime, setStartTime] = useState<Date | null>(null);
  const [description, setDescription] = useState("");
  const [caseSlug, setCaseSlug] = useState("");
  const [matters, setMatters] = useState<MobileMatter[]>([]);
  const [mattersError, setMattersError] = useState(false);
  const [billable, setBillable] = useState(true);
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

  const running = timer.runningSince !== null;
  const elapsed = timerElapsedSeconds(timer, now);

  useEffect(() => {
    if (!running) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    // Back from the background: show the real elapsed time at once.
    const onVisible = () => setNow(Date.now());
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      clearInterval(id);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [running]);

  // Matters to book on — the same scoped list as the matter screen.
  useEffect(() => {
    let cancelled = false;
    api.brain
      .listAllPages({ type: "legal_case", max: 10_000 })
      .then((pages) => {
        if (cancelled) return;
        setMatters(
          pages
            .map(toMobileMatter)
            .filter((m): m is MobileMatter => m !== null)
            .sort((a, b) => a.title.localeCompare(b.title, "de"))
        );
      })
      .catch(() => {
        if (!cancelled) setMattersError(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const matterTitle = useMemo(
    () => new Map(matters.map((m) => [m.slug, m.title] as const)),
    [matters]
  );

  const totalTodaySecs = todayEntries.reduce((sum, e) => sum + e.duration, 0);

  const start = () => {
    const t = Date.now();
    setStartTime(new Date(t));
    setTimer(startTimer(IDLE_TIMER, t));
    setNow(t);
    setSaved(false);
  };

  const pause = () => {
    const t = Date.now();
    setTimer((s) => pauseTimer(s, t));
    setNow(t);
  };
  const resume = () => {
    const t = Date.now();
    setTimer((s) => startTimer(s, t));
    setNow(t);
  };
  const stop = pause;

  const resetTimer = () => {
    setTimer(IDLE_TIMER);
    setNow(Date.now());
  };

  const save = async () => {
    const durationSecs =
      mode === "timer"
        ? timerElapsedSeconds(timer, Date.now())
        : parseInt(manualHours || "0") * 3600 + parseInt(manualMinutes || "0") * 60;

    const entry = buildMobileTimeEntry({
      caseSlug,
      description,
      durationSecs,
      at: mode === "timer" && startTime ? startTime : new Date(),
      billable,
    });
    if (!entry.ok) {
      setSaveError(entry.error);
      return;
    }
    setSaving(true);
    setSaveError(null);

    const booked = () => {
      setTodayEntries((prev) => [
        ...prev,
        {
          duration: durationSecs,
          description: entry.body.description,
          matter: matterTitle.get(entry.body.case_slug) ?? entry.body.case_slug,
        },
      ]);
      resetTimer();
      setStartTime(null);
      setDescription("");
      setManualHours("");
      setManualMinutes("");
    };

    try {
      if (!isOnline()) {
        // Offline: queued in exactly the /api/time shape, booked on reconnect.
        await enqueueMutation({ type: "createTimeEntry", payload: { ...entry.body } });
        booked();
        setPendingSync(true);
        return;
      }
      const res = await csrfFetch("/api/time", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(entry.body),
        signal: AbortSignal.timeout(15_000),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => null)) as { error?: unknown } | null;
        setSaveError(
          typeof data?.error === "string" && data.error.includes(" ")
            ? data.error
            : "Zeiteintrag konnte nicht gespeichert werden."
        );
        return;
      }
      booked();
      setSaved(true);
      setPendingSync(false);
      setTimeout(() => setSaved(false), 2000);
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : "Speichern fehlgeschlagen");
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
                resetTimer();
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
                      border: "1px solid var(--ds-border-strong)",
                      borderRadius: 50,
                      color: "var(--ds-text-muted)",
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
                        background: "var(--ds-danger-bg)",
                        border: "1px solid var(--ds-danger-border)",
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
                  inputMode="decimal"
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
              <span style={{ fontSize: 28, color: "var(--ds-text-subtle)", marginTop: 16 }}>:</span>
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
                  inputMode="numeric"
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
                role="alert"
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  padding: "10px 12px",
                  background: "var(--ds-danger-bg)",
                  border: "1px solid var(--ds-danger-border)",
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
                  background: "var(--ds-warning-bg)",
                  border: "1px solid var(--ds-warning-border)",
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
              <select
                value={caseSlug}
                onChange={(e) => setCaseSlug(e.target.value)}
                aria-label="Akte"
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
              >
                <option value="">
                  {mattersError ? "Akten konnten nicht geladen werden" : "Akte wählen…"}
                </option>
                {matters.map((m) => (
                  <option key={m.slug} value={m.slug}>
                    {m.caseNumber ? `${m.caseNumber} · ${m.title}` : m.title}
                  </option>
                ))}
              </select>
            </div>
            <label
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                fontSize: 13,
                color: "var(--ds-text-muted)",
              }}
            >
              <input
                type="checkbox"
                checked={billable}
                onChange={(e) => setBillable(e.target.checked)}
              />
              Abrechenbar
            </label>
            <button
              onClick={save}
              disabled={currentSecs === 0 || saving || !caseSlug}
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
                  borderBottom: "1px solid var(--ds-border)",
                  fontSize: 13,
                }}
              >
                <div>
                  <span style={{ color: "var(--ds-text-muted)" }}>{e.description}</span>
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
