import AudiencePage from "@/components/marketing/audience-page";
import { audienceMetadata } from "@/lib/audience-metadata";
export const metadata = audienceMetadata("nl", "private", "/nl/privat");
export default function Page() {
  return <AudiencePage lang="nl" audience="private" />;
}
