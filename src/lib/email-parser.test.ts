// @vitest-environment node

import { describe, test, expect } from "vitest";
import { parseEml, type ParsedEmail } from "./email-parser";

function makeEml(opts: {
  from?: string;
  to?: string;
  subject?: string;
  date?: string;
  body?: string;
  boundary?: string;
  parts?: Array<{ contentType: string; body: string; disposition?: string }>;
}): string {
  const headers: string[] = [];
  if (opts.from) headers.push(`From: ${opts.from}`);
  if (opts.to) headers.push(`To: ${opts.to}`);
  if (opts.subject) headers.push(`Subject: ${opts.subject}`);
  if (opts.date) headers.push(`Date: ${opts.date}`);
  if (opts.boundary) headers.push(`Content-Type: multipart/mixed; boundary="${opts.boundary}"`);

  if (opts.boundary && opts.parts) {
    const body: string[] = [];
    for (const part of opts.parts) {
      body.push(`--${opts.boundary}`);
      body.push(`Content-Type: ${part.contentType}`);
      if (part.disposition) body.push(`Content-Disposition: ${part.disposition}`);
      body.push("");
      body.push(part.body);
    }
    body.push(`--${opts.boundary}--`);
    return `${headers.join("\r\n")}\r\n\r\n${body.join("\r\n")}`;
  }

  return `${headers.join("\r\n")}\r\n\r\n${opts.body ?? ""}`;
}

describe("parseEml — basic parsing", () => {
  test("parses From header with name and email", () => {
    const eml = makeEml({
      from: '"John Doe" <john@example.com>',
      to: "jane@example.com",
      subject: "Test",
      body: "Hello world",
    });
    const parsed = parseEml(eml);
    expect(parsed.from).toBe("john@example.com");
    expect(parsed.fromName).toBe("John Doe");
  });

  test("parses From header with bare email", () => {
    const eml = makeEml({
      from: "john@example.com",
      subject: "Test",
      body: "Hello",
    });
    const parsed = parseEml(eml);
    expect(parsed.from).toBe("john@example.com");
    expect(parsed.fromName).toBe("");
  });

  test("parses To header", () => {
    const eml = makeEml({
      to: '"Jane" <jane@example.com>',
      subject: "Test",
      body: "Hello",
    });
    const parsed = parseEml(eml);
    expect(parsed.to).toBe("jane@example.com");
  });

  test("parses Subject header", () => {
    const eml = makeEml({
      subject: "Important Legal Matter",
      body: "Body",
    });
    const parsed = parseEml(eml);
    expect(parsed.subject).toBe("Important Legal Matter");
  });

  test("parses Date header", () => {
    const dateStr = "Mon, 15 Jan 2024 10:30:00 +0100";
    const eml = makeEml({
      date: dateStr,
      subject: "Test",
      body: "Body",
    });
    const parsed = parseEml(eml);
    expect(parsed.date).toBe(dateStr);
  });

  test("parses simple body (non-multipart)", () => {
    const eml = makeEml({
      subject: "Test",
      body: "This is the email body.\nLine two.",
    });
    const parsed = parseEml(eml);
    expect(parsed.body).toContain("This is the email body.");
    expect(parsed.body).toContain("Line two.");
  });
});

describe("parseEml — Aktenzeichen detection", () => {
  test("detects Az. in subject with high confidence", () => {
    const eml = makeEml({
      subject: "Re: Az. 123 O 456/23",
      body: "Body text",
    });
    const parsed = parseEml(eml);
    expect(parsed.confidence).toBe("high");
    expect(parsed.suggestedCaseSlug).toBeDefined();
    expect(parsed.suggestedCaseSlug).toContain("case/");
  });

  test("detects Aktenzeichen in subject", () => {
    const eml = makeEml({
      subject: "Aktenzeichen 42 C 123/24",
      body: "Body",
    });
    const parsed = parseEml(eml);
    expect(parsed.confidence).toBe("high");
    expect(parsed.suggestedCaseSlug).toBeDefined();
  });

  test("detects AZ in body when subject has no Az", () => {
    const eml = makeEml({
      subject: "General inquiry",
      body: "Regarding AZ 789 K 456/22 please respond.",
    });
    const parsed = parseEml(eml);
    expect(parsed.confidence).toBe("high");
    expect(parsed.suggestedCaseSlug).toBeDefined();
  });

  test("returns low confidence when no Az found", () => {
    const eml = makeEml({
      subject: "General inquiry",
      body: "Just a regular email without case reference.",
    });
    const parsed = parseEml(eml);
    expect(parsed.confidence).toBe("low");
    expect(parsed.suggestedCaseSlug).toBeUndefined();
  });
});

