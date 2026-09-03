"use client";

// City page article body — a "use client" component so it can consume
// chrome.tsx's H1_CLASS/H2_CTA_CLASS string constants directly. These are
// plain exports from a "use client" module; a Server Component (the
// app/cities/[slug]/page.tsx wrapper, which needs generateStaticParams +
// generateMetadata) CANNOT interpolate them into a template literal — the
// RSC boundary turns every export of a client module into an opaque
// client-reference, and stringifying one throws "Attempted to call X()
// from the server". Same pattern already used by about-page.tsx,
// solution-page.tsx, niche-landing-page.tsx: thin server page.tsx wrapper,
// separate client content component.

import Link from "next/link";
import { BadgePill, BreadcrumbNav, H1_CLASS, H2_CTA_CLASS } from "./chrome";
import type { CityPageContent } from "@/content/city-pages";
import { useLang } from "@/lib/use-lang";

export default function CityPageArticle({ city }: { city: CityPageContent }) {
  const { t } = useLang();
  return (
    <article className="mx-auto max-w-3xl px-4 py-24 sm:px-6 lg:px-8">
      <BreadcrumbNav
        className="mb-8"
        items={[
          { label: "Subsumio", href: "/" },
          { label: t("city.breadcrumb.cities"), href: "/cities" },
          { label: city.city },
        ]}
      />
      <div className="mb-10">
        <BadgePill className="mb-4">
          {city.city} · {city.country}
        </BadgePill>
        <h1 className={`mb-4 ${H1_CLASS}`} style={{ fontSize: "clamp(2rem, 5vw, 3rem)" }}>
          {city.h1}
        </h1>
        <p className="text-lg text-pretty [color:var(--mk-text-muted)]">{city.intro}</p>
      </div>

      <section className="mb-10">
        <h2 className={`mb-4 ${H2_CTA_CLASS}`}>
          {t("city.jurisdiction")} {city.country}
        </h2>
        <p className="mb-4 leading-relaxed text-[color:var(--mk-text-muted)]">
          {city.jurisdictionNote}
        </p>
        <div className="mt-4">
          <h3 className="mb-2 text-lg font-semibold [color:var(--mk-text)]">{t("city.courts")}</h3>
          <ul className="ml-6 list-disc space-y-1 text-[color:var(--mk-text-muted)]">
            {city.courts.map((court) => (
              <li key={court}>{court}</li>
            ))}
          </ul>
        </div>
      </section>

      <section className="mb-10">
        <h2 className={`mb-4 ${H2_CTA_CLASS}`}>
          {t("city.features_for")} {city.city}
        </h2>
        <div className="space-y-6">
          {city.features.map((f) => (
            <div key={f.title}>
              <h3 className="mb-2 text-lg font-semibold [color:var(--mk-text)]">{f.title}</h3>
              <p className="text-[color:var(--mk-text-muted)]">{f.desc}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="mb-10">
        <h2 className={`mb-4 ${H2_CTA_CLASS}`}>{t("city.faq")}</h2>
        <div className="space-y-4">
          {city.faq.map((item) => (
            <div key={item.q} className="border-b border-[color:var(--mk-border)] pb-4">
              <h3 className="mb-2 text-base font-semibold [color:var(--mk-text)]">{item.q}</h3>
              <p className="text-sm leading-relaxed text-[color:var(--mk-text-muted)]">{item.a}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="relative mb-10 overflow-hidden rounded-lg border border-[color:var(--mk-border)] bg-[color:var(--mk-surface)] p-8 text-center">
        <div
          aria-hidden
          className="absolute inset-x-0 top-0 h-1 [background:var(--mk-accent-brass)]"
        />
        <h2 className={`mb-3 ${H2_CTA_CLASS}`}>
          {t("city.cta_title")} {city.city} {t("city.cta_and_everywhere")}
        </h2>
        <p className="mb-6 text-[color:var(--mk-text-muted)]">{t("city.cta_desc")}</p>
        <Link
          href="/signup"
          className="inline-flex items-center gap-2 rounded-lg bg-[color:var(--brand-text)] px-6 py-3 font-semibold text-white transition-opacity hover:opacity-90"
        >
          {t("city.cta_btn")}
        </Link>
      </section>

      <div className="flex flex-wrap gap-4">
        <Link
          href="/pricing"
          className="text-[color:var(--brand-text)] underline underline-offset-4 hover:text-[color:var(--mk-text)]"
        >
          {t("city.link.pricing")}
        </Link>
        <Link
          href="/features"
          className="text-[color:var(--brand-text)] underline underline-offset-4 hover:text-[color:var(--mk-text)]"
        >
          {t("city.link.features")}
        </Link>
        <Link
          href="/security"
          className="text-[color:var(--brand-text)] underline underline-offset-4 hover:text-[color:var(--mk-text)]"
        >
          {t("city.link.security")}
        </Link>
        <Link
          href="/blog"
          className="text-[color:var(--brand-text)] underline underline-offset-4 hover:text-[color:var(--mk-text)]"
        >
          {t("city.link.blog")}
        </Link>
      </div>
    </article>
  );
}
