import AudiencePage from "@/components/marketing/audience-page";
import { audienceMetadata } from "@/lib/audience-metadata";
export const metadata = audienceMetadata("it", "professional", "/it/kanzlei");
export default function Page() {
  return <AudiencePage lang="it" audience="professional" />;
}
