import { Button } from "@workspace/ui/components/button";
import type { Metadata } from "next";
import Link from "next/link";
import { BrandMark } from "@/features/auth/components/brand-mark";

export const metadata: Metadata = {
  title: "Page not found · OpenCadence",
};

const focusRing =
  "focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background";

export default function NotFound() {
  return (
    <main className="flex min-h-svh flex-col items-center justify-center bg-background px-6 py-16 text-center">
      <BrandMark className="ml-0" />
      <h1 className="mt-8 font-semibold text-2xl text-foreground leading-[1.2] tracking-[-0.025em]">
        Page not found
      </h1>
      <p className="mt-2 max-w-sm text-[13px] text-muted-foreground leading-normal">
        This address does not match any page. It may have moved, or the link may
        be mistyped.
      </p>
      <div className="mt-6 flex flex-wrap items-center justify-center gap-2">
        <Button
          nativeButton={false}
          render={<Link href="/" />}
          className={`px-3 hover:bg-brand-hover ${focusRing}`}
        >
          Back to home
        </Button>
        <Button
          variant="outline"
          nativeButton={false}
          render={<Link href="/contact" />}
          className={`bg-card px-3 shadow-xs hover:bg-muted ${focusRing}`}
        >
          Contact us
        </Button>
      </div>
    </main>
  );
}
