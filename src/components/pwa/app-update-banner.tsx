"use client";

/**
 * AppUpdateBanner — shows a toast when the service worker has an update waiting.
 * Uses the SW registration's updatefound event and controllerchange.
 * Dismissable; auto-reloads on accept.
 */

import { useEffect, useState } from "react";

export default function AppUpdateBanner() {
  const [updateAvailable, setUpdateAvailable] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    if (process.env.NODE_ENV !== "production") return;
    if (!("serviceWorker" in navigator)) return;

    let registration: ServiceWorkerRegistration | null = null;

    const checkUpdate = () => {
      if (registration?.waiting) {
        setUpdateAvailable(true);
      }
    };

    navigator.serviceWorker.getRegistration("/sw.js").then((reg) => {
      if (!reg) return;
      registration = reg;
      checkUpdate();

      reg.addEventListener("updatefound", () => {
        const newWorker = reg.installing;
        if (!newWorker) return;
        newWorker.addEventListener("statechange", () => {
          if (newWorker.state === "installed" && navigator.serviceWorker.controller) {
            setUpdateAvailable(true);
          }
        });
      });
    });

    // Also listen for controller change (new SW took over)
    const onControllerChange = () => {
      // Reload once when the new SW takes control
      if (registration?.waiting) {
        window.location.reload();
      }
    };
    navigator.serviceWorker.addEventListener("controllerchange", onControllerChange);

    return () => {
      navigator.serviceWorker.removeEventListener("controllerchange", onControllerChange);
    };
  }, []);

  const handleUpdate = () => {
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.getRegistration("/sw.js").then((reg) => {
        if (reg?.waiting) {
          // Send message to SW to skip waiting
          reg.waiting.postMessage({ type: "SKIP_WAITING" });
        }
      });
    }
  };

  if (!updateAvailable || dismissed) return null;

  return (
    <div
      className="fixed bottom-[calc(env(safe-area-inset-bottom)+4rem)] left-1/2 z-[70] flex max-w-sm -translate-x-1/2 items-center gap-3 rounded-xl border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] p-3 shadow-2xl md:bottom-4"
      role="alert"
      aria-live="polite"
    >
      <div className="flex-1">
        <p className="text-sm font-semibold text-[color:var(--ds-text)]">Update verfügbar</p>
        <p className="text-xs text-[color:var(--ds-text-muted)]">
          Eine neue Version ist bereit. Jetzt aktualisieren?
        </p>
      </div>
      <button
        onClick={handleUpdate}
        className="brand-bg shrink-0 rounded-lg px-3 py-1.5 text-xs font-medium text-white transition-transform active:scale-95"
      >
        Aktualisieren
      </button>
      <button
        onClick={() => setDismissed(true)}
        className="shrink-0 text-[color:var(--ds-text-subtle)] transition-colors hover:text-[color:var(--ds-text)]"
        aria-label="Später"
      >
        <svg
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M18 6L6 18M6 6l12 12" />
        </svg>
      </button>
    </div>
  );
}
