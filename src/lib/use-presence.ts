"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { realtime, ensureRealtime } from "./realtime";

export interface PresenceUser {
  userId: string;
  email: string;
  page: string;
  joinedAt: string;
  lastHeartbeat: string;
}

/**
 * Presence Hook — zeigt welche Team-Mitglieder gerade auf derselben Seite aktiv sind.
 * Sendet Heartbeats alle 15s via POST /api/realtime/presence.
 * Empfängt presence.joined / presence.left / presence.heartbeat via SSE.
 */
export function usePresence(pageSlug: string, user: { id: string; email: string } | null) {
  const [activeUsers, setActiveUsers] = useState<PresenceUser[]>([]);
  const heartbeatRef = useRef<ReturnType<typeof setInterval> | null>(null);
  // Once the endpoint refuses us (401/403), presence won't recover within this
  // session — stop pinging so we don't spam the console/network every 15s.
  const disabledRef = useRef(false);

  const sendHeartbeat = useCallback(async () => {
    if (!user || !pageSlug || disabledRef.current) return;
    try {
      const res = await fetch("/api/realtime/presence", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ page: pageSlug }),
      });
      if (res.status === 401 || res.status === 403) {
        // Not authorised for presence — disable and stop the heartbeat.
        disabledRef.current = true;
        if (heartbeatRef.current) {
          clearInterval(heartbeatRef.current);
          heartbeatRef.current = null;
        }
      }
    } catch {
      // Silent fail — presence is best-effort
    }
  }, [user, pageSlug]);

  useEffect(() => {
    if (!user || !pageSlug) return;

    ensureRealtime();
    sendHeartbeat();

    // Heartbeat every 15s
    heartbeatRef.current = setInterval(sendHeartbeat, 15000);

    // Listen for presence events
    const unsubJoined = realtime.on("presence.joined", (payload) => {
      const p = payload as PresenceUser;
      if (p.page === pageSlug && p.userId !== user.id) {
        setActiveUsers((prev) => {
          if (prev.some((u) => u.userId === p.userId)) return prev;
          return [...prev, p];
        });
      }
    });

    const unsubLeft = realtime.on("presence.left", (payload) => {
      const p = payload as { userId: string; page: string };
      if (p.page === pageSlug) {
        setActiveUsers((prev) => prev.filter((u) => u.userId !== p.userId));
      }
    });

    const unsubHeartbeat = realtime.on("presence.heartbeat", (payload) => {
      const p = payload as PresenceUser;
      if (p.page === pageSlug && p.userId !== user.id) {
        setActiveUsers((prev) => {
          const existing = prev.find((u) => u.userId === p.userId);
          if (existing) {
            return prev.map((u) =>
              u.userId === p.userId ? { ...u, lastHeartbeat: p.lastHeartbeat } : u
            );
          }
          return [...prev, p];
        });
      }
    });

    // Cleanup on unmount: send leave notification
    const handleUnload = () => {
      if (user && pageSlug) {
        navigator.sendBeacon(
          "/api/realtime/presence",
          JSON.stringify({ page: pageSlug, action: "leave" })
        );
      }
    };
    window.addEventListener("beforeunload", handleUnload);

    return () => {
      if (heartbeatRef.current) clearInterval(heartbeatRef.current);
      unsubJoined();
      unsubLeft();
      unsubHeartbeat();
      window.removeEventListener("beforeunload", handleUnload);
      handleUnload();
    };
  }, [user, pageSlug, sendHeartbeat]);

  // Prune stale users (no heartbeat in 45s)
  useEffect(() => {
    const pruneTimer = setInterval(() => {
      const cutoff = Date.now() - 45000;
      setActiveUsers((prev) => prev.filter((u) => new Date(u.lastHeartbeat).getTime() > cutoff));
    }, 20000);
    return () => clearInterval(pruneTimer);
  }, []);

  return activeUsers;
}
