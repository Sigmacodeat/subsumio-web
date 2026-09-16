import { renderOgImage, ogImageSize, ogImageContentType } from "@/lib/og-image";

export const size = ogImageSize;
export const contentType = ogImageContentType;

export default function Image() {
  return renderOgImage(
    "Blog — KI-Kanzleisoftware in der Praxis: § 9 Abs. 2 RAO, Fristen, Fundstellen",
    "Blog"
  );
}
