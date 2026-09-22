import { renderOgImage, ogImageSize, ogImageContentType } from "@/lib/og-image";
import {
  getCityBySlugDe as getCityBySlug,
  getAllCitySlugsDe as getAllCitySlugs,
} from "@/content/city-pages-de";

export const size = ogImageSize;
export const contentType = ogImageContentType;

export function generateStaticParams() {
  return getAllCitySlugs().map((slug) => ({ slug }));
}

export default async function Image({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const city = getCityBySlug(slug);
  return renderOgImage(
    city?.metaTitle ?? "Subsumio für Kanzleien",
    `Kanzleisoftware ${city?.city ?? ""}`.trim()
  );
}
