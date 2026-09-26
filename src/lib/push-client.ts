/**
 * Browser side of web push on sign-out: which push endpoint this browser is
 * registered with, and dropping that subscription so the next person on a
 * shared device does not receive the previous user's notifications.
 * Every call is best-effort and bounded — sign-out must never hang on it.
 */

async function currentSubscription(): Promise<PushSubscription | null> {
  if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return null;
  const lookup = (async () => {
    const reg = await navigator.serviceWorker.getRegistration();
    return (await reg?.pushManager?.getSubscription()) ?? null;
  })();
  const timeout = new Promise<null>((resolve) => setTimeout(() => resolve(null), 1500));
  try {
    return await Promise.race([lookup, timeout]);
  } catch {
    return null;
  }
}

/** This browser's push endpoint, if it is subscribed. */
export async function currentPushEndpoint(): Promise<string | undefined> {
  return (await currentSubscription())?.endpoint ?? undefined;
}

/** Unsubscribe this browser from push (after the server side is removed). */
export async function unsubscribeCurrentPush(): Promise<void> {
  try {
    await (await currentSubscription())?.unsubscribe();
  } catch {
    // Best-effort; the server no longer holds the registration anyway.
  }
}
