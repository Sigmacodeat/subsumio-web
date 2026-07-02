import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { JsonLd, breadcrumbLd, organizationLd } from "@/components/seo/jsonld";
import { getAllPosts, getPostBySlug } from "@/content/blog";
import { BadgePill, CTASection, H2_CTA_CLASS } from "@/components/marketing/chrome";

const BASE = process.env.NEXT_PUBLIC_SITE_URL || "https://subsum.eu";

export function generateStaticParams() {
  return getAllPosts().map((post) => ({ slug: post.slug }));
}

export function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  return params.then(({ slug }) => {
    const post = getPostBySlug(slug);
    if (!post) return { title: "Nicht gefunden" };
    return {
      title: `${post.title} | Subsumio Blog`,
      description: post.description,
      alternates: { canonical: `/blog/${post.slug}`, languages: { de: `/blog/${post.slug}` } },
      openGraph: {
        title: post.title,
        description: post.description,
        url: `/blog/${post.slug}`,
        type: "article",
        publishedTime: post.date,
        authors: [post.author],
        tags: post.tags,
      },
    };
  });
}

export default function BlogPostPage({ params }: { params: Promise<{ slug: string }> }) {
  return params.then(({ slug }) => {
    const post = getPostBySlug(slug);
    if (!post) notFound();

    return (
      <>
        <JsonLd data={organizationLd()} />
        <JsonLd
          data={{
            "@context": "https://schema.org",
            "@type": "Article",
            headline: post.title,
            description: post.description,
            datePublished: post.date,
            dateModified: post.date,
            author: {
              "@type": "Organization",
              name: post.author,
            },
            publisher: {
              "@type": "Organization",
              name: "Subsumio",
              url: BASE,
            },
            mainEntityOfPage: {
              "@type": "WebPage",
              "@id": `${BASE}/blog/${post.slug}`,
            },
            keywords: post.tags.join(", "),
            wordCount: post.content
              .flatMap((s) => s.paragraphs)
              .join(" ")
              .split(/\s+/).length,
          }}
        />
        <JsonLd
          data={breadcrumbLd([
            { name: "Subsumio", url: "/" },
            { name: "Blog", url: "/blog" },
            { name: post.title.slice(0, 50), url: `/blog/${post.slug}` },
          ])}
        />
        <article data-tone="light" className="min-h-screen [background:var(--mk-bg)]">
          <div className="mx-auto max-w-3xl px-4 py-24 sm:px-6 lg:px-8">
            <Link
              href="/blog"
              className="mb-8 inline-flex items-center gap-2 text-sm text-[color:var(--mk-text-subtle)] hover:text-[color:var(--mk-text)]"
            >
              ← Alle Artikel
            </Link>

            <div className="mb-8">
              <BadgePill>Blog</BadgePill>
              <div className="mb-3 flex flex-wrap gap-2">
                {post.tags.map((tag) => (
                  <span
                    key={tag}
                    className="rounded-full border border-[color:var(--mk-border)] px-3 py-1 text-xs text-[color:var(--mk-text-subtle)]"
                  >
                    {tag}
                  </span>
                ))}
              </div>
              <h1 className="mb-4 text-[clamp(1.75rem,4vw,2.5rem)] leading-[1.12] font-black tracking-tight text-balance [color:var(--mk-text)]">
                {post.title}
              </h1>
              <p className="text-lg text-pretty [color:var(--mk-text-muted)]">{post.description}</p>
              <div className="mt-4 flex items-center gap-3 text-sm text-[color:var(--mk-text-subtle)]">
                <span>{post.author}</span>
                <span>·</span>
                <time>
                  {new Date(post.date).toLocaleDateString("de-DE", {
                    year: "numeric",
                    month: "long",
                    day: "numeric",
                  })}
                </time>
                <span>·</span>
                <span>{post.readMinutes} Min. Lesezeit</span>
              </div>
            </div>

            <div className="space-y-8">
              {post.content.map((section, i) => (
                <section key={i}>
                  {section.heading && <h2 className={`mb-3 ${H2_CTA_CLASS}`}>{section.heading}</h2>}
                  {section.paragraphs.map((para, j) => (
                    <p key={j} className="mb-4 leading-relaxed text-[color:var(--mk-text-muted)]">
                      {para}
                    </p>
                  ))}
                </section>
              ))}
            </div>
          </div>
        </article>
        <CTASection
          title="Bereit für belegte KI-Antworten?"
          sub="Starte deine 14-tägige Testphase — keine Kreditkarte nötig."
          href="/signup"
          label="14 Tage testen"
        />
      </>
    );
  });
}
