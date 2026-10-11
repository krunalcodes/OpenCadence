import { cn } from "@workspace/ui/lib/utils";
import Link from "next/link";
import { BrandIcon } from "@/components/brand-icon";

function BrandMark({ className }: { className?: string }) {
  return (
    <Link
      href="/"
      className={cn(
        "-ml-1 inline-flex items-center gap-2.5 rounded-lg px-1 py-1 font-semibold text-[15px] text-foreground tracking-[-0.01em] outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
        className,
      )}
    >
      <span
        aria-hidden="true"
        className="grid size-7 shrink-0 place-items-center rounded-lg bg-primary text-live"
      >
        <BrandIcon />
      </span>
      OpenCadence
    </Link>
  );
}

export { BrandMark };
