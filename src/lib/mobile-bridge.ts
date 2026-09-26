/**
 * Capacitor Mobile Bridge für Subsumio.
 * Abstrahiert native Plugins (Push, Camera, Biometric) mit Graceful-Degradation
 * für Browser/PWA.
 */

export interface MobileCapabilities {
  push: boolean;
  camera: boolean;
  biometric: boolean;
  share: boolean;
  isNative: boolean;
  platform: "ios" | "android" | "web";
}

async function getCapacitor() {
  try {
    const { Capacitor } = await import("@capacitor/core");
    return Capacitor;
  } catch {
    return null;
  }
}

/**
 * A native plugin through the Capacitor bridge. The native app loads the
 * hosted web app (capacitor.config `server.url`), so the plugins' JS packages
 * are not resolvable at runtime by their bare names — the native side
 * registers them with the bridge, and `registerPlugin(<native name>)` from
 * `@capacitor/core` reaches them. Outside the native app: null.
 */
async function nativePlugin<T>(name: string): Promise<T | null> {
  try {
    const core = await import("@capacitor/core");
    const Cap = core.Capacitor;
    if (!Cap || !Cap.isNativePlatform() || !Cap.isPluginAvailable(name)) return null;
    return core.registerPlugin<T>(name);
  } catch {
    return null;
  }
}

type PushPlugin = typeof import("@capacitor/push-notifications").PushNotifications;
type CameraPlugin = typeof import("@capacitor/camera").Camera;
type SharePlugin = typeof import("@capacitor/share").Share;
type BiometricPlugin = typeof import("capacitor-native-biometric").NativeBiometric;

async function importPushNotifications() {
  const PushNotifications = await nativePlugin<PushPlugin>("PushNotifications");
  return PushNotifications ? { PushNotifications } : null;
}
async function importCamera() {
  const Camera = await nativePlugin<CameraPlugin>("Camera");
  return Camera ? { Camera } : null;
}
async function importShare() {
  const Share = await nativePlugin<SharePlugin>("Share");
  return Share ? { Share } : null;
}
async function importBiometric() {
  const NativeBiometric = await nativePlugin<BiometricPlugin>("NativeBiometric");
  return NativeBiometric ? { NativeBiometric } : null;
}

/** App lifecycle (pause/resume) for the biometric app lock. */
export interface AppLifecycle {
  addListener(event: "pause" | "resume", cb: () => void): Promise<{ remove: () => Promise<void> }>;
}
export async function appLifecycle(): Promise<AppLifecycle | null> {
  return nativePlugin<AppLifecycle>("App");
}

/** Biometrics available on this device (native app only). */
export async function biometricAvailable(): Promise<boolean> {
  try {
    const mod = await importBiometric();
    if (!mod) return false;
    const r = (await mod.NativeBiometric.isAvailable()) as unknown;
    return typeof r === "object" && r !== null
      ? (r as { isAvailable?: boolean }).isAvailable === true
      : r === true;
  } catch {
    return false;
  }
}

export async function detectCapabilities(): Promise<MobileCapabilities> {
  const Cap = await getCapacitor();
  if (!Cap) {
    return {
      push: false,
      camera: "mediaDevices" in navigator,
      biometric: false,
      share: "share" in navigator,
      isNative: false,
      platform: "web",
    };
  }
  const platform = Cap.getPlatform() as "ios" | "android" | "web";
  const isNative = platform !== "web";
  return {
    push: isNative,
    camera: isNative || "mediaDevices" in navigator,
    biometric: isNative,
    share: isNative || "share" in navigator,
    isNative,
    platform,
  };
}

/**
 * Request push permission and register for notifications.
 * Returns the actual device token via the registration event listener.
 * Resolves within 10s or times out with an error.
 */
