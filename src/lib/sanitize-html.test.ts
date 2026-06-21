import { describe, it, expect } from "vitest";
import { sanitizeHtml } from "./sanitize-html";

describe("sanitizeHtml", () => {
  it("returns empty string for empty input", () => {
    expect(sanitizeHtml("")).toBe("");
  });

  it("preserves safe tags", () => {
    const html = "<p>Hello <strong>world</strong></p>";
    expect(sanitizeHtml(html)).toBe(html);
  });

  it("strips script tags", () => {
    const html = '<p>safe</p><script>alert("xss")</script><p>after</p>';
    const result = sanitizeHtml(html);
    expect(result).not.toContain("script");
    expect(result).not.toContain("alert");
    expect(result).toContain("safe");
    expect(result).toContain("after");
  });

  it("strips iframe tags", () => {
    const html = '<iframe src="evil.com"></iframe><p>ok</p>';
    const result = sanitizeHtml(html);
    expect(result).not.toContain("iframe");
    expect(result).toContain("ok");
  });

  it("strips event handlers", () => {
    const html = '<p onclick="alert(1)">text</p>';
    const result = sanitizeHtml(html);
    expect(result).not.toContain("onclick");
    expect(result).toContain("text");
  });

  it("blocks javascript: URLs in href", () => {
    const html = '<a href="javascript:alert(1)">click</a>';
    const result = sanitizeHtml(html);
    expect(result).not.toContain("javascript:");
  });

  it("allows safe href URLs", () => {
    const html = '<a href="https://example.com">link</a>';
    const result = sanitizeHtml(html);
    expect(result).toContain("https://example.com");
  });

  it("strips style tags", () => {
    const html = "<style>body{}</style><p>text</p>";
    const result = sanitizeHtml(html);
    expect(result).not.toContain("style");
    expect(result).toContain("text");
  });

  it("strips form and input tags", () => {
    const html = '<form><input name="x" /></form><p>text</p>';
    const result = sanitizeHtml(html);
    expect(result).not.toContain("form");
    expect(result).not.toContain("input");
    expect(result).toContain("text");
  });

  it("preserves table tags", () => {
    const html = "<table><tr><td>cell</td></tr></table>";
    expect(sanitizeHtml(html)).toBe(html);
  });

  it("blocks data:image/svg+xml URLs (XSS via SVG)", () => {
    const html = '<img src="data:image/svg+xml,<svg onload=alert(1)>" alt="xss">';
    const result = sanitizeHtml(html);
    expect(result).not.toContain("onload");
    expect(result).not.toContain("data:image/svg+xml");
  });

  it("blocks data:text/html URLs", () => {
    const html = '<a href="data:text/html,<script>alert(1)</script>">click</a>';
    const result = sanitizeHtml(html);
    expect(result).not.toContain("data:text/html");
  });

  it("allows safe data:image/png URLs", () => {
    const html = '<img src="data:image/png;base64,iVBORw0KGgo=" alt="pic">';
    const result = sanitizeHtml(html);
    expect(result).toContain("data:image/png");
  });

  it("allows safe data:image/jpeg URLs", () => {
    const html = '<img src="data:image/jpeg;base64,/9j/4AAQ=" alt="pic">';
    const result = sanitizeHtml(html);
    expect(result).toContain("data:image/jpeg");
  });
});
