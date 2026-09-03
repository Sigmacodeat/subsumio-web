"use client";

// Blog post body — "use client" for the same reason as blog-index-content.tsx
// and city-page-content.tsx (H1_CLASS/H2_CTA_CLASS are string exports from a
// "use client" module; a Server Component can't interpolate them). Also
// fixes the post H1 itself: it was hand-rolled with the old sans/bold
// styling instead of H1_CLASS, so it never got the editorial serif pass.

import Link from "next/link";
import { BadgePill, H1_CLASS, H2_CTA_CLASS } from "./chrome";
import type { BlogPost } from "@/content/blog";
import { useLang } from "@/lib/use-lang";

export default function BlogPostContent({ post }: { post: BlogPost }) {
  const { t, lang } = useLang();
  const locale = lang === "en" ? "en-US" : "de-DE";
  return (
    <article data-tone="light" className="min-h-screen [background:var(--mk-bg)]">
      <div className="mx-auto max-w-3xl px-4 py-24 sm:px-6 lg:px-8">
        <Link
          href="/blog"
          className="mb-8 inline-flex items-center gap-2 text-sm text-[color:var(--mk-text-subtle)] hover:text-[color:var(--mk-text)]"
        >
          {t("blog.back_to_overview")}
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
          <h1 className={`mb-4 ${H1_CLASS}`} style={{ fontSize: "clamp(1.75rem, 4vw, 2.5rem)" }}>
            {post.title}
          </h1>
          <p className="text-lg text-pretty [color:var(--mk-text-muted)]">{post.description}</p>
          <div className="mt-4 flex items-center gap-3 text-sm text-[color:var(--mk-text-subtle)]">
            <span>{post.author}</span>
            <span>·</span>
            <time>
              {new Date(post.date).toLocaleDateString(locale, {
                year: "numeric",
                month: "long",
                day: "numeric",
              })}
            </time>
            <span>·</span>
            <span>
              {post.readMinutes} {t("blog.read_minutes")}
            </span>
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
  );
}
