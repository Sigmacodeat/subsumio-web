import { z } from "zod";
import { createHandler } from "@/lib/api-handler";
import {
  getRoles,
  checkPermission,
  getUserFromHeaders,
  getUserPermissions,
  DEFAULT_USER,
  type PipelinePermission,
} from "@/lib/legal/pipeline-permissions";

const ALL_PERMISSIONS: PipelinePermission[] = [
  "pipeline:trigger",
  "pipeline:resume",
  "pipeline:view",
  "pipeline:export",
  "pipeline:delete",
  "pipeline:config",
  "pipeline:review",
  "pipeline:override",
];

export const GET = createHandler(
  {
    action: "brain.read",
    rateTier: "standard",
    cacheMaxAge: 60,
  },
  async () => {
    return Response.json({ roles: getRoles(), permissions: ALL_PERMISSIONS });
  }
);

const postSchema = z.object({
  permission: z.string().min(1).max(200),
});

export const POST = createHandler(
  {
    action: "brain.read",
    rateTier: "standard",
    body: postSchema,
  },
  async (ctx, body) => {
    const headers = new Headers(ctx.headers as Record<string, string>);
    const user = getUserFromHeaders(headers) ?? DEFAULT_USER;
    const permission = body.permission as PipelinePermission;
    const hasPermission = checkPermission(user, permission);
    return Response.json({
      user: { id: user.id, email: user.email, role: user.role },
      permission,
      granted: hasPermission,
      all_permissions: getUserPermissions(user),
    });
  }
);
