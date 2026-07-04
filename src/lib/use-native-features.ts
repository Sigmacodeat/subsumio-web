"use client";

/**
 * useNativeFeatures — React hook that manages the Capacitor native feature lifecycle.
 *
 * On mount in a native app (iOS/Android), it:
 * 1. Detects platform capabilities (push, biometric, camera, share)
 * 2. Auto-registers for push notifications if permission was previously granted
 * 3. Subscribes to incoming push notifications while the app is open
 * 4. Exposes biometric auth and share helpers
 *
 * In browser/PWA mode, all native features gracefully degrade to web APIs.
 */

import { useEffect, useState, useCallback, useRef } from "react";
import {
  detectCapabilities,
  registerPush,
  onPushNotification,
  biometricAuth,
  nativeShare,
  type MobileCapabilities,
} from "./mobile-bridge";
import { csrfFetch } from "./csrf";

interface PushNotification {
  title?: string;
  body?: string;
  data?: Record<string, unknown>;
}

interface UseNativeFeaturesResult {
  capabilities: MobileCapabilities | null;
  pushToken: string | null;
  pushError: string | null;
  pushNotification: PushNotification | null;
  registerForPush: () => Promise<void>;
  unlockWithBiometrics: () => Promise<{ success: boolean; error?: string }>;
  share: (opts: { title: string; text: string; url?: string }) => Promise<void>;
  clearPushNotification: () => void;
}

export function useNativeFeatures(): UseNativeFeaturesResult {
  const [capabilities, setCapabilities] = useState<MobileCapabilities | null>(null);
  const [pushToken, setPushToken] = useState<string | null>(null);
  const [pushError, setPushError] = useState<string | null>(null);
  const [pushNotification, setPushNotification] = useState<PushNotification | null>(null);
  const unsubPushRef = useRef<(() => void) | null>(null);

  // Detect capabilities on mount
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const caps = await detectCapabilities();
      if (cancelled) return;
      setCapabilities(caps);

      // Auto-register for push if native and permission already granted
      if (caps.push) {
        try {
          const result = await registerPush();
          if (cancelled) return;
          if (result.token) {
            setPushToken(result.token);
            // Send token to server
            const platform = caps.platform === "ios" ? "ios" : "android";
            const deviceId = getDeviceId();
            await csrfFetch("/api/push/register", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ token: result.token, platform, deviceId }),
            }).catch(() => {});
          } else if (result.error) {
            setPushError(result.error);
          }
        } catch {
          if (!cancelled) setPushError("Push-Registrierung fehlgeschlagen");
        }
      }

      // Subscribe to incoming push notifications
      if (caps.push) {
        const unsub = await onPushNotification((notif) => {
          if (cancelled) return;
          setPushNotification(notif);
          // Haptic feedback on notification
          if (typeof navigator !== "undefined" && "vibrate" in navigator) {
            navigator.vibrate(15);
          }
        });
        if (!cancelled) {
          unsubPushRef.current = unsub;
        } else {
          unsub();
        }
      }
    })();

    return () => {
      cancelled = true;
      if (unsubPushRef.current) {
        unsubPushRef.current();
        unsubPushRef.current = null;
      }
    };
  }, []);

  const registerForPush = useCallback(async () => {
    const result = await registerPush();
    if (result.token) {
      setPushToken(result.token);
      setPushError(null);
      if (capabilities) {
        const platform = capabilities.platform === "ios" ? "ios" : "android";
        const deviceId = getDeviceId();
        await csrfFetch("/api/push/register", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ token: result.token, platform, deviceId }),
        }).catch(() => {});
      }
    } else if (result.error) {
      setPushError(result.error);
    }
  }, [capabilities]);

  const unlockWithBiometrics = useCallback(async () => {
    return biometricAuth();
  }, []);

  const share = useCallback(async (opts: { title: string; text: string; url?: string }) => {
    await nativeShare(opts);
  }, []);

  const clearPushNotification = useCallback(() => {
    setPushNotification(null);
  }, []);

  return {
    capabilities,
    pushToken,
    pushError,
    pushNotification,
    registerForPush,
    unlockWithBiometrics,
    share,
    clearPushNotification,
  };
}

/**
 * Generate or retrieve a persistent device ID from localStorage.
 * Used for push token deduplication on the server.
 */
function getDeviceId(): string {
  if (typeof window === "undefined") return "ssr";
  const key = "subsumio-device-id";
  let id = localStorage.getItem(key);
  if (!id) {
    id = `dev_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 12)}`;
    localStorage.setItem(key, id);
  }
  return id;
}
