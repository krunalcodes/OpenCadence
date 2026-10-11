import { cn } from "@workspace/ui/lib/utils";
import { Check } from "lucide-react";
import Link from "next/link";
import { buttonFocusRing } from "@/components/app-shell/page-header";
import { linkButtonClass } from "@/components/product/styles";
import { OverviewCard } from "@/features/overview/components/overview-card";
import { copy } from "@/features/overview/lib/copy";
import type { OverviewSetup } from "@/features/overview/lib/overview";
import { appHref } from "@/lib/navigation";

export function GettingStarted({ setup }: { setup: OverviewSetup }) {
  const { steps } = copy.setup;
  const done = steps.filter((step) => setup[step.id]).length;
  const next = steps.find((step) => !setup[step.id]);

  return (
    <OverviewCard
      id="overview-setup"
      title={copy.setup.title}
      description={copy.setup.progress(done, steps.length)}
    >
      <ol className="divide-y divide-border-subtle">
        {steps.map((step) => {
          const complete = setup[step.id];
          const current = step.id === next?.id;
          return (
            <li
              key={step.id}
              className="flex flex-wrap items-center gap-x-3 gap-y-2 px-4 py-3.5"
            >
              <span
                aria-hidden="true"
                className={cn(
                  "grid size-5 shrink-0 place-items-center rounded-full border",
                  complete
                    ? "border-success bg-success text-white"
                    : "border-border bg-card",
                  current && "border-primary",
                )}
              >
                {complete ? (
                  <Check className="size-3" strokeWidth={2.4} />
                ) : null}
              </span>
              <div className="min-w-0 flex-1 basis-64">
                <p
                  className={cn(
                    "text-[13px] font-medium",
                    complete ? "text-muted-foreground" : "text-foreground",
                  )}
                >
                  {step.title}
                  <span className="sr-only">
                    {`, ${complete ? copy.setup.done : copy.setup.todo}`}
                  </span>
                </p>
                <p className="text-[12.5px] text-ink-tertiary">{step.body}</p>
              </div>
              {complete ? (
                <span className="text-xs font-medium text-success">
                  {copy.setup.done}
                </span>
              ) : (
                <Link
                  href={appHref(step.path)}
                  className={cn(
                    linkButtonClass,
                    buttonFocusRing,
                    "px-3",
                    current
                      ? "border-primary bg-primary text-primary-foreground hover:bg-brand-hover"
                      : "border-border bg-card text-foreground shadow-xs hover:bg-muted",
                  )}
                >
                  {step.action}
                </Link>
              )}
            </li>
          );
        })}
      </ol>
    </OverviewCard>
  );
}
