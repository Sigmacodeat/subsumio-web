import { describe, expect, it } from "vitest";
import {
  buildEnvelopeCustomFields,
  connectEventKey,
  docusignOAuthHost,
  parseConnectJson,
  parseConnectXml,
} from "@/lib/docusign-connect";

describe("DocuSign envelope custom fields", () => {
  it("are sent in the REST API format, empty values dropped", () => {
    expect(
      buildEnvelopeCustomFields({
        brain_id: "brain_1",
        case_slug: "legal/cases/a",
        note: undefined,
      })
    ).toEqual({
      textCustomFields: [
        { name: "brain_id", value: "brain_1", show: "false", required: "false" },
        { name: "case_slug", value: "legal/cases/a", show: "false", required: "false" },
      ],
    });
  });

  it("are read back from a Connect JSON event", () => {
    const event = parseConnectJson({
      event: "envelope-completed",
      data: {
        envelopeId: "env-1",
        envelopeSummary: {
          status: "completed",
          customFields: { textCustomFields: [{ name: "brain_id", value: "brain_1" }] },
        },
      },
    });
    expect(event).toEqual({
      envelopeId: "env-1",
      status: "completed",
      customFields: { brain_id: "brain_1" },
    });
  });

  it("are read back from a Connect XML event, with the envelope status (not a recipient's)", () => {
    const xml = `<?xml version="1.0"?><DocuSignEnvelopeInformation><EnvelopeStatus>
      <RecipientStatuses><RecipientStatus><Status>Sent</Status></RecipientStatus></RecipientStatuses>
      <EnvelopeID>env-2</EnvelopeID><Status>Completed</Status>
      <CustomFields><CustomField><Name>brain_id</Name><Show>False</Show><Value>brain_2</Value></CustomField></CustomFields>
    </EnvelopeStatus></DocuSignEnvelopeInformation>`;
    expect(parseConnectXml(xml)).toEqual({
      envelopeId: "env-2",
      status: "completed",
      customFields: { brain_id: "brain_2" },
    });
  });
});

describe("Connect processing", () => {
  it("deduplicates per envelope and status, so completion follows sending", () => {
    expect(connectEventKey({ envelopeId: "e", status: "sent" })).not.toBe(
      connectEventKey({ envelopeId: "e", status: "completed" })
    );
    expect(connectEventKey({ envelopeId: "e" })).toBeNull();
  });

  it("uses the production OAuth host outside the demo environment", () => {
    expect(docusignOAuthHost("https://demo.docusign.net/restapi/v2.1")).toBe(
      "account-d.docusign.com"
    );
    expect(docusignOAuthHost("https://eu.docusign.net/restapi/v2.1")).toBe("account.docusign.com");
    expect(
      docusignOAuthHost("https://eu.docusign.net/restapi", "https://account.docusign.com/")
    ).toBe("account.docusign.com");
  });
});
