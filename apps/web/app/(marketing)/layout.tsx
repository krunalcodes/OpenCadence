import "./marketing.css";
import { SiteFooter } from "@/features/marketing/components/site-footer";
import { SiteHeader } from "@/features/marketing/components/site-header";

export default function MarketingLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <div className="mk">
      <SiteHeader />
      <main>{children}</main>
      <SiteFooter />
    </div>
  );
}
