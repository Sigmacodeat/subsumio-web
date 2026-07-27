import AudiencePage from "@/components/marketing/audience-page";
import { audienceMetadata } from "@/lib/audience-metadata";
export const metadata = audienceMetadata("it", "private", "/it/privat");
export default function Page() {
  return <AudiencePage lang="it" audience="private" />;
}
