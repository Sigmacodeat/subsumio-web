import AudiencePage from "@/components/marketing/audience-page";
import { audienceMetadata } from "@/lib/audience-metadata";
export const metadata = audienceMetadata("en", "private", "/en/privat");
export default function Page() {
  return <AudiencePage lang="en" audience="private" />;
}
