"use client";

/**
 * Turns web push on or off for this browser (or installed dashboard app), so
 * deadline reminders reach the lawyer's phone or desktop (push-send.ts).
 * Hidden when the browser cannot do push or the server has no VAPID keys.
 */
import { useEffect, useState } from "react";
import { Bell, BellOff, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { csrfFetch } from "@/lib/csrf";

function urlBase64ToUint8Array(base64: string): Uint8Array {
  const padded = (base64 + "=".repeat((4 - (base64.length % 4)) % 4))
    .replace(/-/g, "+")
    .replace(/_/g, "/");
  return Uint8Array.from(atob(padded), (c) => c.charCodeAt(0));
}

export function WebPushToggle() {
  const { addToast } = useToast();
  const [key, setKey] = useState<string | null>(null);
  const [on, setOn] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!("serviceWorker" in navigator) || !("PushManager" in window)) return;
    fetch("/api/push/register")
      .then((r) => (r.ok ? r.json() : null))
      .then(async (j: { public_key?: string | null } | null) => {
        if (!j?.public_key) return;
        setKey(j.public_key);
        const reg = await navigator.serviceWorker.getRegistration();
        setOn(Boolean(await reg?.pushManager.getSubscription()));
      })
      .catch(() => {});
  }, []);

  if (!key || on === null) return null;

  async function enable() {
    setBusy(true);
    try {
      if ((await Notification.requestPermission()) !== "granted") {
        addToast({ type: "error", title: "Benachrichtigungen wurden im Browser nicht erlaubt." });
        return;
      }
      const reg =
        (await navigator.serviceWorker.getRegistration()) ??
        (await navigator.serviceWorker.register("/sw.js"));
      await navigator.serviceWorker.ready;
      const sub =
        (await reg.pushManager.getSubscription()) ??
        (await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(key!) as BufferSource,
        }));
      const res = await csrfFetch("/api/push/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ platform: "web", token: JSON.stringify(sub.toJSON()) }),
      });
      if (!res.ok) throw new Error();
      setOn(true);
      addToast({
        type: "success",
        title: "Push-Benachrichtigungen für dieses Gerät eingeschaltet",
      });
    } catch {
      addToast({
        type: "error",
        title: "Push-Benachrichtigungen konnten nicht eingeschaltet werden",
      });
    } finally {
      setBusy(false);
    }
  }

  async function disable() {
    setBusy(true);
    try {
      const reg = await navigator.serviceWorker.getRegistration();
      const sub = await reg?.pushManager.getSubscription();
      if (sub) {
        await csrfFetch("/api/push/register", {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ token: JSON.stringify(sub.toJSON()) }),
        });
        await sub.unsubscribe();
      }
      setOn(false);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Button
      variant="outline"
      size="sm"
      className="whitespace-nowrap"
      disabled={busy}
      onClick={() => void (on ? disable() : enable())}
      aria-pressed={on}
    >
      {busy ? (
        <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden />
      ) : on ? (
        <BellOff className="mr-2 h-4 w-4" aria-hidden />
      ) : (
        <Bell className="mr-2 h-4 w-4" aria-hidden />
      )}
      {on ? "Push auf diesem Gerät aus" : "Push auf diesem Gerät ein"}
    </Button>
  );
}
