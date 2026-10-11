import type { Metadata } from "next";
import { FinalCta } from "@/features/marketing/components/final-cta";
import { TransactionalPage } from "@/features/marketing/components/transactional-page";

export const metadata: Metadata = {
  title: "Transactional API · OpenCadence",
};

export default function Page() {
  return (
    <>
      <TransactionalPage />
      <FinalCta />
    </>
  );
}
