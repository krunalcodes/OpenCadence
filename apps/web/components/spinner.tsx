import { cn } from "@workspace/ui/lib/utils";
import { LoaderCircle } from "lucide-react";

export function Spinner({ className }: { className?: string }) {
  return (
    <LoaderCircle
      aria-hidden="true"
      strokeWidth={1.8}
      className={cn(
        "size-4 shrink-0 animate-spin motion-reduce:animate-none",
        className,
      )}
    />
  );
}
