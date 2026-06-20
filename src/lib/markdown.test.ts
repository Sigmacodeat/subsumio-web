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
});
