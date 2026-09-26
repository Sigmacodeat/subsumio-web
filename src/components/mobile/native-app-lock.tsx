"use client";

/**
 * Biometric app lock (native app only). The "sign in with Face ID" button
 * only forwarded to an existing session — anyone holding the unlocked phone
 * saw the firm's data. This lock covers the app on start and after more than
 * five minutes in the background until the device biometrics confirm the
 * user. In the browser/PWA, or without biometrics, it renders nothing.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { Fingerprint, Loader2 } from "lucide-react";
import {
  appLifecycle,
  biometricAuth,
  biometricAvailable,
  detectCapabilities,
} from "@/lib/mobile-bridge";
import { shouldLockOnResume } from "@/lib/app-lock";
import { csrfFetch } from "@/lib/csrf";

async function hasSession(): Promise<boolean> {
  try {
    const res = await fetch("/api/auth/me", { credentials: "same-origin" });
    return res.ok;
  } catch {
    return false;
  }
}

export function NativeAppLock() {
  const [locked, setLocked] = useState(false);
  const [unlocking, setUnlocking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const pausedAt = useRef<number | null>(null);

  const lockIfSignedIn = useCallback(async () => {
    if (await hasSession()) setLocked(true);
  }, []);

  useEffect(() => {
    let cancelled = false;
    const removers: Array<() => Promise<void>> = [];
    (async () => {
      const caps = await detectCapabilities();
      if (cancelled || !caps.isNative) return;
      if (!(await biometricAvailable()) || cancelled) return;
      await lockIfSignedIn();
      const app = await appLifecycle();
      if (!app || cancelled) return;
      const onPause = await app.addListener("pause", () => {
        pausedAt.current = Date.now();
      });
      const onResume = await app.addListener("resume", () => {
        if (shouldLockOnResume(pausedAt.current, Date.now())) void lockIfSignedIn();
        pausedAt.current = null;
      });
      removers.push(onPause.remove, onResume.remove);
    })();
    return () => {
      cancelled = true;
      for (const remove of removers) void remove().catch(() => {});
    };
  }, [lockIfSignedIn]);

  const unlock = useCallback(async () => {
    setUnlocking(true);
    setError(null);
    const result = await biometricAuth();
    setUnlocking(false);
    if (result.success) setLocked(false);
    else setError(result.error ?? "Entsperren fehlgeschlagen");
  }, []);

  // Ask for biometrics as soon as the lock appears.
  useEffect(() => {
    if (locked) void unlock();
  }, [locked, unlock]);

  const signOut = useCallback(async () => {
    await csrfFetch("/api/auth/logout", { method: "POST" }).catch(() => null);
    window.location.href = "/at/login";
  }, []);

  if (!locked) return null;
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Subsumio ist gesperrt"
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 2147483647,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 16,
        padding: 24,
        background: "var(--ds-bg, #06060f)",
        color: "var(--ds-text, #fff)",
        textAlign: "center",
      }}
    >
      <Fingerprint size={48} aria-hidden="true" />
      <div style={{ fontSize: 18, fontWeight: 600 }}>Subsumio ist gesperrt</div>
      {error && (
        <div role="alert" style={{ fontSize: 13, opacity: 0.8 }}>
          {error}
        </div>
      )}
      <button
        type="button"
        onClick={() => void unlock()}
        disabled={unlocking}
        style={{
          padding: "12px 24px",
          borderRadius: 12,
          border: "none",
          background: "var(--brand-500, #4f46e5)",
          color: "#fff",
          fontSize: 15,
          fontWeight: 600,
        }}
      >
        {unlocking ? <Loader2 size={16} aria-hidden="true" /> : "Entsperren"}
      </button>
      <button
        type="button"
        onClick={() => void signOut()}
        style={{
          background: "none",
          border: "none",
          color: "inherit",
          opacity: 0.7,
          fontSize: 13,
          textDecoration: "underline",
        }}
      >
        Abmelden
      </button>
    </div>
  );
}
