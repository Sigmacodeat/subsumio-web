import type { Metadata } from "next";
import Link from "next/link";
import { JsonLd, breadcrumbLd, organizationLd, blogLd } from "@/components/seo/jsonld";
import { getAllPosts } from "@/content/blog";
import { keywordsFor } from "@/lib/seo-keywords";
import { Section, BadgePill, CTASection, H1_CLASS } from "@/components/marketing/chrome";

export const metadata: Metadata = {
  title: "Subsumio Blog — KI-Kanzleisoftware Praxiswissen",
  description:
    "Praxiswissen für Anwälte: KI-Kanzleisoftware und Berufsgeheimnis, automatisiertes Fristenmanagement, belegte KI-Antworten vs. Halluzination. DACH-spezifisch, praxisnah.",
  keywords: keywordsFor("blog"),
  alternates: {
    canonical: "/blog",
    languages: { de: "/blog", en: "/en/blog" },
    types: { "application/rss+xml": "/feed.xml" },
  },
  openGraph: {
    title: "Subsumio Blog — KI-Kanzleisoftware Praxiswissen",
    description:
      "Praxiswissen für Anwälte: KI-Kanzleisoftware und Berufsgeheimnis, Fristenmanagement, belegte KI-Antworten.",
    url: "/blog",
    type: "website",
  },
};

export default function BlogPage() {
  const posts = getAllPosts();

  return (
    <>
      <JsonLd data={organizationLd()} />
      <JsonLd
        data={blogLd({
          name: "Subsumio Blog — KI-Kanzleisoftware Praxiswissen",
          description:
            "Praxiswissen für Anwälte in AT, DE und CH: Berufsgeheimnis, Fristenmanagement, belegte KI-Antworten.",
          url: "/blog",
          posts: posts.map((p) => ({
            title: p.title,
            url: `/blog/${p.slug}`,
            date: p.date,
          })),
        })}
      />
      <JsonLd
        data={breadcrumbLd([
          { name: "Subsumio", url: "/" },
          { name: "Blog", url: "/blog" },
        ])}
      />
      <div data-tone="light" className="min-h-screen [background:var(--mk-bg)]">
        <Section tone="light" className="px-4 py-24 sm:px-6 lg:px-8">
          <div className="mx-auto max-w-3xl">
            <div className="mb-12">
              <BadgePill>Blog</BadgePill>
              <h1 className={`${H1_CLASS} mb-4`}>KI-Kanzleisoftware in der Praxis</h1>
              <p className="text-lg text-pretty [color:var(--mk-text-muted)]">
                Praxiswissen für Anwälte in AT, DE und CH: Berufsgeheimnis, Fristenmanagement,
                belegte KI-Antworten.
              </p>
            </div>

            <div className="space-y-8">
              {posts.map((post) => (
                <article
                  key={post.slug}
                  className="border-b border-[color:var(--mk-border)] pb-8 last:border-0"
                >
                  <Link href={`/blog/${post.slug}`} className="group block">
                    <time className="text-sm text-[color:var(--mk-text-subtle)]">
                      {new Date(post.date).toLocaleDateString("de-DE", {
                        year: "numeric",
                        month: "long",
                        day: "numeric",
                      })}{" "}
                      · {post.readMinutes} Min. Lesezeit
                    </time>
                    <h2 className="mt-2 text-2xl font-bold tracking-tight text-balance [color:var(--mk-text)] group-hover:text-[color:var(--brand-text)]">
                      {post.title}
                    </h2>
                    <p className="mt-3 text-[color:var(--mk-text-muted)]">{post.description}</p>
                    <div className="mt-4 flex flex-wrap gap-2">
                      {post.tags.map((tag) => (
                        <span
                          key={tag}
                          className="rounded-full border border-[color:var(--mk-border)] px-3 py-1 text-xs text-[color:var(--mk-text-subtle)]"
                        >
                          {tag}
                        </span>
                      ))}
                    </div>
                  </Link>
                </article>
              ))}
            </div>
          </div>
        </Section>
        <CTASection
          title="Bereit für belegte KI-Antworten?"
          sub="Starte deine 14-tägige Testphase — keine Kreditkarte nötig."
          href="/signup"
          label="14 Tage testen"
        />
      </div>
    </>
  );
}
