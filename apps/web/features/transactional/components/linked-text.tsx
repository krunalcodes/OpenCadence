import { cn } from "@workspace/ui/lib/utils";
import Link from "next/link";
import { focusRing } from "@/components/app-shell/page-header";
import type { LinkedText as LinkedTextCopy } from "@/features/transactional/lib/copy";
import { appHref } from "@/lib/navigation";

export function LinkedText({ text }: { text: LinkedTextCopy }) {
  return (
    <>
      {text.before}
      <Link
        href={appHref(text.path)}
        className={cn(
          "rounded-[4px] font-medium text-foreground underline decoration-border underline-offset-[3px] hover:decoration-foreground",
          focusRing,
        )}
      >
        {text.link}
      </Link>
      {text.after}
    </>
  );
}
