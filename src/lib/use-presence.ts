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
  // Prevents concurrent in-flight heartbeat requests (the 403 response may not
  // have arrived yet to set disabledRef, causing a flood of duplicate POSTs).
  const inFlightRef = useRef(false);
  // Store user in a ref so sendHeartbeat doesn't depend on the user object
  // reference — callers may create a new object literal every render.
  const userRef = useRef(user);
  userRef.current = user;

  const sendHeartbeat = useCallback(async () => {
    if (!userRef.current || !pageSlug || disabledRef.current || inFlightRef.current) return;
    inFlightRef.current = true;
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
    } finally {
      inFlightRef.current = false;
    }
  }, [pageSlug]);

  // Depend on userId (a stable string) instead of the user object, so the
  // effect doesn't re-run when the caller recreates the object literal.
  const userId = user?.id;

  useEffect(() => {
    if (!userId || !pageSlug) return;

    ensureRealtime();
    sendHeartbeat();

    // Heartbeat every 15s
    heartbeatRef.current = setInterval(sendHeartbeat, 15000);

    // Listen for presence events
    const unsubJoined = realtime.on("presence.joined", (payload) => {
      const p = payload as PresenceUser;
      if (p.page === pageSlug && p.userId !== userId) {
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
      if (p.page === pageSlug && p.userId !== userId) {
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
      if (userId && pageSlug && !disabledRef.current) {
        navigator.sendBeacon(
          "/api/realtime/presence",
          new Blob([JSON.stringify({ page: pageSlug, action: "leave" })], {
            type: "application/json",
          })
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
  }, [userId, pageSlug, sendHeartbeat]);

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
