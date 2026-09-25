/**
 * Which matter a presigned upload is filed into.
 *
 * The web app issues a signed upload token only after checking the matter
 * (exists, is a matter, not archived, readable by the caller) and puts that
 * matter's slug into the token. When a presign request carries such a token,
 * the matter is the token's — a different `case_slug` in the request body is
 * refused, and a body without one takes the token's. Requests without a token
 * (the web app's authenticated proxy) keep the body's matter; the caller's
 * matter scope is checked for it separately.
 */

export type PresignCaseBinding =
  | { ok: true; caseSlug: string | undefined }
  | { ok: false; status: 401 | 403; error: "invalid_upload_token" | "upload_token_case_mismatch" };

export function bindPresignCaseSlug(input: {
  /** An `x-upload-token` header was sent (non-empty). */
  tokenPresent: boolean;
  /** The verified token payload, or null when verification failed. */
  payload: { case_slug?: string } | null;
  /** `case_slug` from the request body (already trimmed; empty → undefined). */
  bodyCaseSlug: string | undefined;
}): PresignCaseBinding {
  const body = input.bodyCaseSlug?.trim() || undefined;
  if (!input.tokenPresent) return { ok: true, caseSlug: body };
  if (!input.payload) return { ok: false, status: 401, error: "invalid_upload_token" };
  const bound = input.payload.case_slug?.trim() || undefined;
  if (body !== undefined && body !== bound) {
    return { ok: false, status: 403, error: "upload_token_case_mismatch" };
  }
  return { ok: true, caseSlug: bound };
}
