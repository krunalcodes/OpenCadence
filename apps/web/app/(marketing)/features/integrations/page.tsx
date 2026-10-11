import type { Metadata } from "next";
import { FinalCta } from "@/features/marketing/components/final-cta";
import { IntegrationsPage } from "@/features/marketing/components/integrations-page";

export const metadata: Metadata = {
  title: "Integrations · OpenCadence",
};

export default function Page() {
  return (
    <>
      <IntegrationsPage />
      <FinalCta />
    </>
  );
}
