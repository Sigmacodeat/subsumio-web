import { getAllPosts } from "@/content/blog";

const BASE = process.env.NEXT_PUBLIC_SITE_URL || "https://subsum.eu";

export const dynamic = "force-static";

function escapeXml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

export async function GET() {
  const posts = getAllPosts();
  const lastBuildDate = posts[0] ? new Date(posts[0].date).toUTCString() : new Date().toUTCString();

  const items = posts
    .map((post) => {
      const url = `${BASE}/blog/${post.slug}`;
      const pubDate = new Date(post.date).toUTCString();
      const description = escapeXml(post.description);
      const title = escapeXml(post.title);
      const categories = post.tags
        .map((tag) => `      <category>${escapeXml(tag)}</category>`)
        .join("\n");

      return `    <item>
      <title>${title}</title>
      <link>${url}</link>
      <guid isPermaLink="true">${url}</guid>
      <pubDate>${pubDate}</pubDate>
      <description>${description}</description>
      <author>hello@subsum.eu (Subsumio Team)</author>${categories ? "\n" + categories : ""}
    </item>`;
    })
    .join("\n");

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>Subsumio Blog — KI-Kanzleisoftware Praxiswissen</title>
    <link>${BASE}/blog</link>
    <description>Praxiswissen für Anwälte in AT, DE und CH: Berufsgeheimnis, Fristenmanagement, belegte KI-Antworten.</description>
    <language>de-DE</language>
    <lastBuildDate>${lastBuildDate}</lastBuildDate>
    <atom:link href="${BASE}/feed.xml" rel="self" type="application/rss+xml" />
    <copyright>Subsumio</copyright>
    <managingEditor>hello@subsum.eu (Subsumio Team)</managingEditor>
    <webMaster>hello@subsum.eu (Subsumio Team)</webMaster>
    <ttl>60</ttl>
${items}
  </channel>
</rss>`;

  return new Response(xml, {
    headers: {
      "Content-Type": "application/rss+xml; charset=utf-8",
      "Cache-Control": "public, max-age=3600, s-maxage=3600",
    },
  });
}
