import { TriangleAlert } from "lucide-react";
import { CardLink } from "@/features/overview/components/overview-card";
import { overviewAlert } from "@/features/overview/lib/sample";
import { appHref } from "@/lib/navigation";

export function DeliverabilityAlert() {
  return (
    <div
      role="status"
      className="flex flex-wrap items-center gap-x-2.5 gap-y-2 rounded-[10px] border border-danger/25 bg-danger-surface px-3 py-[9px] text-[13px] text-foreground"
    >
      <TriangleAlert
        aria-hidden="true"
        className="size-4 shrink-0 text-danger"
        strokeWidth={1.6}
      />
      <p className="min-w-0 flex-1 basis-64">
        <strong className="font-semibold text-danger">
          {overviewAlert.title}
        </strong>{" "}
        {overviewAlert.body}
      </p>
      <CardLink
        href={appHref(overviewAlert.actionPath)}
        className="border-danger/25"
      >
        {overviewAlert.actionLabel}
      </CardLink>
    </div>
  );
}
