import type { Metadata } from "next";
import { FinalCta } from "@/features/marketing/components/final-cta";
import { SequencesPage } from "@/features/marketing/components/sequences-page";

export const metadata: Metadata = {
  title: "Sequences · OpenCadence",
};

export default function Page() {
  return (
    <>
      <SequencesPage />
      <FinalCta />
    </>
  );
}
