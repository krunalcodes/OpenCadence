type SectionCardProps = {
  id: string;
  title: string;
  description?: string;
  action?: React.ReactNode;
  children: React.ReactNode;
};

export function SectionCard({
  id,
  title,
  description,
  action,
  children,
}: SectionCardProps) {
  return (
    <section
      aria-labelledby={id}
      className="min-w-0 overflow-hidden rounded-xl border border-border bg-card shadow-xs"
    >
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2.5 border-b border-border-subtle px-4 py-[13px]">
        <div className="min-w-0 flex-1 basis-48">
          <h2
            id={id}
            className="truncate text-sm leading-[1.4] font-semibold tracking-[-0.005em] text-foreground"
          >
            {title}
          </h2>
          {description ? (
            <p className="truncate text-[12.5px] text-ink-tertiary tabular-nums">
              {description}
            </p>
          ) : null}
        </div>
        {action ? (
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            {action}
          </div>
        ) : null}
      </div>
      {children}
    </section>
  );
}