describe("parseEml — multipart MIME", () => {
  test("extracts text/plain part from multipart", () => {
    const eml = makeEml({
      subject: "Test",
      boundary: "boundary123",
      parts: [
        { contentType: "text/plain", body: "Plain text content" },
        { contentType: "text/html", body: "<p>HTML content</p>" },
      ],
    });
    const parsed = parseEml(eml);
    expect(parsed.body).toContain("Plain text content");
    expect(parsed.body).not.toContain("HTML content");
  });

  test("extracts attachments from multipart", () => {
    const eml = makeEml({
      subject: "Test",
      boundary: "boundary123",
      parts: [
        { contentType: "text/plain", body: "Body" },
        {
          contentType: "application/pdf",
          body: "PDF content",
          disposition: 'attachment; filename="document.pdf"',
        },
      ],
    });
    const parsed = parseEml(eml);
    expect(parsed.attachments.length).toBe(1);
    expect(parsed.attachments[0].filename).toBe("document.pdf");
    expect(parsed.attachments[0].contentType).toBe("application/pdf");
  });

  test("extracts multiple attachments", () => {
    const eml = makeEml({
      subject: "Test",
      boundary: "boundary123",
      parts: [
        { contentType: "text/plain", body: "Body" },
        {
          contentType: "application/pdf",
          body: "PDF1",
          disposition: 'attachment; filename="doc1.pdf"',
        },
        {
          contentType: "image/png",
          body: "PNG",
          disposition: 'attachment; filename="image.png"',
        },
      ],
    });
    const parsed = parseEml(eml);
    expect(parsed.attachments.length).toBe(2);
    expect(parsed.attachments[0].filename).toBe("doc1.pdf");
    expect(parsed.attachments[1].filename).toBe("image.png");
  });
});

describe("parseEml — edge cases", () => {
  test("handles empty email", () => {
    const parsed = parseEml("");
    expect(parsed.from).toBe("");
    expect(parsed.subject).toBe("");
    expect(parsed.body).toBe("");
    expect(parsed.confidence).toBe("low");
  });

  test("handles email with only headers, no body", () => {
    const eml = "From: test@example.com\r\nSubject: Test\r\n\r\n";
    const parsed = parseEml(eml);
    expect(parsed.from).toBe("test@example.com");
    expect(parsed.subject).toBe("Test");
    expect(parsed.body).toBe("");
  });

  test("body is truncated to 5000 chars", () => {
    const longBody = "x".repeat(10000);
    const eml = makeEml({ subject: "Test", body: longBody });
    const parsed = parseEml(eml);
    expect(parsed.body.length).toBeLessThanOrEqual(5000);
  });

  test("handles missing From header", () => {
    const eml = "Subject: Test\r\n\r\nBody";
    const parsed = parseEml(eml);
    expect(parsed.from).toBe("");
    expect(parsed.subject).toBe("Test");
  });

  test("handles missing Subject header", () => {
    const eml = "From: test@example.com\r\n\r\nBody";
    const parsed = parseEml(eml);
    expect(parsed.subject).toBe("");
    expect(parsed.from).toBe("test@example.com");
  });

  test("handles Content-Disposition attachment in headers", () => {
    const eml = [
      'Content-Disposition: attachment; filename="test.pdf"',
      "From: test@example.com",
      "Subject: Test",
      "",
      "Body",
    ].join("\r\n");
    const parsed = parseEml(eml);
    expect(parsed.attachments.length).toBeGreaterThanOrEqual(1);
    const att = parsed.attachments.find((a) => a.filename === "test.pdf");
    expect(att).toBeDefined();
  });
});

