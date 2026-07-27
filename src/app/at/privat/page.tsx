import AudiencePage from "@/components/marketing/audience-page";
import { audienceMetadata } from "@/lib/audience-metadata";
export const metadata = audienceMetadata("at", "private", "/at/privat");
export default function Page() {
  return <AudiencePage lang="at" audience="private" />;
}
