import { env } from "@/lib/env";
import { pdfAsBaseUrl } from "@/lib/qes/pdf-as";

/** PDF-AS-WEB instance, e.g. https://pdfas.example.at/pdf-as-web — null when not set up. */
export function pdfAsBase(): string | null {
  return pdfAsBaseUrl(env("PDFAS_WEB_URL"));
}

/** Public base of this app, used for the URLs PDF-AS-WEB calls back. */
export function appBase(): string {
  return (env("NEXT_PUBLIC_APP_URL") || "https://app.subsum.io").replace(/\/$/, "");
}
