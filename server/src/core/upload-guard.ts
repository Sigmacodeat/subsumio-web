/**
 * Server-side upload concurrency guard — belt & suspenders.
 *
 * Even with presigned URLs (bytes bypass the server), the fallback paths
 * (direct-upload, same-origin upload, streaming) still buffer through the
 * server. This guard prevents OOM by limiting concurrent uploads by size.
 *
 * Size-aware: small files (< 50 MB) get 4 concurrent slots, large files
 * get 1 slot — matching the client-side runUploadPool logic.
 *
 * Token-based: each acquire returns a unique token, so releasing never
 * matches the wrong slot (previous size-based matching was buggy when two
 * files of the same size uploaded simultaneously).
 *
 * Reaper: slots older than 5 minutes are auto-released to prevent leaks
 * when res events never fire (edge cases, proxy timeouts).
 */

const SMALL_PARALLEL = 4;
const LARGE_PARALLEL = 1;
const LARGE_THRESHOLD = 50 * 1024 * 1024; // 50 MB
const SLOT_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes

interface UploadSlot {
  token: string;
  size: number;
  startedAt: number;
}

const activeUploads: UploadSlot[] = [];

function activeSmallCount(): number {
  return activeUploads.filter((s) => s.size < LARGE_THRESHOLD).length;
}

function activeLargeCount(): number {
  return activeUploads.filter((s) => s.size >= LARGE_THRESHOLD).length;
}

/**
 * Remove slots that have been held longer than SLOT_TIMEOUT_MS.
 * Prevents leaks when res events never fire.
 */
function reapStaleSlots(): void {
  const now = Date.now();
  for (let i = activeUploads.length - 1; i >= 0; i--) {
    if (now - activeUploads[i].startedAt > SLOT_TIMEOUT_MS) {
      const stale = activeUploads[i];
      activeUploads.splice(i, 1);
      console.warn(
        `[upload-guard] Reaped stale slot ${stale.token} (${stale.size} bytes, held ${Math.round((now - stale.startedAt) / 1000)}s)`
      );
    }
  }
}

/**
 * Try to acquire an upload slot. Returns a token string if the upload can
 * proceed, null if all slots are full. The caller must call `releaseUpload`
 * with the token when done.
 */
export function tryAcquireUpload(size: number): string | null {
  reapStaleSlots();
  const isLarge = size >= LARGE_THRESHOLD;
  const activeSmall = activeSmallCount();
  const activeLarge = activeLargeCount();
  if (isLarge) {
    if (activeLarge >= LARGE_PARALLEL) return null;
  } else {
    if (activeSmall >= SMALL_PARALLEL) return null;
  }
  const token = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  activeUploads.push({ token, size, startedAt: Date.now() });
  return token;
}

/**
 * Release an upload slot by token. Safe to call multiple times (idempotent).
 */
export function releaseUpload(token: string): void {
  const idx = activeUploads.findIndex((s) => s.token === token);
  if (idx >= 0) activeUploads.splice(idx, 1);
}

/**
 * Express middleware that enforces the concurrency guard based on
 * Content-Length. Returns 429 with Retry-After if slots are full.
 */
export function uploadConcurrencyGuard(req: any, res: any, next: any): void {
  const contentLength = parseInt(req.headers["content-length"] ?? "0", 10);
  if (!contentLength || contentLength <= 0) {
    // No Content-Length — let it through (chunked transfer, presign, etc.)
    return next();
  }

  const token = tryAcquireUpload(contentLength);
  if (!token) {
    const isLarge = contentLength >= LARGE_THRESHOLD;
    const counts = getActiveCounts();
    const active = isLarge ? counts.large : counts.small;
    const max = isLarge ? LARGE_PARALLEL : SMALL_PARALLEL;
    res.set("Retry-After", "30");
    res.status(429).json({
      error: "upload_concurrency_limit",
      message: `Upload-Limit erreicht (${active}/${max} aktive ${isLarge ? "große" : "kleine"} Uploads). Bitte in ~30 Sekunden erneut versuchen.`,
      active,
      max,
    });
    return;
  }

  // Release on response finish or close
  let released = false;
  const release = () => {
    if (!released) {
      released = true;
      releaseUpload(token);
    }
  };
  res.on("finish", release);
  res.on("close", release);

  next();
}

/**
 * Get current upload statistics (for monitoring/debugging).
 */
export function getUploadStats(): {
  activeSmall: number;
  activeLarge: number;
  maxSmall: number;
  maxLarge: number;
} {
  reapStaleSlots();
  return {
    activeSmall: activeSmallCount(),
    activeLarge: activeLargeCount(),
    maxSmall: SMALL_PARALLEL,
    maxLarge: LARGE_PARALLEL,
  };
}

// Re-export for middleware internal use (avoids double-reap)
function getActiveCounts() {
  reapStaleSlots();
  return { small: activeSmallCount(), large: activeLargeCount() };
}
