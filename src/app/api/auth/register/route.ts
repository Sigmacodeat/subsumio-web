/**
 * POST /api/auth/register — legacy alias of /api/auth/signup.
 *
 * This endpoint used to carry its own, diverging signup implementation: no
 * verification mail, no jurisdiction handling, a `referredBy` field the
 * schema silently stripped. Consolidated per docs/KANZLEI_OS_API_AUDIT —
 * both paths now run the same code so fixes cannot drift apart again.
 */
export { POST } from "../signup/route";
