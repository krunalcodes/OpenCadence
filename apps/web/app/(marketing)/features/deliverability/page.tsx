import type { Metadata } from "next";
import { DeliverabilityPage } from "@/features/marketing/components/deliverability-page";
import { FinalCta } from "@/features/marketing/components/final-cta";

export const metadata: Metadata = {
  title: "Deliverability · OpenCadence",
};

export default function Page() {
  return (
    <>
      <DeliverabilityPage />
      <FinalCta />
    </>
  );
}
