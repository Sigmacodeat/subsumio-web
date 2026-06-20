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
    .replace(/^#{6}\s+(.*$)/gim, '<h6>$1</h6>')
    .replace(/^#{5}\s+(.*$)/gim, '<h5>$1</h5>')
    .replace(/^#{4}\s+(.*$)/gim, '<h4>$1</h4>')
    .replace(/^#{3}\s+(.*$)/gim, '<h3>$1</h3>')
    .replace(/^#{2}\s+(.*$)/gim, '<h2>$1</h2>')
    .replace(/^#\s+(.*$)/gim, '<h1>$1</h1>')
    // Bold + italic
    .replace(/\*\*\*(.*?)\*\*\*/g, '<strong><em>$1</em></strong>')
    .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.*?)\*/g, '<em>$1</em>')
    // Code blocks
    .replace(/```([\s\S]*?)```/g, '<pre><code>$1</code></pre>')
    // Inline code
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    // Blockquote
    .replace(/^>\s+(.*$)/gim, '<blockquote>$1</blockquote>')
    // Unordered lists
    .replace(/^\s*[-*+]\s+(.*$)/gim, '<li>$1</li>')
    // Ordered lists
    .replace(/^\s*\d+\.\s+(.*$)/gim, '<li>$1</li>')
    // Links (sanitize href to block javascript:/data: URLs)
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, (match, label, href) => {
      const safe = /^(https?:|mailto:|\/|#)/i.test(href);
      return safe
        ? `<a href="${href}" target="_blank" rel="noopener noreferrer">${label}</a>`
        : match;
    })
    // Horizontal rule
    .replace(/^---+$/gim, '<hr/>')
    // Paragraphs (simple: wrap non-tag lines)
    ;

  // Wrap consecutive <li> in <ul>
  html = html.replace(/(<li>.*<\/li>\n?)+/g, (match) => {
    const items = match.trim();
    return `<ul>${items}</ul>`;
  });

  // Convert line breaks to <br> or wrap in <p>
  const lines = html.split('\n');
  const out: string[] = [];
  let inBlock = false;

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) { inBlock = false; continue; }

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
      out[out.length - 1] = last.slice(0, -4) + '<br/>' + line + '</p>';
    }
  }

  return out.join('\n');
}
