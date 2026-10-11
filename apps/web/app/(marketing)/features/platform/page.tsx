import type { Metadata } from "next";
import { FinalCta } from "@/features/marketing/components/final-cta";
import { PlatformPage } from "@/features/marketing/components/platform-page";

export const metadata: Metadata = {
  title: "Teams and security · OpenCadence",
};

export default function Page() {
  return (
    <>
      <PlatformPage />
      <FinalCta />
    </>
  );
}
