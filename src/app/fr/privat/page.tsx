import AudiencePage from "@/components/marketing/audience-page";
import { audienceMetadata } from "@/lib/audience-metadata";
export const metadata = audienceMetadata("fr", "private", "/fr/privat");
export default function Page() {
  return <AudiencePage lang="fr" audience="private" />;
}
