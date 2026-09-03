"use client";

// Blog index body — "use client" so it can consume chrome.tsx's H1_CLASS/
// H3_CLASS string constants directly. Same RSC-boundary reason as
// city-page-content.tsx: a Server Component (app/blog/page.tsx, which needs
// the static `metadata` export) can't interpolate a client module's string
// export into a template literal — found as a real, pre-existing bug (H1
// silently rendered with a garbage className, no serif) while auditing
// every page.tsx that imports these constants during the marketing redesign.

import Link from "next/link";
import { Section, BadgePill, H1_CLASS, H3_CLASS } from "./chrome";
import type { BlogPost } from "@/content/blog";
import { useLang } from "@/lib/use-lang";

export default function BlogIndexContent({ posts }: { posts: BlogPost[] }) {
  const { t, lang } = useLang();
  const locale = lang === "en" ? "en-US" : "de-DE";
  return (
    <Section tone="light" className="px-4 py-24 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-3xl">
        <div className="mb-12">
          <BadgePill>Blog</BadgePill>
          <h1 className={`${H1_CLASS} mb-4`}>{t("blog.index_title")}</h1>
          <p className="text-lg text-pretty [color:var(--mk-text-muted)]">{t("blog.index_sub")}</p>
        </div>

        <div className="space-y-8">
          {posts.map((post) => (
            <article
              key={post.slug}
              className="border-b border-[color:var(--mk-border)] pb-8 last:border-0"
            >
              <Link href={`/blog/${post.slug}`} className="group block">
                <time className="text-sm text-[color:var(--mk-text-subtle)]">
                  {new Date(post.date).toLocaleDateString(locale, {
                    year: "numeric",
                    month: "long",
                    day: "numeric",
                  })}{" "}
                  · {post.readMinutes} {t("blog.read_minutes")}
                </time>
                <h2 className={`mt-2 ${H3_CLASS} group-hover:text-[color:var(--brand-text)]`}>
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
  );
}
