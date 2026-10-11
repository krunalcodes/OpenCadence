import { cn } from "@workspace/ui/lib/utils";
import { Sparkles } from "lucide-react";
import Link from "next/link";
import { focusRing } from "@/components/app-shell/page-header";
import { copy } from "@/features/templates/lib/copy";
import { appHref } from "@/lib/navigation";

type AiSetupNoteProps = {
  compact?: boolean;
  className?: string;
};

export function AiSetupNote({ compact, className }: AiSetupNoteProps) {
  const text = copy.ai;
  return (
    <p
      className={cn(
        "flex min-w-0 items-center gap-1.5 text-[12.5px] text-muted-foreground",
        className,
      )}
    >
      <Sparkles
        aria-hidden
        strokeWidth={1.6}
        className="size-3.5 shrink-0 text-ink-tertiary"
      />
      <span className="min-w-0">
        {text.setupTitle} {compact ? null : `${text.setupBody} `}
        <Link
          href={appHref("settings/ai")}
          className={cn(
            "rounded-[4px] font-medium text-primary underline-offset-2 hover:underline",
            focusRing,
          )}
        >
          {text.setupLink}
        </Link>
      </span>
    </p>
  );
}
