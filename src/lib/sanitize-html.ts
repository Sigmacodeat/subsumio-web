/**
 * Minimal HTML sanitizer for untrusted content (e.g. email HTML).
 * Strips <script>, <iframe>, event handlers, and dangerous URLs.
 * For production use, consider DOMPurify — this is a zero-dependency fallback.
 */

const ALLOWED_TAGS = new Set([
  "p", "br", "div", "span", "a", "img", "strong", "em", "b", "i", "u",
  "ul", "ol", "li", "blockquote", "pre", "code", "h1", "h2", "h3", "h4",
  "h5", "h6", "hr", "table", "thead", "tbody", "tr", "th", "td",
  "font", "center", "tt", "sub", "sup", "dl", "dt", "dd",
]);

const ALLOWED_ATTRS = new Set([
  "href", "src", "alt", "title", "width", "height", "style",
  "color", "size", "face", "align", "valign", "colspan", "rowspan",
  "target", "rel", "border", "cellpadding", "cellspacing",
]);

const DANGEROUS_URL = /^(javascript:|data:text\/html|vbscript:|file:)/i;

export function sanitizeHtml(html: string): string {
  if (!html) return "";

  // Remove <script> blocks entirely (including content)
  let out = html.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, "");

  // Remove <style> blocks
  out = out.replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, "");

  // Remove <iframe>, <object>, <embed>, <applet>, <meta>, <link> tags
  out = out.replace(/<\/?(iframe|object|embed|applet|meta|link|base|form|input|button|textarea|select)\b[^>]*>/gi, "");

  // Process remaining tags: strip event handlers and dangerous attributes
  out = out.replace(/<([a-zA-Z][a-zA-Z0-9]*)\b([^>]*)>/g, (match, tag, attrs) => {
    const lowerTag = tag.toLowerCase();
    if (!ALLOWED_TAGS.has(lowerTag)) return "";

    // Filter attributes
    const cleanAttrs = attrs
      .replace(/([a-zA-Z][a-zA-Z0-9-]*)\s*=\s*("[^"]*"|'[^']*'|[^\s>]*)/g, (attrMatch: string, name: string, value: string) => {
        const lowerName = name.toLowerCase();
        if (!ALLOWED_ATTRS.has(lowerName)) return "";
        if (lowerName === "href" || lowerName === "src") {
          const unquoted = value.replace(/^["']|["']$/g, "");
          if (DANGEROUS_URL.test(unquoted)) return "";
        }
        return attrMatch;
      })
      .replace(/\son\w+\s*=\s*("[^"]*"|'[^']*'|[^\s>]*)/gi, "")
      .trim();

    return `<${tag}${cleanAttrs ? " " + cleanAttrs : ""}>`;
  });

  return out;
}
