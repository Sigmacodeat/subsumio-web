"use client";

/**
 * The client portal as an app: installs with its own manifest (opens straight
 * into this matter), explains "add to home screen" on iPhone, and lets the
 * client be told when the firm replied — by push (lib/portal-push.ts) or by
 * e-mail with double opt-in (lib/portal-notify.ts).
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
  const [email, setEmail] = useState("");
  const [mailState, setMailState] = useState<"idle" | "busy" | "pending" | "confirmed" | "invalid">(
    "idle"
  );

  useEffect(() => {
    const notify = new URLSearchParams(window.location.search).get("notify");
    if (notify === "confirmed" || notify === "invalid") setMailState(notify);
  }, []);

  async function requestMail() {
    setMailState("busy");
    const res = await fetch("/api/portal/notify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token, email }),
    }).catch(() => null);
    setMailState(res?.ok ? "pending" : "invalid");
  }

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
    // The manifest request must carry the session cookie (token "meine-akte").
    link.crossOrigin = "use-credentials";
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

  async function signOut() {
    try {
      const reg = await navigator.serviceWorker?.getRegistration();
      const sub = await reg?.pushManager.getSubscription();
      if (sub) {
        await fetch("/api/portal/push", {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ token, endpoint: sub.endpoint }),
        });
        await sub.unsubscribe();
      }
    } catch {
      // signing out must not depend on push
    }
    await fetch("/api/portal/session", { method: "DELETE" }).catch(() => {});
    window.location.assign("/");
  }

  return (
    <div className="flex flex-wrap items-center gap-3 rounded-xl border [border-color:var(--mk-border)] px-4 py-3 text-sm [background:var(--mk-surface)]">
      {mailState === "confirmed" ? (
        <span className="[color:var(--mk-text-muted)]">
          E-Mail-Benachrichtigungen sind bestätigt.
        </span>
      ) : mailState === "pending" ? (
        <span className="[color:var(--mk-text-muted)]">
          Bitte bestätigen Sie den Link, den wir Ihnen gerade per E-Mail geschickt haben.
        </span>
      ) : (
        <form
          className="flex flex-wrap items-center gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            void requestMail();
          }}
        >
          <label htmlFor="portal-notify-email" className="[color:var(--mk-text-muted)]">
            Per E-Mail benachrichtigen:
          </label>
          <input
            id="portal-notify-email"
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="ihre@adresse.at"
            className="rounded-lg border [border-color:var(--mk-border)] bg-transparent px-2 py-1 focus-visible:ring-2 focus-visible:ring-[color:var(--brand-primary)] focus-visible:outline-none"
          />
          <button
            type="submit"
            disabled={mailState === "busy" || !email}
            className="rounded-lg border border-[color:var(--brand-primary)] px-3 py-1 font-medium text-[color:var(--brand-text)] disabled:opacity-50"
          >
            Anmelden
          </button>
          {mailState === "invalid" && (
            <span role="alert" className="text-[color:var(--ds-danger-text)]">
              Das hat nicht geklappt.
            </span>
          )}
        </form>
      )}
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
      <button
        type="button"
        onClick={() => void signOut()}
        className="ml-auto text-xs [color:var(--mk-text-muted)] underline"
      >
        Von diesem Gerät abmelden
      </button>
    </div>
  );
}
