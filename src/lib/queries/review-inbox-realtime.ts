"use client";

import { useCallback, useEffect, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useRealtime } from "@/lib/realtime";
import { useToast } from "@/components/ui/toast";

interface ReviewInboxEventPayload {
  slug?: string;
  caseSlug?: string;
  by?: string;
  type?: string;
}

const TOAST_EVENTS: Record<
  string,
  { title: string; body: string; icon: "info" | "success" | "warning" | "error"; push: boolean }
> = {
  "document_request.created": {
    title: "Neue Dokumentenanfrage erstellt",
    body: "Eine neue Dokumentenanfrage wartet auf Versand.",
    icon: "info",
    push: true,
  },
  "document_request.updated": {
    title: "Dokumentenanfrage aktualisiert",
    body: "Eine Dokumentenanfrage wurde aktualisiert.",
    icon: "info",
    push: false,
  },
  "inbox.triage": {
    title: "Neue Triage-Empfehlung verfügbar",
    body: "Ein neuer Eingang muss triagiert werden.",
    icon: "info",
    push: true,
  },
  "deadline.alert": {
    title: "Frist-Alarm",
    body: "Eine kritische Frist nähert sich dem Ablauf.",
    icon: "warning",
    push: true,
  },
  "document.uploaded": {
    title: "Neues Dokument hochgeladen",
    body: "Ein neues Dokument wurde in eine Akte hochgeladen.",
    icon: "info",
    push: false,
  },
  "intake.received": {
    title: "Neuer Mandanteneingang",
    body: "Eine neue Einreichung eines Mandanten ist eingegangen.",
    icon: "info",
    push: true,
  },
};

const INVALIDATE_KEYS = [
  ["sidebar-badges"],
  ["review-inbox"],
  ["communications", "batch"],
  ["ai-deadline-suggestions"],
];

const NOTIFICATION_TAG_PREFIX = "subsumio-review";

function isTabVisible(): boolean {
  if (typeof document === "undefined") return true;
  return !document.hidden;
}

function isNotificationPermissionGranted(): boolean {
  if (typeof window === "undefined" || !("Notification" in window)) return false;
  return Notification.permission === "granted";
}

function showBrowserNotification(title: string, body: string, tag: string) {
  if (!isNotificationPermissionGranted()) return;
  try {
    const notification = new Notification(title, {
      body,
      tag,
      icon: "/favicon.ico",
      badge: "/favicon.ico",
    });
    notification.onclick = () => {
      window.focus();
      notification.close();
    };
    setTimeout(() => {
      try {
        notification.close();
      } catch {
        // already closed
      }
    }, 10_000);
  } catch {
    // Notification API may not be available in some browsers
  }
}

export function useReviewInboxRealtime() {
  const qc = useQueryClient();
  const { addToast } = useToast();
  const shownSlugs = useRef<Set<string>>(new Set());

  const invalidateAll = useCallback(() => {
    for (const key of INVALIDATE_KEYS) {
      qc.invalidateQueries({ queryKey: key });
    }
  }, [qc]);

  const handleEvent = useCallback(
    (event: string, payload: ReviewInboxEventPayload) => {
      invalidateAll();

      const config = TOAST_EVENTS[event];
      if (!config) return;

      const dedupKey = `${event}:${payload.slug ?? ""}`;
      if (shownSlugs.current.has(dedupKey)) return;
      shownSlugs.current.add(dedupKey);

      if (shownSlugs.current.size > 20) {
        const first = shownSlugs.current.values().next().value;
        if (first) shownSlugs.current.delete(first);
      }

      // In-App Toast (only when tab is visible)
      if (isTabVisible()) {
        addToast({
          type: config.icon as "success" | "error" | "info" | "warning",
          title: config.title,
          duration: 5000,
        });
      }

      // Browser Push Notification (only when tab is hidden and event warrants push)
      if (!isTabVisible() && config.push) {
        const tag = `${NOTIFICATION_TAG_PREFIX}:${event}`;
        showBrowserNotification(config.title, config.body, tag);
      }
    },
    [addToast, invalidateAll]
  );

  useRealtime("document_request.created", (payload) =>
    handleEvent("document_request.created", payload as ReviewInboxEventPayload)
  );
  useRealtime("document_request.updated", (payload) =>
    handleEvent("document_request.updated", payload as ReviewInboxEventPayload)
  );
  useRealtime("inbox.triage", (payload) =>
    handleEvent("inbox.triage", payload as ReviewInboxEventPayload)
  );
  useRealtime("deadline.alert", (payload) =>
    handleEvent("deadline.alert", payload as ReviewInboxEventPayload)
  );
  useRealtime("document.uploaded", (payload) =>
    handleEvent("document.uploaded", payload as ReviewInboxEventPayload)
  );
  useRealtime("intake.received", (payload) =>
    handleEvent("intake.received", payload as ReviewInboxEventPayload)
  );

  useEffect(() => {
    return () => {
      // eslint-disable-next-line react-hooks/exhaustive-deps
      shownSlugs.current.clear();
    };
  }, []);
}

/**
 * Request browser notification permission.
 * Call this from a user interaction (button click) — browsers require
 * a user gesture for the permission prompt.
 */
export async function requestNotificationPermission(): Promise<boolean> {
  if (typeof window === "undefined" || !("Notification" in window)) return false;
  if (Notification.permission === "granted") return true;
  if (Notification.permission === "denied") return false;
  try {
    const result = await Notification.requestPermission();
    return result === "granted";
  } catch {
    return false;
  }
}

/**
 * Check if browser notifications are supported and permission is granted.
 */
export function isNotificationSupported(): boolean {
  if (typeof window === "undefined") return false;
  return "Notification" in window && Notification.permission === "granted";
}
