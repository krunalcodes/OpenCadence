"use client";

import { cn } from "@workspace/ui/lib/utils";
import { Download, FileSpreadsheet, Upload } from "lucide-react";
import { type Ref, useRef, useState } from "react";
import { buttonFocusRing } from "@/components/app-shell/page-header";
import {
  Notice,
  StepHeading,
  textLinkClass,
} from "@/features/imports/components/parts";
import { copy } from "@/features/imports/lib/copy";
import {
  acceptAttribute,
  formatFileSize,
  toCsv,
} from "@/features/imports/lib/file";

const text = copy.file;

function downloadSample() {
  const blob = new Blob([toCsv(text.sampleRows)], {
    type: "text/csv;charset=utf-8",
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = text.sampleName;
  document.body.append(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
}

type FileStepProps = {
  headingRef: Ref<HTMLHeadingElement>;
  file: File | null;
  error: string | null;
  onChoose: (files: File[]) => void;
};

export function FileStep({ headingRef, file, error, onChoose }: FileStepProps) {
  const input = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);
  const Icon = file ? FileSpreadsheet : Upload;

  return (
    <div className="flex max-w-[720px] flex-col gap-3.5">
      <div className="flex flex-col gap-1">
        <StepHeading ref={headingRef}>{text.heading}</StepHeading>
        <p id="import-file-guidance" className="text-muted-foreground">
          {text.guidance}
        </p>
      </div>

      <input
        ref={input}
        hidden
        type="file"
        accept={acceptAttribute}
        aria-label={text.inputLabel}
        onChange={(event) => {
          onChoose(Array.from(event.target.files ?? []));
          event.target.value = "";
        }}
      />
      <button
        type="button"
        aria-describedby={error ? "import-file-error" : "import-file-guidance"}
        onClick={() => input.current?.click()}
        onDragOver={(event) => {
          event.preventDefault();
          setOver(true);
        }}
        onDragLeave={() => setOver(false)}
        onDrop={(event) => {
          event.preventDefault();
          setOver(false);
          onChoose(Array.from(event.dataTransfer.files));
        }}
        className={cn(
          "flex w-full flex-col items-center gap-1 rounded-lg border border-dashed px-6 py-8 text-center transition-colors",
          over
            ? "border-primary bg-muted"
            : "border-border bg-muted/30 hover:bg-muted/60",
          error && !over && "border-danger",
          buttonFocusRing,
        )}
      >
        <span className="mb-1.5 grid size-9 place-items-center rounded-lg border border-border bg-card text-primary shadow-xs">
          <Icon aria-hidden className="size-4" strokeWidth={1.6} />
        </span>
        {over ? (
          <span className="font-medium text-foreground">{text.dropActive}</span>
        ) : file ? (
          <>
            <span className="max-w-full truncate font-medium text-foreground">
              {file.name}
            </span>
            <span className="text-ink-tertiary tabular-nums">
              {formatFileSize(file.size)}
            </span>
            <span className="text-[12.5px] text-ink-tertiary">
              {text.replace}
            </span>
          </>
        ) : (
          <>
            <span className="font-medium text-foreground">{text.drop}</span>
            <span className="text-[12.5px] text-ink-tertiary">
              {text.dropHint}
            </span>
          </>
        )}
      </button>
      <p role="status" className="sr-only">
        {file ? text.chosen(file.name, formatFileSize(file.size)) : ""}
      </p>

      {error ? (
        <Notice tone="danger" id="import-file-error" role="alert">
          {error}
        </Notice>
      ) : null}

      <button
        type="button"
        onClick={downloadSample}
        className={cn(
          textLinkClass,
          "inline-flex w-fit items-center gap-1.5 text-muted-foreground",
        )}
      >
        <Download aria-hidden className="size-3.5" strokeWidth={1.6} />
        {text.sample}
      </button>
    </div>
  );
}
