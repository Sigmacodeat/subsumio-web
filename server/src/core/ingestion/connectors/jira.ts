/**
 * JiraConnector — ingest issues and comments from Jira Cloud.
 *
 * Authentication: Jira API token (PAT) + email.
 *   - Get API token at https://id.atlassian.com/manage-profile/security/api-tokens
 *   - Use email:api-token as api_key, or pass them separately.
 *
 * Delta sync: JQL `updated >= "YYYY-MM-DD HH:mm"` or `updatedDate` cursor.
 * Rate limit: 10 req/s per app; 100 req/s per user.
 *
 * Setup:
 *   gbrain connector add jira \
 *     --api-key EMAIL:API_TOKEN \
 *     --base-url https://your-domain.atlassian.net
 *
 *   gbrain connector sync jira
 */

import { BaseConnector, type ConnectorConfig, type ConnectorItem } from './base.ts';
import type { IngestionEvent } from '../types.ts';

interface JiraIssue {
  id: string;
  key: string;
  self: string;
  fields: {
    summary: string;
    description?: string | { content?: Array<{ type: string; content?: Array<{ text: string }> }> };
    created: string;
    updated: string;
    status?: { name: string };
    assignee?: { displayName: string; emailAddress?: string } | null;
    reporter?: { displayName: string };
    issuetype?: { name: string };
    priority?: { name: string };
    labels?: string[];
    project?: { key: string; name: string };
    comment?: { comments: Array<{ body?: string; author?: { displayName: string }; created: string }> };
  };
}

export class JiraConnector extends BaseConnector {
  constructor(config: ConnectorConfig = {}) {
    super('jira', config);
  }

  getApiRateLimit() {
    return { capacity: 10, windowMs: 1000 };
  }

  async refreshToken(): Promise<void> {
    // Jira API tokens don't expire; no-op.
  }

  async fetchDelta(cursor?: string): Promise<{ items: ConnectorItem[]; nextCursor?: string }> {
    const creds = this.getAccessToken();
    if (!creds) throw new Error('Jira credentials missing. Run: gbrain connector add jira --api-key EMAIL:TOKEN --base-url https://your-domain.atlassian.net');

    const baseUrl = (this._config.base_url as string) ?? '';
    if (!baseUrl) throw new Error('Jira base_url missing. Pass --base-url https://your-domain.atlassian.net');

    // Parse email:token from access token field.
    const [email, token] = creds.includes(':') ? creds.split(':') : ['', creds];
    const auth = Buffer.from(`${email}:${token}`).toString('base64');

    const projectFilter = (this._config.filters?.projects as string[]) ?? [];
    const issueTypeFilter = (this._config.filters?.issue_types as string[]) ?? [];
    const labelFilter = (this._config.filters?.labels as string[]) ?? [];

    // Cursor is the last `updated` timestamp we've seen.
    const lastUpdated = cursor ?? new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();

    // Build JQL.
    let jql = `updated >= "${lastUpdated.replace('T', ' ').slice(0, 19)}"`;
    if (projectFilter.length > 0) {
      jql += ` AND project IN (${projectFilter.map((p) => `"${p}"`).join(',')})`;
    }
    if (issueTypeFilter.length > 0) {
      jql += ` AND issuetype IN (${issueTypeFilter.map((t) => `"${t}"`).join(',')})`;
    }
    if (labelFilter.length > 0) {
      jql += ` AND labels IN (${labelFilter.map((l) => `"${l}"`).join(',')})`;
    }
    jql += ' ORDER BY updated ASC';

    const url = new URL(`${baseUrl}/rest/api/2/search`);
    url.searchParams.set('jql', jql);
    url.searchParams.set('maxResults', String(this._config.batch_size ?? 50));
    url.searchParams.set('fields', 'summary,description,created,updated,status,assignee,reporter,issuetype,priority,labels,project,comment');

    const res = await fetch(url.toString(), {
      headers: {
        Authorization: `Basic ${auth}`,
        'Content-Type': 'application/json',
      },
    });

    if (!res.ok) {
      const err = await res.text();
      throw new Error(`Jira search failed: ${res.status} ${err}`);
    }

    const data = await res.json() as { issues: JiraIssue[]; total: number };
    const issues = data.issues ?? [];

    const items: ConnectorItem[] = [];
    let latestUpdated = lastUpdated;

    for (const issue of issues) {
      const f = issue.fields;
      const desc = this._extractDescription(f.description);
      const comments = f.comment?.comments ?? [];

      const content = [
        `# ${issue.key}: ${f.summary}`,
        ``,
        `- **Type:** ${f.issuetype?.name ?? 'Unknown'}`,
        `- **Status:** ${f.status?.name ?? 'Unknown'}`,
        `- **Priority:** ${f.priority?.name ?? 'None'}`,
        f.assignee ? `- **Assignee:** ${f.assignee.displayName}` : '',
        f.reporter ? `- **Reporter:** ${f.reporter.displayName}` : '',
        f.labels?.length ? `- **Labels:** ${f.labels.join(', ')}` : '',
        f.project ? `- **Project:** ${f.project.name} (${f.project.key})` : '',
        ``,
        desc ? `## Description\n${desc}` : '',
        comments.length > 0 ? `## Comments (${comments.length})` : '',
        ...comments.map((c) => `**${c.author?.displayName ?? 'Unknown'}** (${c.created}):\n${c.body ?? ''}`),
      ].filter(Boolean).join('\n\n');

      items.push({
        id: issue.id,
        title: `${issue.key}: ${f.summary}`,
        modified_at: f.updated,
        content,
        content_type: 'text/markdown',
        url: `${baseUrl}/browse/${issue.key}`,
        metadata: {
          jira_key: issue.key,
          project: f.project?.key,
          issue_type: f.issuetype?.name,
          status: f.status?.name,
          priority: f.priority?.name,
          assignee: f.assignee?.displayName,
          labels: f.labels,
          comment_count: comments.length,
        },
      });

      if (f.updated > latestUpdated) {
        latestUpdated = f.updated;
      }
    }

    return { items, nextCursor: latestUpdated };
  }

  async toIngestionEvent(item: ConnectorItem): Promise<IngestionEvent> {
    return {
      source_id: this.id,
      source_kind: this.kind,
      source_uri: item.url ?? `jira://${item.id}`,
      received_at: new Date().toISOString(),
      content_type: 'text/markdown',
      content: item.content,
      content_hash: this.hashContent(item.content),
      metadata: item.metadata,
    };
  }

  // ── Helpers ───────────────────────────────────────────────────────

  private _extractDescription(desc: unknown): string {
    if (!desc) return '';
    if (typeof desc === 'string') return desc;
    // Atlassian Document Format (ADF) — extract text from nested content.
    if (typeof desc === 'object' && desc !== null) {
      const obj = desc as Record<string, unknown>;
      const content = obj.content as Array<Record<string, unknown>> | undefined;
      if (content) {
        return content
          .map((block) => {
            const blockContent = block.content as Array<{ text?: string }> | undefined;
            if (blockContent) {
              return blockContent.map((c) => c.text ?? '').join('');
            }
            return '';
          })
          .join('\n');
      }
    }
    return '';
  }
}
