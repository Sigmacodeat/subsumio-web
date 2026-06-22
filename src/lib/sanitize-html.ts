/**
 * HTML sanitizer for untrusted email content using DOMPurify.
 * Preserves email layout tags, inline styles, and tables while stripping
 * scripts, event handlers, and dangerous URLs.
 */

import DOMPurify from "isomorphic-dompurify";

const SANITIZE_CONFIG = {
  ALLOWED_TAGS: [
    "p",
    "br",
    "div",
    "span",
    "a",
    "img",
    "strong",
    "em",
    "b",
    "i",
    "u",
    "s",
    "strike",
    "ul",
    "ol",
    "li",
    "blockquote",
    "pre",
    "code",
    "h1",
    "h2",
    "h3",
    "h4",
    "h5",
    "h6",
    "hr",
    "table",
    "thead",
    "tbody",
    "tfoot",
    "tr",
    "th",
    "td",
    "font",
    "center",
    "tt",
    "sub",
    "sup",
    "dl",
    "dt",
    "dd",
    "caption",
    "colgroup",
    "col",
    "address",
    "article",
    "section",
    "header",
    "footer",
    "aside",
    "figure",
    "figcaption",
  ],
  ALLOWED_ATTR: [
    "href",
    "src",
    "alt",
    "title",
    "width",
    "height",
    "style",
    "color",
    "size",
    "face",
    "align",
    "valign",
    "colspan",
    "rowspan",
    "target",
    "rel",
    "border",
    "cellpadding",
    "cellspacing",
    "class",
    "id",
    "bgcolor",
    "background",
    "nowrap",
    "char",
    "charoff",
    "scope",
  ],
  ALLOW_DATA_ATTR: true,
  FORBID_TAGS: [
    "script",
    "iframe",
    "object",
    "embed",
    "applet",
    "meta",
    "link",
    "base",
    "form",
    "input",
    "button",
    "textarea",
    "select",
    "style",
  ],
  FORBID_ATTR: [
    "onerror",
    "onload",
    "onclick",
    "onmouseover",
    "onmouseout",
    "onfocus",
    "onblur",
    "onchange",
    "onsubmit",
    "onreset",
    "onkeydown",
    "onkeyup",
    "onkeypress",
  ],
};

DOMPurify.addHook("afterSanitizeAttributes", (node: Element) => {
  if (node.tagName === "A" && node.getAttribute("href")) {
    node.setAttribute("target", "_blank");
    node.setAttribute("rel", "noopener noreferrer");
  }
});

export function sanitizeHtml(html: string): string {
  if (!html) return "";
  return String(DOMPurify.sanitize(html, { ...SANITIZE_CONFIG }));
}

/**
 * Convert plaintext email body to formatted HTML with auto-linked URLs.
 */
export function plaintextToHtml(text: string): string {
  if (!text) return "";
  const escaped = text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

  const lines = escaped.split(/\n/);
  const parts: string[] = [];
  let paragraph: string[] = [];

  const flushParagraph = () => {
    if (paragraph.length > 0) {
      const content = paragraph
        .map((line) =>
          line.replace(
            /(https?:\/\/[^\s<]+|[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/gi,
            (match) =>
              match.startsWith("http")
                ? `<a href="${match}" target="_blank" rel="noopener noreferrer">${match}</a>`
                : `<a href="mailto:${match}">${match}</a>`
          )
        )
        .join("<br />");
      parts.push(`<p>${content}</p>`);
      paragraph = [];
    }
  };

  for (const line of lines) {
    if (line.trim() === "") {
      flushParagraph();
    } else {
      paragraph.push(line);
    }
  }
  flushParagraph();

  return parts.join("") || "<br />";
}
