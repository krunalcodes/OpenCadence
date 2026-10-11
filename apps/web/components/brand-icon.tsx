import { cn } from "@workspace/ui/lib/utils";

export function BrandIcon({ className }: { className?: string }) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      className={cn("size-4", className)}
      fill="none"
      stroke="currentColor"
      strokeWidth={2.2}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M3 12h3l3-8 4 16 3-8h5" />
    </svg>
  );
}
