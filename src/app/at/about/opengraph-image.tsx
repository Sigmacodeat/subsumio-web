import { renderOgImage, ogImageSize, ogImageContentType } from "@/lib/og-image";

export const size = ogImageSize;
export const contentType = ogImageContentType;

export default function Image() {
  return renderOgImage(
    "KI-Kanzleisoftware aus Österreich — für österreichische Kanzleien",
    "Über uns"
  );
}
