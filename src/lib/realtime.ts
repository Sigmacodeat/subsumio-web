"use client";

import { useEffect, useRef } from "react";

/**
 * Real-time Sync Layer für SigmaBrain.
 * Nutzt native WebSocket (keine externe Lib nötig) für Live-Updates
 * zwischen Team-Mitgliedern im selben Workspace.
 *
 * Events:
 *   - case.updated { slug, by, at }
 *   - deadline.changed { caseSlug, deadlineId, status }
 *   - note.added { caseSlug, note }
 *   - invoice.created { slug, number }
 *
 * Auto-Reconnect mit exponentiellem Backoff.
 */

const WS_URL = process.env.NEXT_PUBLIC_WS_URL || "wss://sigmabrain.com/ws";
const RECONNECT_BASE_MS = 1000;
const RECONNECT_MAX_MS = 30000;

type EventCallback = (payload: unknown) => void;

class RealtimeClient {
  private ws: WebSocket | null = null;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private reconnectAttempt = 0;
  private listeners = new Map<string, Set<EventCallback>>();
  private pending: string[] = [];
  public status: "connecting" | "open" | "closed" | "error" = "closed";

  connect(token?: string) {
    if (this.ws?.readyState === WebSocket.OPEN) return;
    this.status = "connecting";
    const url = token ? `${WS_URL}?token=${encodeURIComponent(token)}` : WS_URL;
    try {
      this.ws = new WebSocket(url);
      this.ws.onopen = () => {
        this.status = "open";
        this.reconnectAttempt = 0;
        // Flush pending messages
        while (this.pending.length > 0 && this.ws?.readyState === WebSocket.OPEN) {
          this.ws.send(this.pending.shift()!);
        }
      };
      this.ws.onmessage = (ev) => {
        try {
          const msg = JSON.parse(ev.data as string) as { event: string; payload: unknown };
          this.emit(msg.event, msg.payload);
        } catch {}
      };
      this.ws.onclose = () => { this.status = "closed"; this.scheduleReconnect(token); };
      this.ws.onerror = () => { this.status = "error"; this.ws?.close(); };
    } catch {
      this.scheduleReconnect(token);
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
      try { cb(payload); } catch {}
    });
  }

  send(event: string, payload: unknown) {
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
    connected = true;
    realtime.connect(token);
  }
}
