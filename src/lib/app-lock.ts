/**
 * Biometric app lock for the native app: the app is locked on start and
 * after being in the background for longer than the grace period, and only
 * the device's biometrics (Face ID / Touch ID / fingerprint) unlock it.
 */
export const APP_LOCK_GRACE_MS = 5 * 60_000;

export function shouldLockOnResume(
  pausedAt: number | null,
  now: number,
  graceMs: number = APP_LOCK_GRACE_MS
): boolean {
  return pausedAt !== null && now - pausedAt >= graceMs;
}
