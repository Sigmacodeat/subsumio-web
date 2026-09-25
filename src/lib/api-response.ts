/**
 * Standardized API response helpers.
 *
 * Every API route should use these instead of ad-hoc Response.json() calls
 * to guarantee a consistent response shape across all 68+ endpoints.
 *
 * Error shape:   { error: "Human readable", code: "MACHINE_CODE", details?: {} }
 * Success shape: { data: T, meta?: { page, limit, total } }
 */

export interface ApiErrorBody {
  error: string;
  code: string;
  details?: Record<string, unknown>;
}

export interface ApiSuccessBody<T> {
  data: T;
  meta?: {
    page?: number;
    limit?: number;
    total?: number;
    [key: string]: unknown;
  };
}

/** 400 Bad Request */
export function apiBadRequest(
  code: string,
  message: string,
  details?: Record<string, unknown>
): Response {
  return apiError(code, message, 400, details);
}

/** 401 Unauthorized */
export function apiUnauthorized(message = "Authentication required"): Response {
  return apiError("unauthorized", message, 401);
}

/** 403 Forbidden */
export function apiForbidden(
  message = "Insufficient permissions",
  details?: Record<string, unknown>
): Response {
  return apiError("forbidden", message, 403, details);
}

/** 404 Not Found */
export function apiNotFound(resource = "Resource"): Response {
  return apiError("not_found", `${resource} not found`, 404);
}

/** 409 Conflict */
export function apiConflict(
  code: string,
  message: string,
  details?: Record<string, unknown>
): Response {
  return apiError(code, message, 409, details);
}

/** 422 Unprocessable Entity */
export function apiUnprocessable(
  code: string,
  message: string,
  details?: Record<string, unknown>
): Response {
  return apiError(code, message, 422, details);
}

/** 429 Too Many Requests */
export function apiRateLimited(retryAfterSeconds: number): Response {
  return new Response(
    JSON.stringify({
      error: "Too many requests. Please slow down.",
      code: "rate_limited",
      details: { retry_after: retryAfterSeconds },
    }),
    {
      status: 429,
      headers: {
        "Content-Type": "application/json",
        "Retry-After": String(retryAfterSeconds),
      },
    }
  );
}

/** 503 Service Unavailable */
export function apiUnavailable(message = "Service temporarily unavailable"): Response {
  return apiError("service_unavailable", message, 503);
}

/**
 * Generic error response.
 * Always returns { error, code, details? } with the given HTTP status.
 */
export function apiError(
  code: string,
  message: string,
  status: number,
  details?: Record<string, unknown>
): Response {
  const body: ApiErrorBody = { error: message, code };
  if (details) body.details = details;
  return Response.json(body, { status });
}

/**
 * Standard success response.
 * Always returns { data, meta? } with HTTP 200.
 */
export function apiSuccess<T>(data: T, meta?: ApiSuccessBody<T>["meta"], status = 200): Response {
  const body: ApiSuccessBody<T> = { data };
  if (meta) body.meta = meta;
  return Response.json(body, { status });
}

/**
 * Paginated success response.
 * Returns { data, meta: { page, limit, total } }.
 */
export function apiPaginated<T>(
  data: T[],
  opts: { page: number; limit: number; total: number }
): Response {
  return apiSuccess(data, {
    page: opts.page,
    limit: opts.limit,
    total: opts.total,
  }) as Response;
}

/**
 * SSE streaming response with proper headers.
 * Used for AI responses (think, contract-draft, etc.).
 */
export function apiStream(
  body: ReadableStream<Uint8Array>,
  opts?: {
    contentType?: string;
    aiGenerated?: boolean;
  }
): Response {
  return new Response(body, {
    status: 200,
    headers: {
      "Content-Type": opts?.contentType ?? "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
      // EU AI Act Art. 50: machine-readable marker
      ...(opts?.aiGenerated ? { "X-AI-Generated": "true" } : {}),
    },
  });
}

/**
 * JSON response with caching headers for GET endpoints.
 * Sets Cache-Control and ETag for client-side caching.
 */
export function apiCached<T>(
  data: T,
  opts: {
    maxAgeSeconds?: number;
    swrSeconds?: number;
    tag?: string;
  }
): Response {
  const maxAge = opts.maxAgeSeconds ?? 60;
  const swr = opts.swrSeconds ?? 600;
  const etag = `"${opts.tag ?? hashJson(data)}"`;

  return Response.json(data, {
    status: 200,
    headers: {
      "Cache-Control": `public, max-age=${maxAge}, stale-while-revalidate=${swr}`,
      ETag: etag,
    },
  });
}

/** Quick stable hash for ETag generation (not cryptographic). */
function hashJson(data: unknown): string {
  const str = JSON.stringify(data);
  let h = 0;
  for (let i = 0; i < str.length; i++) {
    h = ((h << 5) - h + str.charCodeAt(i)) | 0;
  }
  return Math.abs(h).toString(36);
}

/**
 * Read an error body from any API route into `{ message, code }`.
 *
 * Two shapes are in circulation:
 *   - `apiError()`:  `{ error: "<Text>", code: "<machine_code>" }`
 *   - older routes:  `{ error: "<machine_code>", message: "<Text>" }`
 * Reading `error` as the code (or as the text) unconditionally gets one of the
 * two wrong. With a `code` field present, `error` is the text; without one, a
 * lower-case identifier in `error` is the code and `message` the text.
 */
export function readApiError(
  json: unknown,
  fallback = "Unbekannter Fehler"
): { message: string; code?: string } {
  if (!json || typeof json !== "object") {
    return { message: typeof json === "string" && json.trim() ? json : fallback };
  }
  const body = json as { error?: unknown; code?: unknown; message?: unknown };
  const pick = (v: unknown) => (typeof v === "string" && v.trim() ? v : undefined);
  const error = pick(body.error);
  const message = pick(body.message);
  const code = pick(body.code);
  if (code) return { message: error ?? message ?? fallback, code };
  if (error && /^[a-z][a-z0-9_.-]*$/.test(error)) return { message: message ?? error, code: error };
  return { message: error ?? message ?? fallback };
}
