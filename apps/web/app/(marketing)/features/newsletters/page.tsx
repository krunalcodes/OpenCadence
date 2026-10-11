import type { Metadata } from "next";
import { FinalCta } from "@/features/marketing/components/final-cta";
import { NewslettersPage } from "@/features/marketing/components/newsletters-page";

export const metadata: Metadata = {
  title: "Newsletters · OpenCadence",
};

export default function Page() {
  return (
    <>
      <NewslettersPage />
      <FinalCta />
    </>
  );
}
