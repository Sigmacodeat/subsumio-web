import { renderOgImage, ogImageSize, ogImageContentType } from "@/lib/og-image";

export const size = ogImageSize;
export const contentType = ogImageContentType;

export default function Image() {
  return renderOgImage("KI-Kanzleisoftware aus Deutschland — für deutsche Kanzleien", "Über uns");
}
