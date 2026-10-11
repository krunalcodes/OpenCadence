import type { Metadata } from "next";

import { PricingPage } from "@/features/marketing/components/pricing-page";

export const metadata: Metadata = {
  title: "Pricing · OpenCadence",
  description:
    "OpenCadence pricing is not per contact. Contacts are unlimited on every plan, and plans differ by connected mailboxes and providers, workspaces, and team members.",
};

export default function Page() {
  return <PricingPage />;
}