export async function registerPush(): Promise<{ token?: string; error?: string }> {
  try {
    const mod = await importPushNotifications();
    if (!mod) return { error: "Push-Plugin nicht verfügbar. Nur in nativer App." };
    const { PushNotifications } = mod;

    const result = await PushNotifications.requestPermissions();
    if (result.receive !== "granted") {
      return { error: "Push-Benachrichtigungen abgelehnt" };
    }

    // Token arrives asynchronously via the 'registration' event
    const token = await new Promise<string>((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error("Push-Registrierung Timeout (10s)"));
      }, 10_000);

      const registrationHandler = (event: Record<string, unknown>) => {
        clearTimeout(timeout);
        PushNotifications.removeAllListeners().catch(() => {});
        resolve(event.value as string);
      };

      const errorHandler = (event: Record<string, unknown>) => {
        clearTimeout(timeout);
        PushNotifications.removeAllListeners().catch(() => {});
        reject(new Error((event.value as string) || "Push-Registrierung fehlgeschlagen"));
      };

      PushNotifications.addListener("registration", registrationHandler).catch(() => {});
      PushNotifications.addListener("registrationError", errorHandler).catch(() => {});

      PushNotifications.register().catch((err: unknown) => {
        clearTimeout(timeout);
        reject(err);
      });
    });

    return { token };
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Push-Plugin nicht verfügbar";
    return { error: msg };
  }
}

/**
 * Subscribe to incoming push notifications while the app is open.
 * Returns an unsubscribe function.
 */
export async function onPushNotification(
  callback: (notification: {
    title?: string;
    body?: string;
    data?: Record<string, unknown>;
  }) => void
): Promise<() => void> {
  try {
    const mod = await importPushNotifications();
    if (!mod) return () => {};
    const { PushNotifications } = mod;

    const handler = (event: Record<string, unknown>) => {
      callback(
        event.notification as { title?: string; body?: string; data?: Record<string, unknown> }
      );
    };

    await PushNotifications.addListener("pushNotificationReceived", handler);
    return () => {
      PushNotifications.removeListener(
        "pushNotificationReceived",
        handler as (event: unknown) => void
      ).catch(() => {});
    };
  } catch {
    return () => {};
  }
}

/** Capture photo or scan document. */
export async function capturePhoto(): Promise<{ base64?: string; error?: string }> {
  try {
    const mod = await importCamera();
    if (!mod) return { error: "Kamera nicht verfügbar. Bitte nutzen Sie den Datei-Upload." };
    const { Camera } = mod;
    const photo = await Camera.getPhoto({
      quality: 90,
      allowEditing: false,
      resultType: 2, // base64
      source: 2, // camera
    });
    return { base64: photo.base64String || undefined };
  } catch {
    // Fallback: file input
    return { error: "Kamera nicht verfügbar. Bitte nutzen Sie den Datei-Upload." };
  }
}

/** Check biometric availability and authenticate. */
export async function biometricAuth(): Promise<{ success: boolean; error?: string }> {
  try {
    const mod = await importBiometric();
    if (!mod) return { success: false, error: "Biometrie-Plugin nicht verfügbar" };
    const { NativeBiometric } = mod;
    // isAvailable() resolves to { isAvailable, biometryType } — the object
    // itself is always truthy.
    const available = (await NativeBiometric.isAvailable()) as unknown;
    const ok =
      typeof available === "object" && available !== null
        ? (available as { isAvailable?: boolean }).isAvailable === true
        : available === true;
    if (!ok) return { success: false, error: "Biometrie nicht verfügbar" };
    await NativeBiometric.verifyIdentity({
      reason: "Subsumio entsperren",
      title: "Biometrische Authentifizierung",
      subtitle: "Bestätigen Sie Ihre Identität",
      description: "Face ID, Touch ID oder Fingerabdruck verwenden",
    });
    return { success: true };
  } catch {
    return { success: false, error: "Biometrie-Plugin nicht verfügbar" };
  }
}

/** Share content via native share sheet. */
export async function nativeShare(opts: {
  title: string;
  text: string;
  url?: string;
}): Promise<void> {
  try {
    const mod = await importShare();
    if (!mod) throw new Error("Share plugin unavailable");
    const { Share } = mod;
    await Share.share(opts);
  } catch {
    if ("share" in navigator) {
      await (navigator as Navigator & { share: (opts: unknown) => Promise<void> }).share(opts);
    }
  }
}
