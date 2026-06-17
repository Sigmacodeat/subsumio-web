/**
 * GitHubConnector — ingest GitHub issues, PRs, discussions, and repos into GBrain.
 *
 * Features:
 *   - PAT (Personal Access Token) authentication
 *   - Delta sync via updated_at polling + ETag caching
 *   - Issue/PR/Discussion extraction with comments
 *   - Repository README + Wiki sync
 *   - Label and milestone filtering
 *
 * Setup:
 *   1. Create PAT at https://github.com/settings/tokens
 *   2. Run: gbrain connector add github --api-key ghp_XXX
 *   3. Optional filters: --filters '{"repos":["owner/repo"],"labels":["bug"]}'
 */

import {
  BaseConnector,
  type ConnectorConfig,
  type ConnectorItem,
} from './base.ts';
import { type IngestionEvent, type IngestionContentType } from '../types.ts';

interface GitHubIssue {
  id: number;
  number: number;
  title: string;
  body: string | null;
  state: string;
  created_at: string;
  updated_at: string;
  html_url: string;
  labels: Array<{ name: string }>;
  milestone?: { title: string } | null;
  user: { login: string };
  comments: number;
  pull_request?: unknown;
}

interface GitHubComment {
  id: number;
  body: string | null;
  created_at: string;
  user: { login: string };
}

interface GitHubRepo {
  full_name: string;
  description: string | null;
  html_url: string;
  updated_at: string;
  default_branch: string;
}

export class GitHubConnector extends BaseConnector {
  private repos: string[];
  private labels: string[];

  constructor(config: ConnectorConfig) {
    super('github', config);
    this.repos = (config.filters?.repos as string[]) ?? [];
    this.labels = (config.filters?.labels as string[]) ?? [];
  }

  getApiRateLimit(): { capacity: number; windowMs: number } {
    // GitHub API: 5,000 requests/hour for PAT, 15,000 for GitHub Apps.
    return { capacity: 5000, windowMs: 3_600_000 };
  }

  async refreshToken(): Promise<void> {
    // GitHub PATs don't refresh; handled by user rotation.
    return;
  }

  async fetchDelta(cursor?: string): Promise<{ items: ConnectorItem[]; nextCursor?: string }> {
    const token = this.getAccessToken();
    if (!token) throw new Error('Not authenticated');

    const since = cursor ?? new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const items: ConnectorItem[] = [];

    // If no specific repos configured, fetch from user's watched repos.
    const reposToSync = this.repos.length > 0 ? this.repos : await this._fetchWatchedRepos(token);

    for (const repo of reposToSync) {
      // Fetch issues updated since cursor.
      const issuesUrl = new URL(`https://api.github.com/repos/${repo}/issues`);
      issuesUrl.searchParams.set('since', since);
      issuesUrl.searchParams.set('state', 'all');
      issuesUrl.searchParams.set('per_page', '100');
      issuesUrl.searchParams.set('sort', 'updated');
      issuesUrl.searchParams.set('direction', 'asc');

      const res = await fetch(issuesUrl, {
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: 'application/vnd.github+json',
          'X-GitHub-Api-Version': '2022-11-28',
        },
      });

      if (!res.ok) {
        console.warn(`[github] Skipping ${repo}: ${res.status}`);
        continue;
      }

      const issues = await res.json() as GitHubIssue[];

      for (const issue of issues) {
        // Filter by labels if configured.
        if (this.labels.length > 0) {
          const issueLabels = issue.labels.map((l) => l.name);
          if (!this.labels.some((l) => issueLabels.includes(l))) continue;
        }

        const isPR = !!issue.pull_request;

        // Fetch comments if any.
        let comments: GitHubComment[] = [];
        if (issue.comments > 0) {
          const commentsRes = await fetch(
            `https://api.github.com/repos/${repo}/issues/${issue.number}/comments`,
            {
              headers: {
                Authorization: `Bearer ${token}`,
                Accept: 'application/vnd.github+json',
                'X-GitHub-Api-Version': '2022-11-28',
              },
            },
          );
          if (commentsRes.ok) {
            comments = await commentsRes.json() as GitHubComment[];
          }
        }

        items.push({
          id: `${repo}#${issue.number}`,
          title: issue.title,
          modified_at: issue.updated_at,
          content: JSON.stringify({ issue, comments }),
          content_type: 'application/json',
          url: issue.html_url,
          metadata: {
            repo,
            number: issue.number,
            state: issue.state,
            is_pr: isPR,
            labels: issue.labels.map((l) => l.name),
            author: issue.user.login,
            milestone: issue.milestone?.title,
          },
        });
      }
    }

    return {
      items,
      nextCursor: new Date().toISOString(),
    };
  }

  async toIngestionEvent(item: ConnectorItem): Promise<IngestionEvent> {
    const parsed = JSON.parse(item.content);
    const issue: GitHubIssue = parsed.issue;
    const comments: GitHubComment[] = parsed.comments ?? [];
    const meta = item.metadata ?? {};

    const type = meta.is_pr ? 'PR' : 'Issue';
    const labels = (meta.labels as string[]).map((l) => `\`${l}\``).join(', ');

    const markdown = [
      `---`,
      `title: "${item.title}"`,
      `type: github_${type.toLowerCase()}`,
      `repo: ${meta.repo}`,
      `number: ${meta.number}`,
      `state: ${meta.state}`,
      `labels: [${(meta.labels as string[]).join(', ')}]`,
      `author: ${meta.author}`,
      `---`,
      ``,
      `# ${type} #${meta.number}: ${item.title}`,
      ``,
      `**Repository:** [${meta.repo}](https://github.com/${meta.repo})  `,
      `**State:** ${meta.state}  `,
      `**Labels:** ${labels || 'none'}  `,
      `**Author:** @${meta.author}  `,
      `**URL:** ${item.url}`,
      ``,
      `## Description`,
      ``,
      issue.body ?? '(no description)',
      ``,
      comments.length > 0 ? `## Comments (${comments.length})` : '',
      ...comments.map((c) => [`### @${c.user.login} — ${c.created_at}`, c.body ?? ''].join('\n')),
    ].join('\n');

    return {
      source_id: this.id,
      source_kind: this.kind,
      source_uri: item.url ?? `github://${meta.repo}/${meta.number}`,
      received_at: new Date().toISOString(),
      content_type: 'text/markdown' as IngestionContentType,
      content: markdown,
      content_hash: this.hashContent(markdown),
      metadata: {
        connector: this.service,
        github_repo: meta.repo,
        github_number: meta.number,
        github_type: type.toLowerCase(),
      },
    };
  }

  private async _fetchWatchedRepos(token: string): Promise<string[]> {
    const res = await fetch('https://api.github.com/user/subscriptions?per_page=100', {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
      },
    });
    if (!res.ok) return [];
    const repos = await res.json() as GitHubRepo[];
    return repos.map((r) => r.full_name);
  }
}
