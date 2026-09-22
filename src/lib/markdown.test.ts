import { describe, it, expect } from "vitest";
import { renderMarkdown } from "./markdown";

describe("renderMarkdown XSS prevention", () => {
  it("escapes HTML entities", () => {
    expect(renderMarkdown("<script>alert(1)</script>")).not.toContain("<script>");
  });

  it("blocks javascript: URLs in links", () => {
    const result = renderMarkdown("[click](javascript:alert(1))");
    expect(result).not.toContain('<a href="javascript:');
    expect(result).not.toContain("<a ");
  });

  it("allows https URLs in links", () => {
    const result = renderMarkdown("[link](https://example.com)");
    expect(result).toContain("https://example.com");
    expect(result).toContain("<a ");
  });

  it("allows relative URLs in links", () => {
    const result = renderMarkdown("[link](/dashboard)");
    expect(result).toContain("/dashboard");
    expect(result).toContain("<a ");
  });

  it("allows mailto URLs in links", () => {
    const result = renderMarkdown("[email](mailto:test@example.com)");
    expect(result).toContain("mailto:test@example.com");
  });

  it("blocks data:text/html URLs", () => {
    const result = renderMarkdown("[click](data:text/html,<script>)");
    expect(result).not.toContain('<a href="data:text/html');
    expect(result).not.toContain("<a ");
  });

  it("escapes inline event handlers", () => {
    const result = renderMarkdown('<img src=x onerror="alert(1)">');
    expect(result).not.toContain("<img");
    expect(result).toContain("&lt;img");
  });

  it("escapes HTML inside bold text", () => {
    expect(renderMarkdown("**<script>alert(1)</script>**")).not.toContain("<script>");
  });

  it("escapes HTML inside headers", () => {
    expect(renderMarkdown("# <script>alert(1)</script>")).not.toContain("<script>");
  });

  it("escapes HTML inside code spans", () => {
    expect(renderMarkdown("`<script>alert(1)</script>`")).not.toContain("<script>");
  });

  it("escapes HTML inside blockquotes", () => {
    expect(renderMarkdown("> <script>alert(1)</script>")).not.toContain("<script>");
  });

  it("escapes HTML inside list items", () => {
    expect(renderMarkdown("- <script>alert(1)</script>")).not.toContain("<script>");
  });

  it("blocks protocol-relative URLs", () => {
    const result = renderMarkdown("[click](//evil.com)");
    expect(result).not.toContain("<a ");
  });

  it("rejects link hrefs containing quotes", () => {
    const result = renderMarkdown('[click](https://example.com" onmouseover="alert(1)")');
    expect(result).not.toContain("<a ");
  });

  it("escapes HTML entities in link labels", () => {
    const result = renderMarkdown("[<script>alert(1)</script>](https://example.com)");
    expect(result).not.toContain("<script>");
  });

  it("adds noopener/noreferrer to generated links", () => {
    const result = renderMarkdown("[link](https://example.com)");
    expect(result).toContain('target="_blank"');
    expect(result).toContain('rel="noopener noreferrer"');
  });

  it("escapes ampersand in text", () => {
    const result = renderMarkdown("A & B");
    expect(result).toContain("&amp;");
    expect(result).not.toContain("A & B");
  });

  it("escapes HTML inside code blocks", () => {
    const result = renderMarkdown("```\n<script>alert(1)</script>\n```");
    expect(result).not.toContain("<script>");
    expect(result).toContain("&lt;script&gt;");
  });

  it("wraps paragraphs correctly", () => {
    const result = renderMarkdown("Line one\n\nLine two");
    expect(result).toContain("<p>Line one</p>");
    expect(result).toContain("<p>Line two</p>");
  });

  it("allows fragment-only links", () => {
    const result = renderMarkdown("[section](#details)");
    expect(result).toContain('href="#details"');
  });

  it("blocks links starting with data: but allows http after prefix", () => {
    const result = renderMarkdown("[click](data://example.com)");
    expect(result).not.toContain("<a ");
  });
});

describe("markdownToPlainText", async () => {
  const { markdownToPlainText } = await import("./markdown");
  it("drops headers, emphasis, lists and links but keeps the prose", () => {
    const md =
      "## 3-Satz-Briefing\n### Fristen\n1. **Demo-Akte** — siehe [Akte](/dashboard/cases/x).\n- *zwei* offene Punkte";
    expect(markdownToPlainText(md)).toBe(
      "3-Satz-Briefing. Fristen. Demo-Akte — siehe Akte. zwei offene Punkte"
    );
  });
  it("is a no-op for plain prose", () => {
    expect(markdownToPlainText("Heute sind zwei Fristen fällig.")).toBe(
      "Heute sind zwei Fristen fällig."
    );
  });
  it("separates a whole-line bold title from the following paragraph", () => {
    const md =
      "**Morgen-Briefing**\n\nEs liegen derzeit keine dringenden Aufgaben vor. Alle Fristen sind abgearbeitet.";
    expect(markdownToPlainText(md)).toBe(
      "Morgen-Briefing. Es liegen derzeit keine dringenden Aufgaben vor. Alle Fristen sind abgearbeitet."
    );
  });
});

describe("ordered lists", () => {
  it("keeps the numbering: numbered items render as <ol>, bullets as <ul>", () => {
    const html = renderMarkdown("1. Rekurs\n2. Klagebeantwortung\n\n- Vollmacht\n- Beilage");
    expect(html).toContain("<ol><li>Rekurs</li>");
    expect(html).toContain("<ul><li>Vollmacht</li>");
    expect(html).not.toContain("data-o");
    expect(html).not.toContain("<p><ol>");
  });
});
