"use client";

// Registers the service worker (offline fallback + push notifications). Production only —
// in dev a SW just gets in the way of hot reload.

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function ServiceWorkerRegister() {
  const router = useRouter();
  useEffect(() => {
    if (process.env.NODE_ENV !== "production") return;
    if (!("serviceWorker" in navigator)) return;
    navigator.serviceWorker.register("/sw.js").catch(() => {
      // Offline support is progressive enhancement — never block the app on it.
    });

    // Handle push notification clicks — navigate to deep link
    const handleMessage = (event: MessageEvent) => {
      if (event.data?.type === "push-click" && event.data?.url) {
        router.push(event.data.url);
      }
    };
    navigator.serviceWorker.addEventListener("message", handleMessage);
    return () => navigator.serviceWorker.removeEventListener("message", handleMessage);
  }, [router]);
  return null;
}
