import type { Metadata } from "next";
import { notFound } from "next/navigation";
import {
  JsonLd,
  breadcrumbLd,
  organizationLd,
  serviceLd,
  faqPageLd,
} from "@/components/seo/jsonld";
import { getNichePage, getAllNicheSlugs } from "@/content/niche-pages";
import { NicheLandingPage } from "@/components/marketing/niche-landing-page";

export function generateStaticParams() {
  return getAllNicheSlugs().map((slug) => ({ slug }));
}

export function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  return params.then(({ slug }) => {
    const page = getNichePage(slug);
    if (!page) return { title: "Nicht gefunden" };
    return {
      title: page.metaTitle,
      description: page.metaDesc,
      alternates: {
        canonical: `/nischen/${page.slug}`,
        languages: { de: `/nischen/${page.slug}` },
      },
      openGraph: {
        title: page.metaTitle,
        description: page.metaDesc,
        url: `/nischen/${page.slug}`,
        type: "website",
      },
    };
  });
}

export default function Page({ params }: { params: Promise<{ slug: string }> }) {
  return params.then(({ slug }) => {
    const content = getNichePage(slug);
    if (!content) notFound();

    const pageTitle = `${content.h1a} ${content.h1b}`.trim();

    return (
      <>
        <JsonLd data={organizationLd()} />
        <JsonLd
          data={serviceLd({
            name: pageTitle,
            description: content.metaDesc,
            url: `/nischen/${content.slug}`,
            lang: "de",
            audience: "Geschädigte und Rechtsanwälte in DE und AT",
          })}
        />
        <JsonLd data={faqPageLd(content.faq)} />
        <JsonLd
          data={breadcrumbLd([
            { name: "Subsumio", url: "/" },
            { name: "Rechtsbereiche", url: "/nischen" },
            { name: pageTitle, url: `/nischen/${content.slug}` },
          ])}
        />
        <NicheLandingPage content={content} />
      </>
    );
  });
}
