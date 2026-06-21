import { renderOgImage, ogImageSize, ogImageContentType } from "@/lib/og-image";
import { SOLUTIONS } from "@/content/solutions";

export const size = ogImageSize;
export const contentType = ogImageContentType;

export default function Image() {
  return renderOgImage(SOLUTIONS.en["solo"].metaTitle);
}
