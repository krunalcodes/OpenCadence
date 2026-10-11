import { cn } from "@workspace/ui/lib/utils";
import { Mail, Server } from "lucide-react";
import { brandIcons, type IntegrationMark } from "@/lib/brand-icons";

type SourceMarkProps = {
  integration: IntegrationMark;
  className?: string;
};

export function SourceMark({ integration, className }: SourceMarkProps) {
  const brand = brandIcons[integration.id];
  const Icon = integration.id === "smtp" ? Server : Mail;
  return (
    <span
      aria-hidden="true"
      className={cn(
        "grid size-7 shrink-0 place-items-center rounded-[7px] border border-border text-[11px] font-semibold tracking-[-0.01em]",
        brand ? "bg-card text-foreground" : "bg-muted text-muted-foreground",
        className,
      )}
    >
      {brand ? (
        <svg
          aria-hidden="true"
          viewBox="0 0 24 24"
          className="size-[15px]"
          fill={brand.color ?? "currentColor"}
        >
          <path d={brand.path} />
        </svg>
      ) : (
        (integration.mark ?? <Icon className="size-4" strokeWidth={1.6} />)
      )}
    </span>
  );
}