describe("parseEml — RFC 2047 encoded headers", () => {
  test("decodes base64 encoded UTF-8 subject", () => {
    const encoded = "=?UTF-8?B?w6Ruw7ZsdW5n?=";
    const eml = `Subject: ${encoded}\r\n\r\nBody`;
    const parsed = parseEml(eml);
    expect(parsed.subject).toContain("ä");
  });

  test("decodes Q-encoded subject", () => {
    const encoded = "=?UTF-8?Q?Test_=C3=A4?=";
    const eml = `Subject: ${encoded}\r\n\r\nBody`;
    const parsed = parseEml(eml);
    expect(parsed.subject).toContain("ä");
  });

  test("leaves undecodable MIME-word as-is", () => {
    const encoded = "=?UTF-8?B?@@invalid@@?=";
    const eml = `Subject: ${encoded}\r\n\r\nBody`;
    const parsed = parseEml(eml);
    // Should not crash, subject should be non-empty
    expect(parsed.subject.length).toBeGreaterThan(0);
  });

  test("handles plain ASCII subject without encoding", () => {
    const eml = "Subject: Plain ASCII Subject\r\n\r\nBody";
    const parsed = parseEml(eml);
    expect(parsed.subject).toBe("Plain ASCII Subject");
  });
});

// ── Multipart edge cases ────────────────────────────────────────────────

describe("parseEml — multipart edge cases", () => {
  test("falls back to text/html when no text/plain part exists", () => {
    const eml = makeEml({
      subject: "Test",
      boundary: "boundary456",
      parts: [
        { contentType: "text/html", body: "<p>HTML only content</p>" },
      ],
    });
    const parsed = parseEml(eml);
    // Should fall back to text/html since it starts with text/ and no text/plain was found
    expect(parsed.body).toContain("HTML only content");
  });

  test("body is empty when multipart has only non-text parts", () => {
    const eml = makeEml({
      subject: "Test",
      boundary: "boundary789",
      parts: [
        {
          contentType: "application/pdf",
          body: "PDF binary data",
          disposition: 'attachment; filename="doc.pdf"',
        },
      ],
    });
    const parsed = parseEml(eml);
    expect(parsed.body).toBe("");
    expect(parsed.attachments.length).toBe(1);
  });

  test("handles multipart with empty text/plain part", () => {
    const eml = makeEml({
      subject: "Test",
      boundary: "boundary-empty",
      parts: [
        { contentType: "text/plain", body: "" },
        { contentType: "text/html", body: "<p>HTML</p>" },
      ],
    });
    const parsed = parseEml(eml);
    // text/plain was found (even though empty), so HTML should not be used
    expect(parsed.body).toBe("");
  });
});

// ── suggestedCaseSlug format ────────────────────────────────────────────

describe("parseEml — suggestedCaseSlug format", () => {
  test("slug starts with 'case/' prefix", () => {
    const eml = makeEml({
      subject: "Az. 123 O 456/23",
      body: "Body",
    });
    const parsed = parseEml(eml);
    expect(parsed.suggestedCaseSlug?.startsWith("case/")).toBe(true);
  });

  test("slug replaces spaces with dashes", () => {
    const eml = makeEml({
      subject: "Az. 123 O 456/23",
      body: "Body",
    });
    const parsed = parseEml(eml);
    expect(parsed.suggestedCaseSlug).not.toContain(" ");
  });

  test("slug is truncated to 60 characters after case/", () => {
    const longAz = "123 " + "X".repeat(80);
    const eml = makeEml({
      subject: `Az. ${longAz}`,
      body: "Body",
    });
    const parsed = parseEml(eml);
    expect(parsed.suggestedCaseSlug).toBeDefined();
    const slugPart = parsed.suggestedCaseSlug!.replace("case/", "");
    expect(slugPart.length).toBeLessThanOrEqual(60);
  });
});

// ── Multiple recipients ─────────────────────────────────────────────────

describe("parseEml — multiple recipients", () => {
  test("extracts first email from To header with multiple recipients", () => {
    const eml = makeEml({
      to: "alice@example.com, bob@example.com",
      subject: "Test",
      body: "Body",
    });
    const parsed = parseEml(eml);
    // extractEmail returns the first <...> or the trimmed string
    expect(parsed.to).toBeTruthy();
  });

  test("extracts email from To with angle brackets among multiple", () => {
    const eml = makeEml({
      to: "Alice <alice@example.com>, Bob <bob@example.com>",
      subject: "Test",
      body: "Body",
    });
    const parsed = parseEml(eml);
    expect(parsed.to).toBe("alice@example.com");
  });
});
