import type { Metadata } from "next";
import { LegalPage } from "@/features/marketing/components/legal-page";
import {
  termsIntro,
  termsSections,
  termsSummary,
  termsUpdated,
} from "@/features/marketing/content/terms";

export const metadata: Metadata = {
  title: "Terms of service · OpenCadence",
};

export default function Page() {
  return (
    <LegalPage
      title="Terms of service"
      updated={termsUpdated}
      summary={termsSummary}
      intro={termsIntro}
      sections={termsSections}
      related={{ href: "/privacy", label: "Privacy policy" }}
    />
  );
}
