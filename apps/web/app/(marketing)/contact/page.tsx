import type { Metadata } from "next";
import { ContactPage } from "@/features/marketing/components/contact-page";

export const metadata: Metadata = {
  title: "Contact · OpenCadence",
};

export default function Page() {
  return <ContactPage />;
}
