import { TickProgress } from "@workspace/ui/blocks/tick-progress";
import type { Ref } from "react";
import { Spinner } from "@/components/spinner";
import { Notice, StepHeading } from "@/features/imports/components/parts";
import { copy } from "@/features/imports/lib/copy";
import { formatFileSize } from "@/features/imports/lib/file";

const text = copy.upload;

export type UploadState =
  | { phase: "reading" }
  | { phase: "sending"; sent: number; total: number }
  | { phase: "finishing"; total: number }
  | { phase: "failed"; message: string; retryable: boolean };

type UploadStepProps = {
  headingRef: Ref<HTMLHeadingElement>;
  file: File | null;
  upload: UploadState;
};

export function UploadStep({ headingRef, file, upload }: UploadStepProps) {
  const failed = upload.phase === "failed";
  const total =
    upload.phase === "sending" || upload.phase === "finishing"
      ? upload.total
      : 0;
  const sent =
    upload.phase === "sending"
      ? upload.sent
      : upload.phase === "finishing"
        ? upload.total
        : 0;
  const status = failed
    ? null
    : upload.phase === "reading"
      ? text.reading
      : upload.phase === "sending"
        ? text.sending
        : text.finishing;

  return (
    <div className="flex max-w-[720px] flex-col gap-3.5">
      <div className="flex flex-col gap-1">
        <StepHeading ref={headingRef}>{text.heading}</StepHeading>
        {file ? (
          <p className="truncate text-muted-foreground">
            <span className="font-medium text-foreground">{file.name}</span>{" "}
            <span className="tabular-nums">{formatFileSize(file.size)}</span>
          </p>
        ) : null}
      </div>

      {failed ? (
        <Notice tone="danger" role="alert">
          <span className="font-medium">{text.failedTitle}</span>{" "}
          {upload.message}
        </Notice>
      ) : (
        <div className="flex flex-col gap-2">
          <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1">
            <p
              role="status"
              className="flex items-center gap-2 font-medium text-foreground"
            >
              <Spinner className="size-3.5 text-ink-tertiary" />
              {status}
            </p>
            {total > 0 ? (
              <p className="text-[12.5px] text-muted-foreground tabular-nums">
                {text.parts(sent, total)}
              </p>
            ) : null}
          </div>
          <TickProgress
            value={sent}
            max={Math.max(total, 1)}
            aria-label={text.progressLabel}
          />
          <p className="text-[12.5px] text-ink-tertiary">{text.keepOpen}</p>
        </div>
      )}
    </div>
  );
}
