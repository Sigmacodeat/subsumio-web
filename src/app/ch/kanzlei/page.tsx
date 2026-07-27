import AudiencePage from "@/components/marketing/audience-page";
import { audienceMetadata } from "@/lib/audience-metadata";
export const metadata = audienceMetadata("ch", "professional", "/ch/kanzlei");
export default function Page() {
  return <AudiencePage lang="ch" audience="professional" />;
}
