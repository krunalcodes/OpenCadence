import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { copy } from "@/features/forms/lib/copy";

export function useCopy() {
  const [copied, setCopied] = useState(false);
  const timer = useRef<number | null>(null);

  useEffect(
    () => () => {
      if (timer.current !== null) {
        window.clearTimeout(timer.current);
      }
    },
    [],
  );

  async function copyText(text: string) {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      if (timer.current !== null) {
        window.clearTimeout(timer.current);
      }
      timer.current = window.setTimeout(() => setCopied(false), 2000);
      return true;
    } catch {
      toast.error(copy.clipboard.failed, {
        description: copy.clipboard.failedBody,
      });
      return false;
    }
  }

  return { copied, copyText };
}
