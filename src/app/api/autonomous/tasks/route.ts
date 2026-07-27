import { NextRequest, NextResponse } from "next/server";
import { createHandler, type HandlerContext } from "@/lib/api-handler";
import { ENGINE_URL } from "@/lib/engine";

export const dynamic = "force-dynamic";

/**
 * GET /api/autonomous/tasks
 *
 * Lists autonomous tasks with optional status filter.
 */
async function listTasksHandler(
  ctx: HandlerContext,
  _body: undefined,
  _query: Record<string, string>,
  req: NextRequest
) {
  const url = new URL(req.url);
  const status = url.searchParams.get("status");
  const limit = url.searchParams.get("limit") || "50";
  // Scope to the caller's own brain (org brain for team members, personal
  // otherwise). autonomous-queue.ts writes every task under its owning
  // brain_id, so reading from a hardcoded brain returned another tenant's
  // queue — or, more commonly, an empty list while the firm's own tasks
  // stayed invisible.
  const headers = ctx.headers;

  const params = new URLSearchParams({
    type: "autonomous_task",
    limit,
  });

  if (status) {
    params.set("status", status);
  }

  const res = await fetch(`${ENGINE_URL}/api/pages?${params.toString()}`, {
    headers,
    signal: AbortSignal.timeout(10_000),
  });

  if (!res.ok) {
    return NextResponse.json({ error: "fetch_failed" }, { status: 500 });
  }

  const data = await res.json();
  const pages = (Array.isArray(data) ? data : (data.pages ?? [])) as Array<{
    slug: string;
    frontmatter: {
      id: string;
      task_type: string;
      priority: "urgent" | "normal" | "low";
      title: string;
      status: string;
      case_slug?: string;
      payload: Record<string, unknown>;
      created_at: string;
      started_at?: string;
      completed_at?: string;
    };
  }>;

  const tasks = pages.map((p) => ({
    id: p.frontmatter.id,
    task_type: p.frontmatter.task_type,
    priority: p.frontmatter.priority,
    title: p.frontmatter.title,
    status: p.frontmatter.status,
    case_slug: p.frontmatter.case_slug,
    payload: p.frontmatter.payload,
    created_at: p.frontmatter.created_at,
    started_at: p.frontmatter.started_at,
    completed_at: p.frontmatter.completed_at,
  }));

  return NextResponse.json(tasks);
}

export const GET = createHandler(
  {
    action: "brain.read",
    rateTier: "standard",
  },
  listTasksHandler
);
