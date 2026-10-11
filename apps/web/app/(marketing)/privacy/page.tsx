import type { Metadata } from "next";
import { LegalPage } from "@/features/marketing/components/legal-page";
import {
  privacyIntro,
  privacySections,
  privacySummary,
  privacyUpdated,
} from "@/features/marketing/content/privacy";

export const metadata: Metadata = {
  title: "Privacy policy · OpenCadence",
};

export default function Page() {
  return (
    <LegalPage
      title="Privacy policy"
      updated={privacyUpdated}
      summary={privacySummary}
      intro={privacyIntro}
      sections={privacySections}
      related={{ href: "/terms", label: "Terms of service" }}
    />
  );
}
