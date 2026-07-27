import AudiencePage from "@/components/marketing/audience-page";
import { audienceMetadata } from "@/lib/audience-metadata";
export const metadata = audienceMetadata("at", "professional", "/at/kanzlei");
export default function Page() {
  return <AudiencePage lang="at" audience="professional" />;
}
