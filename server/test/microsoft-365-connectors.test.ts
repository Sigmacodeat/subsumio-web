import { afterEach, describe, expect, test } from "bun:test";
import {
  MicrosoftOneDriveConnector,
  MicrosoftOutlookConnector,
  MicrosoftSharePointConnector,
} from "../src/core/ingestion/connectors/microsoft-365.ts";

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
});

describe("Microsoft 365 connectors", () => {
  test("Outlook fetchDelta maps Graph delta messages to connector items", async () => {
    const requests: string[] = [];
    globalThis.fetch = (async (input: string | URL | Request) => {
      requests.push(String(input));
      return new Response(
        JSON.stringify({
          value: [
            {
              id: "msg-1",
              subject: "Frist in Sache 2026-014",
              bodyPreview: "Bitte Rueckmeldung bis Freitag.",
              receivedDateTime: "2026-06-22T08:00:00Z",
              lastModifiedDateTime: "2026-06-22T08:05:00Z",
              webLink: "https://outlook.office.com/mail/msg-1",
              from: { emailAddress: { address: "client@example.test" } },
              toRecipients: [{ emailAddress: { address: "lawyer@example.test" } }],
              hasAttachments: true,
              internetMessageId: "<msg-1@example.test>",
            },
          ],
          "@odata.deltaLink": "https://graph.microsoft.com/v1.0/delta-token",
        }),
        { status: 200, headers: { "content-type": "application/json" } }
      );
    }) as unknown as typeof fetch;

    const connector = new MicrosoftOutlookConnector({
      filters: { user_id: "lawyer@example.test", folder_id: "inbox" },
    });
    (connector as unknown as { _state: { access_token: string } })._state = {
      access_token: "token",
    };

    const result = await connector.fetchDelta();
    expect(requests[0]).toContain("/users/lawyer%40example.test/mailFolders/inbox/messages/delta");
    expect(result.nextCursor).toBe("https://graph.microsoft.com/v1.0/delta-token");
    expect(result.items).toHaveLength(1);
    expect(result.items[0].title).toBe("Frist in Sache 2026-014");
    expect(result.items[0].metadata?.has_attachments).toBe(true);
    expect(result.items[0].content).toContain("client@example.test");
  });

  test("OneDrive fetchDelta maps file driveItems and skips folders/deleted items", async () => {
    globalThis.fetch = (async () =>
      new Response(
        JSON.stringify({
          value: [
            {
              id: "file-1",
              name: "Klageentwurf.docx",
              webUrl: "https://contoso.sharepoint.com/file-1",
              lastModifiedDateTime: "2026-06-22T09:00:00Z",
              size: 1234,
              file: {
                mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
              },
              parentReference: { driveId: "drive-1", path: "/drive/root:/Akten" },
            },
            { id: "folder-1", name: "Akten", folder: {} },
            { id: "deleted-1", name: "deleted.pdf", deleted: {} },
          ],
          "@odata.deltaLink": "https://graph.microsoft.com/v1.0/drive-delta",
        }),
        { status: 200, headers: { "content-type": "application/json" } }
      )) as unknown as typeof fetch;

    const connector = new MicrosoftOneDriveConnector({
      filters: { user_id: "lawyer@example.test" },
    });
    (connector as unknown as { _state: { access_token: string } })._state = {
      access_token: "token",
    };

    const result = await connector.fetchDelta();
    expect(result.items).toHaveLength(1);
    expect(result.items[0].title).toBe("Klageentwurf.docx");
    expect(result.items[0].content_type).toBe("unknown");
    expect(result.items[0].metadata?.drive_id).toBe("drive-1");
  });

  test("SharePoint fetchDelta uses site drive delta when site_id is configured", async () => {
    const requests: string[] = [];
    globalThis.fetch = (async (input: string | URL | Request) => {
      requests.push(String(input));
      return new Response(JSON.stringify({ value: [], "@odata.deltaLink": "delta" }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }) as unknown as typeof fetch;

    const connector = new MicrosoftSharePointConnector({
      filters: { site_id: "contoso.sharepoint.com,site-id,web-id" },
    });
    (connector as unknown as { _state: { access_token: string } })._state = {
      access_token: "token",
    };

    await connector.fetchDelta();
    expect(requests[0]).toContain(
      "/sites/contoso.sharepoint.com%2Csite-id%2Cweb-id/drive/root/delta"
    );
  });

  test("toIngestionEvent wraps Microsoft item metadata in markdown frontmatter", async () => {
    const connector = new MicrosoftOutlookConnector();
    const event = await connector.toIngestionEvent({
      id: "msg-1",
      title: "Mandantenmail",
      modified_at: "2026-06-22T09:00:00Z",
      content: "# Mandantenmail",
      content_type: "text/markdown",
      url: "https://outlook.office.com/mail/msg-1",
      metadata: { connector: "ms365-outlook" },
    });

    expect(event.source_kind).toBe("connector:ms365-outlook");
    expect(event.content_type).toBe("text/markdown");
    expect(event.content).toContain("type: email");
    expect(event.metadata?.connector).toBe("ms365-outlook");
  });
});
