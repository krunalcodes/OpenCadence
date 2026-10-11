import { useState } from "react";
import { toast } from "sonner";
import { copy } from "@/features/transactional/lib/copy";

export function useCopy() {
  const [copied, setCopied] = useState(false);

  async function copyText(text: string) {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error(copy.clipboard.failed, {
        description: copy.clipboard.failedBody,
      });
    }
  }

  return { copied, copyText };
}
