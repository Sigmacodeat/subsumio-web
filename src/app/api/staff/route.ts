import { z } from "zod";
import { createHandler, apiSuccess, apiError, clientIpOf } from "@/lib/api-handler";
import { getEnginePage } from "@/lib/engine-page-io";
import { logAudit } from "@/lib/audit";
import { ENGINE_URL } from "@/lib/engine";
import { listEnginePages } from "@/lib/engine-pages";
import { zonedDateString } from "@/lib/datetime";
import { createStaffMember, vacationAccount, StaffInputError, type StaffMember } from "@/lib/staff";
import type { AbsenceRecord } from "@/lib/absence";

export const dynamic = "force-dynamic";

const roleEnum = z.enum(["partner", "anwalt", "assistenz", "rechtsfachwirt", "sonstige"]);
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "ISO-Datum erwartet");

const createSchema = z.object({
  name: z.string().min(1).max(200),
  email: z.string().email().max(300),
  role: roleEnum.optional(),
  hired_at: isoDate.optional(),
  contract_until: isoDate.optional(),
  vacation_days_per_year: z.number().int().min(0).max(60).optional(),
  vacation_carryover_days: z.number().min(-60).max(200).optional(),
  phone: z.string().max(60).optional(),
  notes: z.string().max(2000).optional(),
});

async function enginePostPage(ctx: { headers: Record<string, string> }, page: unknown) {
  const res = await fetch(`${ENGINE_URL}/api/pages`, {
    method: "POST",
    headers: { ...ctx.headers, "Content-Type": "application/json" },
    body: JSON.stringify(page),
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) throw new Error(`engine write failed: ${res.status}`);
}

export const POST = createHandler(
  {
    action: "staff.write",
    rateTier: "standard",
    body: createSchema,
    audit: (_ctx, body) => ({
      action: "settings.update" as const,
      entityType: "staff_member",
      details: { email: body.email, role: body.role },
    }),
  },
  async (ctx, body) => {
    let member: StaffMember;
    try {
      member = createStaffMember(body);
    } catch (err) {
      if (err instanceof StaffInputError) return apiError("invalid_input", err.message, 400);
      throw err;
    }
    try {
      await enginePostPage(ctx, {
        slug: `legal/staff/${member.id}`,
        title: `Mitarbeiter:in: ${member.name}`,
        type: "staff_member",
        frontmatter: member,
      });
    } catch {
      return apiError("engine_write_failed", "Mitarbeiter:in konnte nicht gespeichert werden", 502);
    }
    return apiSuccess({ member });
  }
);

const listQuery = z.object({
  active: z.enum(["true", "false"]).optional(),
  year: z.coerce.number().int().min(2000).max(2100).optional(),
});

export const GET = createHandler(
  {
    action: "staff.read",
    rateTier: "standard",
    query: listQuery,
  },
  async (ctx, _body, query) => {
    // Cursor-paginated: a bare /api/pages call is capped at 100 rows.
    const [staffPages, absPages] = await Promise.all([
      listEnginePages(ctx.headers, "staff_member", 10_000, { strict: true }).catch(() => null),
      // Strict: a partial absence list would silently corrupt the computed
      // vacation balances (money-adjacent numbers, not just a display list).
      listEnginePages(ctx.headers, "absence_record", 10_000, { strict: true }).catch(() => null),
    ]);
    if (staffPages === null)
      return apiError("engine_error", "Mitarbeiter konnten nicht geladen werden", 502);
    if (absPages === null)
      return apiError("engine_error", "Abwesenheiten konnten nicht geladen werden", 502);

    const absences: AbsenceRecord[] = absPages
      .map((p) => p.frontmatter as AbsenceRecord | undefined)
      .filter((a): a is AbsenceRecord => Boolean(a));

    // Firm calendar year (Europe/Vienna) — UTC lagged on New Year's night.
    const year = query?.year ?? Number(zonedDateString(new Date()).slice(0, 4));
    let members: StaffMember[] = staffPages
      .map((p) => p.frontmatter as StaffMember | undefined)
      .filter((m): m is StaffMember => Boolean(m));
    if (query?.active === "true") members = members.filter((m) => m.active);
    if (query?.active === "false") members = members.filter((m) => !m.active);

    return apiSuccess({
      members: members.map((m) => ({ ...m, vacation: vacationAccount(m, absences, year) })),
    });
  }
);

const patchSchema = z.object({
  id: z.string().regex(/^[a-zA-Z0-9_-]{1,100}$/),
  member: z.object({
    name: z.string().min(1).max(200),
    email: z.string().email().max(300),
    role: roleEnum,
    hired_at: isoDate.optional(),
    contract_until: isoDate.optional(),
    vacation_days_per_year: z.number().int().min(0).max(60),
    vacation_carryover_days: z.number().min(-60).max(200),
    phone: z.string().max(60).optional(),
    notes: z.string().max(2000).optional(),
    active: z.boolean(),
    // Accepted for compatibility, never trusted: timestamps come from the server.
    created_at: z.string().optional(),
    updated_at: z.string().optional(),
  }),
});

/** Fields whose change is recorded (from → to) in the audit entry. */
const AUDITED_FIELDS = [
  "name",
  "email",
  "role",
  "hired_at",
  "contract_until",
  "vacation_days_per_year",
  "vacation_carryover_days",
  "phone",
  "active",
] as const;

function staffDiff(before: StaffMember, after: StaffMember) {
  const diff: Record<string, { from: unknown; to: unknown }> = {};
  for (const key of AUDITED_FIELDS) {
    if ((before[key] ?? null) !== (after[key] ?? null)) {
      diff[key] = { from: before[key] ?? null, to: after[key] ?? null };
    }
  }
  // Notes are free text (possibly health or personal remarks): only whether they changed.
  if ((before.notes ?? "") !== (after.notes ?? "")) diff.notes = { from: "…", to: "…" };
  return diff;
}

/**
 * PATCH: edits an existing staff record (admin only). The record must exist
 * — no upsert under a client-chosen id — and the audit entry names every
 * changed field with its old and new value.
 */
export const PATCH = createHandler(
  {
    action: "staff.write",
    rateTier: "standard",
    body: patchSchema,
  },
  async (ctx, body, _query, req) => {
    const slug = `legal/staff/${body.id}`;
    let existingPage: Awaited<ReturnType<typeof getEnginePage>>;
    try {
      existingPage = await getEnginePage(ctx.headers, slug);
    } catch {
      return apiError("engine_error", "Mitarbeiter:in konnte nicht geladen werden", 502);
    }
    const before = existingPage?.frontmatter as unknown as StaffMember | undefined;
    if (!before || before.id !== body.id) {
      return apiError("staff_not_found", "Mitarbeiter:in nicht gefunden", 404);
    }
    const { created_at: _clientCreated, updated_at: _clientUpdated, ...fields } = body.member;
    const member: StaffMember = {
      ...fields,
      id: body.id,
      created_at: before.created_at,
      updated_at: new Date().toISOString(),
    };
    try {
      await enginePostPage(ctx, {
        slug,
        title: `Mitarbeiter:in: ${member.name}`,
        type: "staff_member",
        frontmatter: member,
      });
    } catch {
      return apiError("engine_write_failed", "Änderung konnte nicht gespeichert werden", 502);
    }
    void logAudit("settings.update", "staff_member", {
      entityId: body.id,
      details: { changes: staffDiff(before, member) },
      brainId: ctx.brainId,
      userId: ctx.user.id,
      userEmail: ctx.user.email,
      ip: clientIpOf(req),
    });
    return apiSuccess({ member });
  }
);
