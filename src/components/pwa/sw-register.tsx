"use client";

// Registers the service worker (offline fallback). Production only —
// in dev a SW just gets in the way of hot reload.

import { useEffect } from "react";

export default function ServiceWorkerRegister() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production") return;
    if (!("serviceWorker" in navigator)) return;
    navigator.serviceWorker.register("/sw.js").catch(() => {
      // Offline support is progressive enhancement — never block the app on it.
    });
  }, []);
  return null;
}
