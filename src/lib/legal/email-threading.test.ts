// @vitest-environment node

import { describe, test, expect } from "vitest";
import {
  extractThreadId,
  stripSubjectPrefix,
  matchEmailToCases,
  resolveEmailImport,
  type EmailHeaders,
} from "../email-threading";

const CASES = [
  {
    slug: "case-1",
    title: "Schmidt vs. Müller",
    case_number: "2026-001",
    client_name: "Schmidt",
    client_slug: "schmidt@example.com",
    opponent_name: "Müller",
  },
  {
    slug: "case-2",
    title: "Meier Erbrecht",
    case_number: "2026-002",
    client_name: "Meier",
    client_slug: "meier@example.com",
    opponent_name: "Erbengemeinschaft",
  },
  {
    slug: "case-3",
    title: "Schmidt Scheidung",
    case_number: "2026-003",
    client_name: "Schmidt",
    client_slug: "schmidt@example.com",
    opponent_name: "Schmidt G.",
  },
];

describe("extractThreadId", () => {
  test("uses In-Reply-To when available", () => {
    const headers: EmailHeaders = {
      subject: "Re: Test",
      from: "test@example.com",
      body: "body",
      messageId: "<msg-2@example.com>",
      inReplyTo: "<msg-1@example.com>",
    };
    expect(extractThreadId(headers)).toBe("msg-1@example.com");
  });

  test("uses first Reference when no In-Reply-To", () => {
    const headers: EmailHeaders = {
      subject: "Re: Test",
      from: "test@example.com",
      body: "body",
      messageId: "<msg-3@example.com>",
      references: "<msg-1@example.com> <msg-2@example.com>",
    };
    expect(extractThreadId(headers)).toBe("msg-1@example.com");
  });

  test("falls back to Message-ID when no In-Reply-To or References", () => {
    const headers: EmailHeaders = {
      subject: "Test",
      from: "test@example.com",
      body: "body",
      messageId: "<msg-1@example.com>",
    };
    expect(extractThreadId(headers)).toBe("msg-1@example.com");
  });

  test("generates thread ID when no headers available", () => {
    const headers: EmailHeaders = {
      subject: "Test",
      from: "test@example.com",
      body: "body",
    };
    const threadId = extractThreadId(headers);
    expect(threadId).toMatch(/^thread-/);
  });

  test("strips angle brackets from message IDs", () => {
    const headers: EmailHeaders = {
      subject: "Test",
      from: "test@example.com",
      body: "body",
      inReplyTo: "  <abc@example.com>  ",
    };
    expect(extractThreadId(headers)).toBe("abc@example.com");
  });
});

describe("stripSubjectPrefix", () => {
  test("strips Re: prefix", () => {
    expect(stripSubjectPrefix("Re: Test Subject")).toBe("Test Subject");
  });

  test("strips multiple Re: prefixes", () => {
    expect(stripSubjectPrefix("Re: Re: Re: Test")).toBe("Test");
  });

  test("strips Aw: (German) prefix", () => {
    expect(stripSubjectPrefix("Aw: Test Subject")).toBe("Test Subject");
  });

  test("strips Fwd: prefix", () => {
    expect(stripSubjectPrefix("Fwd: Test Subject")).toBe("Test Subject");
  });

  test("strips mixed prefixes", () => {
    expect(stripSubjectPrefix("Re: Fwd: Aw: Test")).toBe("Test");
  });

  test("no prefix → unchanged", () => {
    expect(stripSubjectPrefix("Test Subject")).toBe("Test Subject");
  });
});

describe("matchEmailToCases", () => {
  test("matches by case number in subject", () => {
    const headers: EmailHeaders = {
      subject: "Re: 2026-001 Klage",
      from: "someone@example.com",
      body: "body",
    };
    const { candidates, isAmbiguous } = matchEmailToCases(headers, CASES);
    expect(candidates[0].slug).toBe("case-1");
    expect(isAmbiguous).toBe(false);
  });

  test("matches by client name in From", () => {
    const headers: EmailHeaders = {
      subject: "Frage zum Fall",
      from: "Schmidt <schmidt@example.com>",
      body: "body",
    };
    const { candidates } = matchEmailToCases(headers, CASES);
    expect(candidates.length).toBeGreaterThan(0);
    // Both case-1 and case-3 have Schmidt as client
    const slugs = candidates.map((c) => c.slug);
    expect(slugs).toContain("case-1");
    expect(slugs).toContain("case-3");
  });

  test("detects ambiguity when multiple cases match equally", () => {
    const headers: EmailHeaders = {
      subject: "Frage",
      from: "Schmidt <schmidt@example.com>",
      body: "body",
    };
    const { isAmbiguous } = matchEmailToCases(headers, CASES);
    // case-1 and case-3 both have Schmidt as client with same score
    expect(isAmbiguous).toBe(true);
  });

  test("no match when no signals", () => {
    const headers: EmailHeaders = {
      subject: "Allgemeine Frage",
      from: "unknown@example.com",
      body: "body",
    };
    const { candidates } = matchEmailToCases(headers, CASES);
    expect(candidates).toHaveLength(0);
  });

  test("case number in subject beats client name match", () => {
    const headers: EmailHeaders = {
      subject: "2026-002 Unterlagen",
      from: "Schmidt <schmidt@example.com>",
      body: "body",
    };
    const { candidates, isAmbiguous } = matchEmailToCases(headers, CASES);
    expect(candidates[0].slug).toBe("case-2");
    expect(isAmbiguous).toBe(false);
  });

  test("opponent name in From produces lower score", () => {
    const headers: EmailHeaders = {
      subject: "Allgemeine Frage",
      from: "Müller Anwalt <mueller@example.com>",
      body: "body",
    };
    const { candidates } = matchEmailToCases(headers, CASES);
    expect(candidates.length).toBeGreaterThan(0);
    expect(candidates[0].slug).toBe("case-1");
  });
});

describe("resolveEmailImport", () => {
  test("returns matched when single clear match", () => {
    const headers: EmailHeaders = {
      subject: "2026-001 Dokumente",
      from: "someone@example.com",
      body: "body",
    };
    const result = resolveEmailImport(headers, CASES);
    expect(result.status).toBe("matched");
    expect(result.matchedCaseSlug).toBe("case-1");
    expect(result.threadId).toBeDefined();
  });

  test("returns ambiguous when multiple equal matches", () => {
    const headers: EmailHeaders = {
      subject: "Frage",
      from: "Schmidt <schmidt@example.com>",
      body: "body",
    };
    const result = resolveEmailImport(headers, CASES);
    expect(result.status).toBe("ambiguous");
    expect(result.candidates).toBeDefined();
    expect(result.candidates!.length).toBeGreaterThan(1);
  });

  test("returns no_match when no cases match", () => {
    const headers: EmailHeaders = {
      subject: "Allgemeine Frage",
      from: "unknown@example.com",
      body: "body",
    };
    const result = resolveEmailImport(headers, CASES);
    expect(result.status).toBe("no_match");
    expect(result.matchedCaseSlug).toBeUndefined();
  });

  test("returns threadId in all cases", () => {
    const headers: EmailHeaders = {
      subject: "Test",
      from: "test@example.com",
      body: "body",
      inReplyTo: "<thread-123@example.com>",
    };
    const result = resolveEmailImport(headers, CASES);
    expect(result.threadId).toBe("thread-123@example.com");
  });

  test("empty cases list → no_match", () => {
    const headers: EmailHeaders = {
      subject: "Test",
      from: "test@example.com",
      body: "body",
    };
    const result = resolveEmailImport(headers, []);
    expect(result.status).toBe("no_match");
  });
});
