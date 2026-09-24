import { z } from "zod";
import { NextResponse } from "next/server";
import { createHandler, apiError } from "@/lib/api-handler";
import { revokeSession, revokeSessionRows } from "@/lib/auth/session-registry";
import { SESSION_COOKIE } from "@/lib/auth/session";

const revokeSchema = z
  .object({
    sid: z.string().min(1).max(128).optional(),
    allOthers: z.boolean().optional(),
  })
  .refine((d) => Boolean(d.sid) !== Boolean(d.allOthers), {
    message: "either_sid_or_all_others",
  });

/**
 * POST /api/auth/sessions/revoke
 * Revoke a single session ({ sid }) or every session except the current one
 * ({ allOthers: true }). Scoped to the caller's own rows — a foreign sid is
 * a 404, never a cross-account revoke.
 */
export const POST = createHandler(
  {
    action: "auth.sessions",
    rateTier: "standard",
    body: revokeSchema,
    audit: (ctx, body) => ({
      action: body.allOthers ? "user.sessions_revoked_others" : "user.session_revoked",
      entityType: "user",
      entityId: ctx.user.id,
      details: body.allOthers ? {} : { sid: body.sid },
    }),
  },
  async (ctx, body) => {
    if (body.allOthers) {
      const revoked = await revokeSessionRows(ctx.user.id, ctx.sessionId ?? null);
      return Response.json({ ok: true, revoked });
    }

    const ok = await revokeSession(ctx.user.id, body.sid!);
    if (!ok) return apiError("session_not_found", "Sitzung nicht gefunden.", 404);

    // Revoking the current session ends it right now — drop the cookie so the
    // browser doesn't keep presenting a dead token.
    const res = NextResponse.json({ ok: true });
    if (body.sid === ctx.sessionId) res.cookies.delete(SESSION_COOKIE);
    return res;
  }
);
