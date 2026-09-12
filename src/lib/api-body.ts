// Client-side counterpart to apiSuccess/apiError (src/lib/api-response.ts).
//
// Routes answer successes as { data: T } and failures as { error, code }.
// Several screens read fields straight off the JSON body, which silently
// yields `undefined` for wrapped successes. unwrapApiBody returns the payload
// for successes (with ok: true for object payloads, so legacy `body.ok` checks
// keep working) and leaves error bodies and unwrapped responses untouched.

// Default `any` matches Response.json(), so call sites keep their typing.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function unwrapApiBody<T = any>(body: unknown): T {
  if (body && typeof body === "object" && "data" in body && !("error" in body)) {
    const payload = (body as { data: unknown }).data;
    if (payload && typeof payload === "object" && !Array.isArray(payload)) {
      return { ...(payload as Record<string, unknown>), ok: true } as T;
    }
    return payload as T;
  }
  return body as T;
}
