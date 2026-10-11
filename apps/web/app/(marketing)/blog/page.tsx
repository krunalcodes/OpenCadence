import type { Metadata } from "next";
import { BlogIndex } from "@/features/marketing/components/blog-index";
import { FinalCta } from "@/features/marketing/components/final-cta";

export const metadata: Metadata = {
  title: "Blog · OpenCadence",
  description:
    "Practical guides to deliverability, newsletters, and outreach from the OpenCadence team.",
};

export default function Page() {
  return (
    <>
      <BlogIndex />
      <FinalCta />
    </>
  );
}
