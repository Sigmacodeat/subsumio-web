import type { Metadata } from "next";
import Link from "next/link";
import { JsonLd, breadcrumbLd, organizationLd, blogLd } from "@/components/seo/jsonld";
import { getAllPosts } from "@/content/blog";
import { keywordsFor } from "@/lib/seo-keywords";

export const metadata: Metadata = {
  title: "Subsumio Blog — KI-Kanzleisoftware Praxiswissen",
  description:
    "Praxiswissen für Anwälte: KI-Kanzleisoftware und Berufsgeheimnis, automatisiertes Fristenmanagement, belegte KI-Antworten vs. Halluzination. DACH-spezifisch, praxisnah.",
  keywords: keywordsFor("blog"),
  alternates: { canonical: "/blog", languages: { de: "/blog", en: "/en/blog" } },
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
      <div className="mx-auto max-w-3xl px-4 py-24 sm:px-6 lg:px-8">
        <div className="mb-12">
          <span
            className="mb-4 inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-xs font-semibold text-[color:var(--brand-text)]"
            style={{ background: "color-mix(in srgb, var(--brand-text) 10%, transparent)" }}
          >
            <span className="h-1.5 w-1.5 rounded-full bg-[color:var(--brand-text)]" />
            Blog
          </span>
          <h1 className="mb-4 text-4xl font-black [color:var(--mk-text)]">
            KI-Kanzleisoftware in der Praxis
          </h1>
          <p className="text-lg [color:var(--mk-text-muted)]">
            Praxiswissen für Anwälte in AT, DE und CH: Berufsgeheimnis, Fristenmanagement, belegte
            KI-Antworten.
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
                <h2 className="mt-2 text-2xl font-bold [color:var(--mk-text)] group-hover:text-[color:var(--brand-text)]">
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

        <div className="mt-12 flex flex-wrap gap-4">
          <Link
            href="/features"
            className="text-[color:var(--brand-text)] underline underline-offset-4 hover:text-[color:var(--mk-text)]"
          >
            Features im Überblick
          </Link>
          <Link
            href="/pricing"
            className="text-[color:var(--brand-text)] underline underline-offset-4 hover:text-[color:var(--mk-text)]"
          >
            Preise & Pläne
          </Link>
          <Link
            href="/benchmark-methodology"
            className="text-[color:var(--brand-text)] underline underline-offset-4 hover:text-[color:var(--mk-text)]"
          >
            Benchmark-Methodik
          </Link>
        </div>
      </div>
    </>
  );
}
