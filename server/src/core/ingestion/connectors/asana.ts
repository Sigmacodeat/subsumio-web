/**
 * AsanaConnector — ingest tasks, projects, and comments from Asana.
 *
 * Authentication: Asana Personal Access Token (PAT).
 *   - Get PAT at https://app.asana.com/0/developer-console
 *
 * Delta sync: `modified_since` timestamp per workspace.
 * Rate limit: 1,500 req / 15 minutes (1.67 req/s). Burst 5.
 *
 * Setup:
 *   gbrain connector add asana --api-key YOUR_PAT
 *   gbrain connector sync asana
 */

import { BaseConnector, type ConnectorConfig, type ConnectorItem } from "./base.ts";
import type { IngestionEvent } from "../types.ts";

const ASANA_API_BASE = "https://app.asana.com/api/1.0";

interface AsanaTask {
  gid: string;
  name: string;
  notes: string;
  created_at: string;
  modified_at: string;
  completed: boolean;
  due_on?: string;
  permalink_url?: string;
  assignee?: { gid: string; name: string } | null;
  projects?: Array<{ gid: string; name: string }>;
  workspace?: { gid: string; name: string };
  tags?: Array<{ gid: string; name: string }>;
}

export class AsanaConnector extends BaseConnector {
  constructor(config: ConnectorConfig = {}) {
    super("asana", config);
  }

  getApiRateLimit() {
    return { capacity: 5, windowMs: 3000 };
  }

  async refreshToken(): Promise<void> {
    // Asana PATs don't expire; no-op.
  }

  async fetchDelta(cursor?: string): Promise<{ items: ConnectorItem[]; nextCursor?: string }> {
    const token = this.getAccessToken();
    if (!token) throw new Error("Asana PAT missing. Run: gbrain connector add asana --api-key XXX");

    const projectFilter = (this._config.filters?.projects as string[]) ?? [];
    const workspaceFilter = (this._config.filters?.workspaces as string[]) ?? [];

    // Cursor is the last `modified_at` timestamp we've seen.
    const modifiedSince = cursor ?? new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();

    const items: ConnectorItem[] = [];
    let latestModified = modifiedSince;

    // Discover workspaces.
    const workspaces = await this._fetchWorkspaces(token, workspaceFilter);

    for (const ws of workspaces) {
      const tasks = await this._fetchTasks(token, ws.gid, modifiedSince, projectFilter);

      for (const task of tasks) {
        const content = [
          `# ${task.name}`,
          ``,
          `- **Status:** ${task.completed ? "Completed" : "Open"}`,
          task.due_on ? `- **Due:** ${task.due_on}` : "",
          task.assignee ? `- **Assignee:** ${task.assignee.name}` : "",
          task.projects?.length
            ? `- **Projects:** ${task.projects.map((p) => p.name).join(", ")}`
            : "",
          task.tags?.length ? `- **Tags:** ${task.tags.map((t) => t.name).join(", ")}` : "",
          ``,
          task.notes,
        ]
          .filter(Boolean)
          .join("\n");

        items.push({
          id: task.gid,
          title: task.name,
          modified_at: task.modified_at,
          content,
          content_type: "text/markdown",
          url: task.permalink_url,
          metadata: {
            workspace: ws.name,
            workspace_gid: ws.gid,
            assignee: task.assignee?.name,
            completed: task.completed,
            due_on: task.due_on,
          },
        });

        if (task.modified_at > latestModified) {
          latestModified = task.modified_at;
        }
      }
    }

    return { items, nextCursor: latestModified };
  }

  async toIngestionEvent(item: ConnectorItem): Promise<IngestionEvent> {
    return {
      source_id: this.id,
      source_kind: this.kind,
      source_uri: item.url ?? `asana://${item.id}`,
      received_at: new Date().toISOString(),
      content_type: "text/markdown",
      content: item.content,
      content_hash: this.hashContent(item.content),
      metadata: item.metadata,
    };
  }

  // ── Internal helpers ──────────────────────────────────────────────

  private async _fetchWorkspaces(
    token: string,
    filter: string[]
  ): Promise<Array<{ gid: string; name: string }>> {
    const res = await fetch(`${ASANA_API_BASE}/workspaces`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) throw new Error(`Asana workspaces failed: ${res.status}`);
    const data = (await res.json()) as { data: Array<{ gid: string; name: string }> };
    const all = data.data ?? [];
    if (filter.length === 0) return all;
    return all.filter((w) => filter.includes(w.gid) || filter.includes(w.name));
  }

  private async _fetchTasks(
    token: string,
    workspaceGid: string,
    modifiedSince: string,
    projectFilter: string[]
  ): Promise<AsanaTask[]> {
    const url = new URL(`${ASANA_API_BASE}/tasks`);
    url.searchParams.set("workspace", workspaceGid);
    url.searchParams.set("modified_since", modifiedSince);
    url.searchParams.set("limit", String(this._config.batch_size ?? 100));
    url.searchParams.set(
      "opt_fields",
      "gid,name,notes,created_at,modified_at,completed,due_on,permalink_url,assignee,projects,tags"
    );

    const res = await fetch(url.toString(), {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) throw new Error(`Asana tasks failed: ${res.status}`);
    const data = (await res.json()) as { data: AsanaTask[] };
    const tasks = data.data ?? [];

    if (projectFilter.length === 0) return tasks;
    return tasks.filter((t) =>
      t.projects?.some((p) => projectFilter.includes(p.gid) || projectFilter.includes(p.name))
    );
  }
}
