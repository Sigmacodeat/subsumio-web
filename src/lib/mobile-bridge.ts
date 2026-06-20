/**
 * Capacitor Mobile Bridge für SigmaBrain.
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

// Explicit per-module imports — no new Function() / eval, CSP-safe.
async function importPushNotifications() {
  try { return await import(/* webpackIgnore: true */ "@capacitor/push-notifications"); } catch { return null; }
}
async function importCamera() {
  try { return await import(/* webpackIgnore: true */ "@capacitor/camera"); } catch { return null; }
}
async function importShare() {
  try { return await import(/* webpackIgnore: true */ "@capacitor/share"); } catch { return null; }
}
async function importBiometric() {
  try { return await import(/* webpackIgnore: true */ "capacitor-native-biometric"); } catch { return null; }
}

export async function detectCapabilities(): Promise<MobileCapabilities> {
  const Cap = await getCapacitor();
  if (!Cap) {
    return { push: false, camera: "mediaDevices" in navigator, biometric: false, share: "share" in navigator, isNative: false, platform: "web" };
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

/** Request push notification permission and get token. */
export async function registerPush(): Promise<{ token?: string; error?: string }> {
  try {
    const mod = await importPushNotifications() as typeof import("@capacitor/push-notifications") | null;
    if (!mod) return { error: "Push-Plugin nicht verfügbar. Nur in nativer App." };
    const { PushNotifications } = mod;
    const result = await PushNotifications.requestPermissions();
    if (result.receive === "granted") {
      await PushNotifications.register();
      // Token comes via event listener; this is a simplified sync version
      return { token: "pending" };
    }
    return { error: "Push-Benachrichtigungen abgelehnt" };
  } catch {
    return { error: "Push-Plugin nicht verfügbar. Nur in nativer App." };
  }
}

/** Capture photo or scan document. */
export async function capturePhoto(): Promise<{ base64?: string; error?: string }> {
  try {
    const mod = await importCamera() as typeof import("@capacitor/camera") | null;
    if (!mod) return { error: "Kamera nicht verfügbar. Nutze Datei-Upload." };
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
    return { error: "Kamera nicht verfügbar. Nutze Datei-Upload." };
  }
}

/** Check biometric availability and authenticate. */
export async function biometricAuth(): Promise<{ success: boolean; error?: string }> {
  try {
    const mod = await importBiometric() as typeof import("capacitor-native-biometric") | null;
    if (!mod) return { success: false, error: "Biometrie-Plugin nicht verfügbar" };
    const { NativeBiometric } = mod;
    const available = await NativeBiometric.isAvailable();
    if (!available) return { success: false, error: "Biometrie nicht verfügbar" };
    await NativeBiometric.verifyIdentity({
      reason: "Subsumio entsperren",
      title: "Biometrische Authentifizierung",
      subtitle: "Verifiziere deine Identität",
      description: "Nutze Face ID / Touch ID / Fingerabdruck",
    });
    return { success: true };
  } catch {
    return { success: false, error: "Biometrie-Plugin nicht verfügbar" };
  }
}

/** Share content via native share sheet. */
export async function nativeShare(opts: { title: string; text: string; url?: string }): Promise<void> {
  try {
    const mod = await importShare() as typeof import("@capacitor/share") | null;
    if (!mod) throw new Error("Share plugin unavailable");
    const { Share } = mod;
    await Share.share(opts);
  } catch {
    if ("share" in navigator) {
      await (navigator as Navigator & { share: (opts: unknown) => Promise<void> }).share(opts);
    }
  }
}
