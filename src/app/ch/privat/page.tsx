import AudiencePage from "@/components/marketing/audience-page";
import { audienceMetadata } from "@/lib/audience-metadata";
export const metadata = audienceMetadata("ch", "private", "/ch/privat");
export default function Page() {
  return <AudiencePage lang="ch" audience="private" />;
}
