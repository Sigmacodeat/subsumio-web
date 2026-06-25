/**
 * Gap 14: Permissions & Governance API.
 *
 * GET /api/legal/permissions — list all roles + permissions
 * POST /api/legal/permissions/check — check if user has permission
 */

import { NextRequest, NextResponse } from "next/server";
import {
  getRoles,
  checkPermission,
  getUserFromHeaders,
  getUserPermissions,
  DEFAULT_USER,
  type PipelinePermission,
} from "@/lib/legal/pipeline-permissions";

export async function GET() {
  return NextResponse.json({
    roles: getRoles(),
    permissions: [
      "pipeline:trigger",
      "pipeline:resume",
      "pipeline:view",
      "pipeline:export",
      "pipeline:delete",
      "pipeline:config",
      "pipeline:review",
      "pipeline:override",
    ] as PipelinePermission[],
  });
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const permission = body.permission as PipelinePermission;
    const user = getUserFromHeaders(req.headers) ?? DEFAULT_USER;

    if (!permission) {
      return NextResponse.json({ error: "permission is required" }, { status: 400 });
    }

    const hasPermission = checkPermission(user, permission);
    return NextResponse.json({
      user: { id: user.id, email: user.email, role: user.role },
      permission,
      granted: hasPermission,
      all_permissions: getUserPermissions(user),
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
