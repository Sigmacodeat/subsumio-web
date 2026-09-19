"use client";

/**
 * The client portal as an app: installs with its own manifest (opens straight
 * into this matter), explains "add to home screen" on iPhone, and lets the
 * client turn on notifications for replies from the firm (lib/portal-push.ts).
 */
import { useEffect, useState } from "react";
import { Bell, BellOff, Loader2, Smartphone } from "lucide-react";

function urlBase64ToUint8Array(base64: string): Uint8Array {
  const padded = (base64 + "=".repeat((4 - (base64.length % 4)) % 4))
    .replace(/-/g, "+")
    .replace(/_/g, "/");
  const raw = atob(padded);
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
}

type PushState = "unsupported" | "off" | "on" | "blocked" | "busy";

export function PortalAppBar({ token }: { token: string }) {
  const [publicKey, setPublicKey] = useState<string | null>(null);
  const [push, setPush] = useState<PushState>("unsupported");
  const [iosHint, setIosHint] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Install as this client's app, not the lawyers' dashboard.
  useEffect(() => {
    const href = `/api/portal/manifest?token=${encodeURIComponent(token)}`;
    let link = document.querySelector<HTMLLinkElement>('link[rel="manifest"]');
    const previous = link?.getAttribute("href") ?? null;
    if (!link) {
      link = document.createElement("link");
      link.rel = "manifest";
      document.head.appendChild(link);
    }
    link.href = href;
    return () => {
      if (previous) link!.setAttribute("href", previous);
    };
  }, [token]);

  useEffect(() => {
    const ua = navigator.userAgent;
    const ios = /iPhone|iPad|iPod/.test(ua);
    const standalone =
      window.matchMedia("(display-mode: standalone)").matches ||
      (navigator as unknown as { standalone?: boolean }).standalone === true;
    setIosHint(ios && !standalone);

    if (!("serviceWorker" in navigator) || !("PushManager" in window)) return;
    fetch("/api/portal/push")
      .then((r) => r.json())
      .then(async (j: { public_key: string | null }) => {
        if (!j.public_key) return;
        setPublicKey(j.public_key);
        if (Notification.permission === "denied") return setPush("blocked");
        const reg = await navigator.serviceWorker.getRegistration();
        const sub = await reg?.pushManager.getSubscription();
        setPush(sub ? "on" : "off");
      })
      .catch(() => {});
  }, []);

  async function enable() {
    if (!publicKey) return;
    setPush("busy");
    setError(null);
    try {
      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        setPush(permission === "denied" ? "blocked" : "off");
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
          applicationServerKey: urlBase64ToUint8Array(publicKey) as BufferSource,
        }));
      const res = await fetch("/api/portal/push", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, subscription: sub.toJSON() }),
      });
      if (!res.ok) throw new Error();
      setPush("on");
    } catch {
      setError("Benachrichtigungen konnten nicht eingeschaltet werden.");
      setPush("off");
    }
  }

  async function disable() {
    setPush("busy");
    try {
      const reg = await navigator.serviceWorker.getRegistration();
      const sub = await reg?.pushManager.getSubscription();
      if (sub) {
        await fetch("/api/portal/push", {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ token, endpoint: sub.endpoint }),
        });
        await sub.unsubscribe();
      }
    } finally {
      setPush("off");
    }
  }

  if (push === "unsupported" && !iosHint) return null;

  return (
    <div className="flex flex-wrap items-center gap-3 rounded-xl border [border-color:var(--mk-border)] px-4 py-3 text-sm [background:var(--mk-surface)]">
      {iosHint && (
        <p className="flex items-center gap-2 [color:var(--mk-text-muted)]">
          <Smartphone size={15} aria-hidden="true" />
          Als App nutzen: in Safari „Teilen“ → „Zum Home-Bildschirm“. Danach können Sie auch
          Benachrichtigungen einschalten.
        </p>
      )}
      {push === "off" && (
        <button
          type="button"
          onClick={() => void enable()}
          className="inline-flex items-center gap-2 rounded-lg border border-[color:var(--brand-primary)] px-3 py-1.5 font-medium text-[color:var(--brand-text)] hover:bg-[color:var(--brand-glow)] focus-visible:ring-2 focus-visible:ring-[color:var(--brand-primary)] focus-visible:outline-none"
        >
          <Bell size={14} aria-hidden="true" />
          Benachrichtigen, wenn die Kanzlei antwortet
        </button>
      )}
      {push === "busy" && <Loader2 size={16} className="animate-spin" aria-label="Bitte warten" />}
      {push === "on" && (
        <span className="inline-flex items-center gap-2 [color:var(--mk-text-muted)]">
          <Bell size={14} aria-hidden="true" />
          Benachrichtigungen sind eingeschaltet.
          <button
            type="button"
            onClick={() => void disable()}
            className="inline-flex items-center gap-1 underline"
          >
            <BellOff size={12} aria-hidden="true" />
            Ausschalten
          </button>
        </span>
      )}
      {push === "blocked" && (
        <span className="[color:var(--mk-text-muted)]">
          Benachrichtigungen sind im Browser blockiert.
        </span>
      )}
      {error && (
        <span role="alert" className="text-[color:var(--ds-danger-text)]">
          {error}
        </span>
      )}
    </div>
  );
}
