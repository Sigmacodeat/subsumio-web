/**
 * Lightweight markdown-to-HTML converter (no external deps).
 * Supports headers, bold, italic, code, lists, blockquotes, links.
 */
export function renderMarkdown(text: string): string {
  if (!text) return "";

  let html = text
    // Escape HTML first
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    // Headers
    .replace(/^#{6}\s+(.*$)/gim, "<h6>$1</h6>")
    .replace(/^#{5}\s+(.*$)/gim, "<h5>$1</h5>")
    .replace(/^#{4}\s+(.*$)/gim, "<h4>$1</h4>")
    .replace(/^#{3}\s+(.*$)/gim, "<h3>$1</h3>")
    .replace(/^#{2}\s+(.*$)/gim, "<h2>$1</h2>")
    .replace(/^#\s+(.*$)/gim, "<h1>$1</h1>")
    // Bold + italic
    .replace(/\*\*\*(.*?)\*\*\*/g, "<strong><em>$1</em></strong>")
    .replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>")
    .replace(/\*(.*?)\*/g, "<em>$1</em>")
    // Code blocks
    .replace(/```([\s\S]*?)```/g, "<pre><code>$1</code></pre>")
    // Inline code
    .replace(/`([^`]+)`/g, "<code>$1</code>")
    // Blockquote
    .replace(/^>\s+(.*$)/gim, "<blockquote>$1</blockquote>")
    // Unordered lists
    .replace(/^\s*[-*+]\s+(.*$)/gim, "<li>$1</li>")
    // Ordered lists
    .replace(/^\s*\d+\.\s+(.*$)/gim, "<li>$1</li>")
    // Links (sanitize href to block javascript:/data: URLs and attribute injection)
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, (match, label, href) => {
      const safe = /^(https?:|mailto:|\/(?!\/)|#)/i.test(href) && !/["'<>\s]/.test(href);
      if (!safe) return match;
      return `<a href="${href}" target="_blank" rel="noopener noreferrer">${label}</a>`;
    })
    // Horizontal rule
    .replace(/^---+$/gim, "<hr/>");
  // Paragraphs (simple: wrap non-tag lines)
  // Wrap consecutive <li> in <ul>
  html = html.replace(/(<li>.*<\/li>\n?)+/g, (match) => {
    const items = match.trim();
    return `<ul>${items}</ul>`;
  });

  // Convert line breaks to <br> or wrap in <p>
  const lines = html.split("\n");
  const out: string[] = [];
  let inBlock = false;

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) {
      inBlock = false;
      continue;
    }

    const isBlock = /^<(h[1-6]|pre|blockquote|ul|hr)/.test(trimmed);
    if (isBlock) {
      out.push(line);
      inBlock = false;
    } else if (!inBlock) {
      out.push(`<p>${line}</p>`);
      inBlock = true;
    } else {
      // Append to last paragraph
      const last = out[out.length - 1];
      out[out.length - 1] = last.slice(0, -4) + "<br/>" + line + "</p>";
    }
  }

  return out.join("\n");
}

/**
 * Reduce markdown to plain prose for surfaces that render a short narrative in
 * a single paragraph (morning briefing, toast previews). Headers, emphasis,
 * list markers and links are dropped. A heading or a whole-line bold label
 * (models often title their answer "**Morgen-Briefing**" instead of using
 * `#`) starts a new sentence instead of running into the next line with no
 * separator — a bare newline-to-space join turned "**Titel**\n\nText…" into
 * the unpunctuated "Titel Text…".
 */
export function markdownToPlainText(text: string): string {
  if (!text) return "";

  const cleanInline = (line: string): string =>
    line
      .replace(/\*\*\*(.*?)\*\*\*/g, "$1")
      .replace(/\*\*(.*?)\*\*/g, "$1")
      .replace(/(^|[^*])\*([^*\n]+)\*/g, "$1$2")
      .replace(/`([^`]+)`/g, "$1")
      .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1");

  const lines = text
    .replace(/```[\s\S]*?```/g, " ")
    .split("\n")
    .map((line) => {
      const isHeading = /^\s{0,3}#{1,6}\s+/.test(line) || /^\s*\*\*[^*]+\*\*:?\s*$/.test(line);
      const stripped = line
        .replace(/^\s{0,3}#{1,6}\s+/, "")
        .replace(/^\s*(?:[-*+]|\d+\.)\s+/, "")
        .replace(/^\s*>\s?/, "");
      return { isHeading, text: cleanInline(stripped).trim() };
    })
    .filter((line) => line.text.length > 0);

  let result = "";
  lines.forEach((line, i) => {
    if (i === 0) {
      result = line.text;
      return;
    }
    const prev = lines[i - 1];
    const isBlockBoundary = line.isHeading || prev.isHeading;
    const prevEndsSentence = /[.!?:]$/.test(prev.text);
    result += isBlockBoundary && !prevEndsSentence ? `. ${line.text}` : ` ${line.text}`;
  });

  return result.replace(/\s{2,}/g, " ").trim();
}
