import { renderOgImage, ogImageSize, ogImageContentType } from "@/lib/og-image";
import { getCityBySlug, getAllCitySlugs } from "@/content/city-pages";

export const size = ogImageSize;
export const contentType = ogImageContentType;

export const dynamicParams = false;

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
