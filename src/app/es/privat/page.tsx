import AudiencePage from "@/components/marketing/audience-page";
import { audienceMetadata } from "@/lib/audience-metadata";
export const metadata = audienceMetadata("es", "private", "/es/privat");
export default function Page() {
  return <AudiencePage lang="es" audience="private" />;
}
