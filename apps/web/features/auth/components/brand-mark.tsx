import { cn } from "@workspace/ui/lib/utils";
import Link from "next/link";

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
        <svg
          aria-hidden="true"
          viewBox="0 0 24 24"
          className="size-4"
          fill="none"
          stroke="currentColor"
          strokeWidth={2.2}
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M3 12h3l3-8 4 16 3-8h5" />
        </svg>
      </span>
      OpenCadence
    </Link>
  );
}

export { BrandMark };
