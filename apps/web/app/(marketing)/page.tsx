import { FinalCta } from "@/features/marketing/components/final-cta";
import { Hero } from "@/features/marketing/components/hero";
import { HomeFaq } from "@/features/marketing/components/home-faq";
import { HomeFeatures } from "@/features/marketing/components/home-features";
import { HomeOverview } from "@/features/marketing/components/home-overview";

export default function Home() {
  return (
    <>
      <Hero />
      <HomeOverview>
        <HomeFeatures />
      </HomeOverview>
      <HomeFaq />
      <FinalCta />
    </>
  );
}
