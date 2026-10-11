import { cn } from "@workspace/ui/lib/utils";
import type * as React from "react";

function Section({
  className,
  children,
  ...props
}: React.ComponentProps<"section">) {
  return (
    <section className={cn("px-0 sm:px-4", className)} {...props}>
      <div className="mk-rails">
        <div className="mk-row px-6 py-16 md:px-10 md:py-24">{children}</div>
      </div>
    </section>
  );
}

function SectionHeading({
  title,
  lead,
  align = "left",
  className,
}: {
  title: React.ReactNode;
  lead?: React.ReactNode;
  align?: "left" | "center";
  className?: string;
}) {
  return (
    <div
      className={cn(
        "max-w-2xl",
        align === "center" && "mx-auto text-center",
        className,
      )}
    >
      <h2 className="text-balance font-semibold text-3xl tracking-[-0.03em] md:text-[2.5rem] md:leading-[1.08]">
        {title}
      </h2>
      {lead ? (
        <p className="mt-4 text-pretty text-lg text-muted-foreground">{lead}</p>
      ) : null}
    </div>
  );
}

function PageHero({
  label,
  title,
  lead,
  children,
}: {
  label: string;
  title: React.ReactNode;
  lead: React.ReactNode;
  children?: React.ReactNode;
}) {
  return (
    <section className="px-0 sm:px-4">
      <div className="mk-rails">
        <div className="mk-row px-6 pt-36 pb-14 md:px-10 md:pt-44 md:pb-20">
          <p className="flex items-center gap-2 font-mono text-primary text-xs">
            <span
              aria-hidden="true"
              className="size-[7px] border border-primary bg-live"
            />
            {label}
          </p>
          <h1 className="mt-5 max-w-4xl text-balance font-semibold text-5xl tracking-[-0.04em] md:text-7xl md:leading-[1.02]">
            {title}
          </h1>
          <p className="mt-6 max-w-2xl text-pretty text-lg text-muted-foreground md:text-xl">
            {lead}
          </p>
          {children ? <div className="mt-8">{children}</div> : null}
        </div>
      </div>
    </section>
  );
}

export { PageHero, Section, SectionHeading };
