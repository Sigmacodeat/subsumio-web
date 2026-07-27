import AudiencePage from "@/components/marketing/audience-page";
import { audienceMetadata } from "@/lib/audience-metadata";
export const metadata = audienceMetadata("fr", "professional", "/fr/kanzlei");
export default function Page() {
  return <AudiencePage lang="fr" audience="professional" />;
}
