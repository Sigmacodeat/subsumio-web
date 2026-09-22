import { renderOgImage, ogImageSize, ogImageContentType } from "@/lib/og-image";

export const size = ogImageSize;
export const contentType = ogImageContentType;

export default function Image() {
  return renderOgImage(
    "Mandantendaten gehören der Kanzlei — EU-Hosting mit AVV, On-Premise im Enterprise-Tarif",
    "Sicherheit"
  );
}
