"use client";

import { useEffect, useRef } from "react";

/**
 * Real-time Sync Layer für Subsumio.
 * Nutzt native WebSocket (keine externe Lib nötig) für Live-Updates
 * zwischen Team-Mitgliedern im selben Workspace.
 *
 * Wenn kein WS-Backend konfiguriert ist (NEXT_PUBLIC_WS_URL leer),
 * fällt das System auf Server-Sent Events (SSE) via /api/realtime/sse zurück.
 * SSE ist Vercel-native und benötigt keine externe Infrastruktur.
 *
 * Events:
 *   - case.updated { slug, by, at }
 *   - deadline.changed { caseSlug, deadlineId, status }
 *   - note.added { caseSlug, note }
 *   - invoice.created { slug, number }
 *   - connected { brainId, at }
 *
 * Auto-Reconnect mit exponentiellem Backoff.
 */

const WS_URL = process.env.NEXT_PUBLIC_WS_URL || "";
const SSE_URL = "/api/realtime/sse";
const RECONNECT_BASE_MS = 1000;
const RECONNECT_MAX_MS = 30000;
const RECONNECT_MAX_ATTEMPTS = 5;

type EventCallback = (payload: unknown) => void;

class RealtimeClient {
  private ws: WebSocket | null = null;
  private es: EventSource | null = null;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private reconnectAttempt = 0;
  private listeners = new Map<string, Set<EventCallback>>();
  private pending: string[] = [];
  public status: "connecting" | "open" | "closed" | "error" = "closed";
  private mode: "ws" | "sse" | "none" = "none";

  connect(token?: string) {
    if (WS_URL) {
      this.connectWs(token);
    } else if (typeof window !== "undefined" && "EventSource" in window) {
      this.connectSse();
    } else {
      // No realtime backend available — gracefully skip
    }
  }

  private connectWs(token?: string) {
    if (this.ws?.readyState === WebSocket.OPEN) return;
    if (this.reconnectAttempt >= RECONNECT_MAX_ATTEMPTS) {
      console.warn("[realtime] Max reconnect attempts reached — giving up.");
      this.status = "closed";
      return;
    }
    this.mode = "ws";
    this.status = "connecting";
    const url = token ? `${WS_URL}?token=${encodeURIComponent(token)}` : WS_URL;
    try {
      this.ws = new WebSocket(url);
      this.ws.onopen = () => {
        this.status = "open";
        this.reconnectAttempt = 0;
        while (this.pending.length > 0 && this.ws?.readyState === WebSocket.OPEN) {
          this.ws.send(this.pending.shift()!);
        }
      };
      this.ws.onmessage = (ev) => {
        try {
          const msg = JSON.parse(ev.data as string) as { event: string; payload: unknown };
          this.emit(msg.event, msg.payload);
        } catch (err) {
          console.warn("[realtime] Failed to parse WS message:", err);
        }
      };
      this.ws.onclose = () => { this.status = "closed"; this.scheduleReconnect(token); };
      this.ws.onerror = (e) => {
        console.warn("[realtime] WebSocket error:", e);
        this.status = "error";
        this.ws?.close();
      };
    } catch (err) {
      console.warn("[realtime] WS connection failed:", err);
      this.scheduleReconnect(token);
    }
  }

  private connectSse() {
    if (this.es?.readyState === EventSource.OPEN) return;
    if (this.reconnectAttempt >= RECONNECT_MAX_ATTEMPTS) {
      console.warn("[realtime] Max SSE reconnect attempts reached — giving up.");
      this.status = "closed";
      return;
    }
    this.mode = "sse";
    this.status = "connecting";
    try {
      this.es = new EventSource(SSE_URL);
      this.es.onopen = () => {
        this.status = "open";
        this.reconnectAttempt = 0;
      };
      this.es.onerror = (e) => {
        console.warn("[realtime] SSE error:", e);
        this.status = "error";
        this.es?.close();
        this.scheduleReconnect();
      };
      // Listen for known event types
      const knownEvents = ["connected", "case.updated", "deadline.changed", "note.added", "invoice.created", "comment.added", "notification.created", "workflow.started", "workflow.step_changed", "workflow.completed", "workflow.failed"];
      for (const evt of knownEvents) {
        this.es.addEventListener(evt, (ev: MessageEvent) => {
          try {
            const payload = JSON.parse(ev.data);
            this.emit(evt, payload);
          } catch (err) {
            console.warn(`[realtime] Failed to parse SSE event '${evt}':`, err);
          }
        });
      }
      // Catch-all for unnamed events (heartbeat comments are ignored by EventSource)
      this.es.onmessage = (ev) => {
        try {
          const msg = JSON.parse(ev.data) as { event: string; payload: unknown };
          if (msg.event) this.emit(msg.event, msg.payload);
        } catch {
          // Ignore unparseable messages (heartbeats, etc.)
        }
      };
    } catch (err) {
      console.warn("[realtime] SSE connection failed:", err);
      this.scheduleReconnect();
    }
  }

  private scheduleReconnect(token?: string) {
    if (this.reconnectTimer) return;
    const delay = Math.min(RECONNECT_BASE_MS * 2 ** this.reconnectAttempt, RECONNECT_MAX_MS);
    this.reconnectAttempt++;
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.connect(token);
    }, delay);
  }

  on(event: string, cb: EventCallback) {
    if (!this.listeners.has(event)) this.listeners.set(event, new Set());
    this.listeners.get(event)!.add(cb);
    return () => this.listeners.get(event)?.delete(cb);
  }

  private emit(event: string, payload: unknown) {
    this.listeners.get(event)?.forEach((cb) => {
      try { cb(payload); } catch (err) {
        console.warn(`[realtime] Listener error for "${event}":`, err);
      }
    });
  }

  send(event: string, payload: unknown) {
    // SSE is server→client only; client→server goes via regular API POST
    if (this.mode === "sse") return;
    const msg = JSON.stringify({ event, payload });
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(msg);
    } else {
      this.pending.push(msg);
    }
  }

  disconnect() {
    if (this.reconnectTimer) { clearTimeout(this.reconnectTimer); this.reconnectTimer = null; }
    this.ws?.close();
    this.ws = null;
    this.es?.close();
    this.es = null;
    this.status = "closed";
  }
}

export const realtime = new RealtimeClient();

/** React hook: subscribe to a realtime event */
export function useRealtime(event: string, cb: EventCallback) {
  const savedCb = useRef(cb);
  savedCb.current = cb;

  useEffect(() => {
    const unsubscribe = realtime.on(event, (payload) => savedCb.current(payload));
    return () => { unsubscribe(); };
  }, [event]);
}

// Lazy-connect on first subscription
let connected = false;
export function ensureRealtime(token?: string) {
  if (!connected && typeof window !== "undefined") {
    if (WS_URL || "EventSource" in window) {
      connected = true;
      realtime.connect(token);
    }
  }
}
