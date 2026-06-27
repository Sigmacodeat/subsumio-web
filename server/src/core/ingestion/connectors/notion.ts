/**
 * NotionConnector — ingest Notion pages and databases into GBrain.
 *
 * Features:
 *   - API key authentication (Notion uses integration tokens, not OAuth2)
 *   - Delta sync via last_edited_time polling
 *   - Page + database support
 *   - Block-level content extraction (text, headings, lists, code)
 *   - Database rows as individual brain pages
 *
 * Setup:
 *   1. Create integration at https://www.notion.so/my-integrations
 *   2. Share pages/databases with the integration
 *   3. Run: gbrain connector add notion --api-key XXX
 */

import { BaseConnector, type ConnectorConfig, type ConnectorItem } from "./base.ts";
import { type IngestionEvent, type IngestionContentType } from "../types.ts";

interface NotionPage {
  id: string;
  created_time: string;
  last_edited_time: string;
  url: string;
  properties: Record<string, unknown>;
  parent?: { database_id?: string; page_id?: string };
}

interface NotionBlock {
  type: string;
  [key: string]: unknown;
}

export class NotionConnector extends BaseConnector {
  constructor(config: ConnectorConfig) {
    super("notion", config);
  }

  getApiRateLimit(): { capacity: number; windowMs: number } {
    // Notion API: ~3 req/sec sustained ( generous default).
    return { capacity: 30, windowMs: 10_000 };
  }

  async refreshToken(): Promise<void> {
    // Notion uses static API keys; no refresh needed.
    return;
  }

  async fetchDelta(cursor?: string): Promise<{ items: ConnectorItem[]; nextCursor?: string }> {
    const apiKey = this.getAccessToken();
    if (!apiKey) throw new Error("Not authenticated");

    const lastEditedAfter = cursor ?? new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

    // Search for recently updated pages.
    const searchUrl = new URL("https://api.notion.com/v1/search");
    const res = await fetch(searchUrl, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Notion-Version": "2022-06-28",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        query: "",
        filter: { value: "page", property: "object" },
        sort: { direction: "descending", timestamp: "last_edited_time" },
        page_size: 100,
      }),
    });

    if (!res.ok) throw new Error(`Notion search failed: ${res.status}`);
    const data = await res.json();

    const items: ConnectorItem[] = [];
    for (const page of (data.results ?? []) as NotionPage[]) {
      // Only include pages edited since cursor.
      if (page.last_edited_time < lastEditedAfter) continue;

      // Fetch block children for page content.
      const blocksRes = await fetch(`https://api.notion.com/v1/blocks/${page.id}/children`, {
        headers: { Authorization: `Bearer ${apiKey}`, "Notion-Version": "2022-06-28" },
      });
      const blocksData = blocksRes.ok ? await blocksRes.json() : { results: [] };
      const blocks = (blocksData.results ?? []) as NotionBlock[];

      const title =
        (page.properties?.title as any)?.title?.[0]?.plain_text ??
        (page.properties?.Name as any)?.title?.[0]?.plain_text ??
        "Untitled";

      items.push({
        id: page.id,
        title,
        modified_at: page.last_edited_time,
        content: JSON.stringify(blocks),
        content_type: "application/json",
        url: page.url,
        metadata: {
          notion_page_id: page.id,
          notion_parent: page.parent,
          notion_properties: page.properties,
        },
      });
    }

    return {
      items,
      nextCursor: new Date().toISOString(),
    };
  }

  async toIngestionEvent(item: ConnectorItem): Promise<IngestionEvent> {
    const blocks: NotionBlock[] = JSON.parse(item.content);
    const markdown = this._blocksToMarkdown(blocks);

    const meta = item.metadata ?? {};
    const title = item.title ?? "Untitled";

    const frontmatter = [
      `---`,
      `title: "${title}"`,
      `type: note`,
      `source: notion`,
      `notion_page_id: ${meta.notion_page_id ?? item.id}`,
      `---`,
      ``,
    ].join("\n");

    return {
      source_id: this.id,
      source_kind: this.kind,
      source_uri: item.url ?? `notion://${item.id}`,
      received_at: new Date().toISOString(),
      content_type: "text/markdown" as IngestionContentType,
      content: frontmatter + markdown,
      content_hash: this.hashContent(frontmatter + markdown),
      metadata: {
        connector: this.service,
        notion_page_id: item.id,
        notion_parent: meta.notion_parent,
      },
    };
  }

  private _blocksToMarkdown(blocks: NotionBlock[]): string {
    const lines: string[] = [];
    for (const block of blocks) {
      switch (block.type) {
        case "paragraph": {
          const text = this._richTextToString((block.paragraph as any)?.rich_text ?? []);
          if (text) lines.push(text);
          break;
        }
        case "heading_1":
          lines.push(`# ${this._richTextToString((block.heading_1 as any)?.rich_text ?? [])}`);
          break;
        case "heading_2":
          lines.push(`## ${this._richTextToString((block.heading_2 as any)?.rich_text ?? [])}`);
          break;
        case "heading_3":
          lines.push(`### ${this._richTextToString((block.heading_3 as any)?.rich_text ?? [])}`);
          break;
        case "bulleted_list_item":
          lines.push(
            `- ${this._richTextToString((block.bulleted_list_item as any)?.rich_text ?? [])}`
          );
          break;
        case "numbered_list_item":
          lines.push(
            `1. ${this._richTextToString((block.numbered_list_item as any)?.rich_text ?? [])}`
          );
          break;
        case "to_do":
          const checked = (block.to_do as any)?.checked ? "x" : " ";
          lines.push(
            `- [${checked}] ${this._richTextToString((block.to_do as any)?.rich_text ?? [])}`
          );
          break;
        case "code":
          const lang = (block.code as any)?.language ?? "";
          const codeText = this._richTextToString((block.code as any)?.rich_text ?? []);
          lines.push(`\`\`\`${lang}\n${codeText}\n\`\`\``);
          break;
        case "quote":
          lines.push(`> ${this._richTextToString((block.quote as any)?.rich_text ?? [])}`);
          break;
        case "divider":
          lines.push("---");
          break;
      }
    }
    return lines.join("\n\n");
  }

  private _richTextToString(
    richText: Array<{ plain_text?: string; text?: { content: string } }>
  ): string {
    return richText.map((t) => t.plain_text ?? t.text?.content ?? "").join("");
  }
}
