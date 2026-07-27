import AudiencePage from "@/components/marketing/audience-page";
import { audienceMetadata } from "@/lib/audience-metadata";
export const metadata = audienceMetadata("pl", "private", "/pl/privat");
export default function Page() {
  return <AudiencePage lang="pl" audience="private" />;
}
