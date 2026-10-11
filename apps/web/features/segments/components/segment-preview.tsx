import { Skeleton } from "@workspace/ui/components/skeleton";
import { copy } from "@/features/segments/lib/copy";
import type { SegmentPreview } from "@/features/segments/lib/segments";

const text = copy.preview;

const skeletonRows = ["one", "two", "three"];

export type PreviewState =
  | { state: "idle" }
  | { state: "loading" }
  | { state: "ready"; preview: SegmentPreview }
  | { state: "rejected"; message: string }
  | { state: "failed"; message: string };

type SegmentPreviewPanelProps = {
  preview: PreviewState;
};

export function SegmentPreviewPanel({ preview }: SegmentPreviewPanelProps) {
  return (
    <section
      aria-labelledby="segment-preview-title"
      aria-busy={preview.state === "loading" || undefined}
      className="flex flex-col gap-2.5 border-t border-border-subtle pt-4"
    >
      <h3
        id="segment-preview-title"
        className="text-[13px] font-medium text-foreground"
      >
        {text.title}
      </h3>

      {preview.state === "idle" ? (
        <p className="text-ink-tertiary">{text.idle}</p>
      ) : null}

      {preview.state === "loading" ? (
        <div className="flex flex-col gap-3">
          <span className="sr-only" role="status">
            {text.loading}
          </span>
          <Skeleton className="h-5 w-40" />
          <div className="flex flex-col gap-2.5">
            {skeletonRows.map((row) => (
              <div key={row} className="flex items-center gap-3">
                <Skeleton className="h-4 w-52 max-w-full" />
                <Skeleton className="h-4 w-28" />
              </div>
            ))}
          </div>
        </div>
      ) : null}

      {preview.state === "ready" ? (
        <div className="flex flex-col gap-2.5">
          <p
            role="status"
            className="text-sm font-semibold text-foreground tabular-nums"
          >
            {text.matches(preview.preview.count)}
          </p>
          {preview.preview.count === 0 ? (
            <p className="text-ink-tertiary">{text.none}</p>
          ) : (
            <>
              <ul
                aria-label={text.sampleLabel}
                className="divide-y divide-border-subtle border-y border-border-subtle"
              >
                {preview.preview.sample.map((contact) => (
                  <li
                    key={contact.id}
                    className="flex min-w-0 items-baseline gap-3 py-2"
                  >
                    <span className="min-w-0 truncate font-medium text-foreground">
                      {contact.email}
                    </span>
                    {contact.name ? (
                      <span className="min-w-0 shrink-[2] truncate text-ink-tertiary">
                        {contact.name}
                      </span>
                    ) : null}
                  </li>
                ))}
              </ul>
              {preview.preview.count > preview.preview.sample.length &&
              preview.preview.sample.length > 0 ? (
                <p className="text-[12.5px] text-ink-tertiary">
                  {text.sampleNote(preview.preview.sample.length)}
                </p>
              ) : null}
            </>
          )}
        </div>
      ) : null}

      {preview.state === "rejected" ? (
        <p role="alert" className="text-danger">
          <span className="font-medium">{text.rejected}</span> {preview.message}
        </p>
      ) : null}

      {preview.state === "failed" ? (
        <p role="alert" className="text-muted-foreground">
          <span className="font-medium text-foreground">{text.failed}</span>{" "}
          {preview.message}
        </p>
      ) : null}
    </section>
  );
}
