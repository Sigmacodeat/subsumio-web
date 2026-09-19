// SuperBrain marketing page — composer only. Each section lives in
// ./superbrain/*.tsx so they stay individually reviewable and testable.

import { getCopy } from "./superbrain-content";
import { HeroSection } from "./superbrain/hero";
import { StatsBand, OthersSection, OursSection } from "./superbrain/story";
import { ArchitectureSection, DreamCycleSection, FineTuneSection } from "./superbrain/architecture";
import { CompareSection } from "./superbrain/compare";
import { LearningSection } from "./superbrain/learning";
import { PrivacySection, UseCasesSection, TrustSection, FAQSection } from "./superbrain/proof";
import { StickyCTA, CTASection } from "./superbrain/cta";

export default function SuperbrainPage() {
  const t = getCopy();

  return (
    <div
      data-tone="light"
      className="min-h-screen overflow-x-clip [background:var(--mk-bg)]"
      lang="de-AT"
    >
      <HeroSection t={t} />
      <StatsBand t={t} />
      <OthersSection t={t} />
      <OursSection t={t} />
      <ArchitectureSection t={t} />
      <DreamCycleSection t={t} />
      <LearningSection t={t} />
      <CompareSection t={t} />
      <FineTuneSection t={t} />
      <UseCasesSection t={t} />
      <PrivacySection t={t} />
      <TrustSection t={t} />
      <FAQSection t={t} />
      <CTASection t={t} />
      <StickyCTA t={t} />
    </div>
  );
}
