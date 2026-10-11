"use client";

import { Button } from "@workspace/ui/components/button";
import { useEffect, useRef, useState } from "react";
import {
  primaryButtonClass,
  secondaryButtonClass,
} from "@/components/product/styles";
import { Spinner } from "@/components/spinner";
import { CancelImportDialog } from "@/features/imports/components/cancel-import-dialog";
import { FileStep } from "@/features/imports/components/file-step";
import { ImportProgress } from "@/features/imports/components/import-progress";
import { MappingStep } from "@/features/imports/components/mapping-step";
import {
  OptionsStep,
  type StartErrors,
} from "@/features/imports/components/options-step";
import { StepHeader } from "@/features/imports/components/step-header";
import {
  type UploadState,
  UploadStep,
} from "@/features/imports/components/upload-step";
import { copy, describeError } from "@/features/imports/lib/copy";
import {
  estimateRows,
  fileProblem,
  isBlank,
} from "@/features/imports/lib/file";
import { startingTargets } from "@/features/imports/lib/headings";
import type { Catalog, Import, Option } from "@/features/imports/lib/imports";
import {
  mappingProblem,
  toMappingPayload,
} from "@/features/imports/lib/mapping";
import {
  chunkCount,
  isRetryable,
  sendChunks,
} from "@/features/imports/lib/upload";
import {
  createImport,
  fetchImport,
  finishUpload,
  putChunk,
  startImport,
} from "@/features/imports/queries/client";

const progressStep = 5;

type ImportWizardProps = {
  catalog: Catalog;
  resume: Import | null;
  live: Record<string, Import>;
  stale: boolean;
  onImport: (item: Import) => void;
  onBusyChange: (busy: boolean) => void;
  onReset: () => void;
};

export function ImportWizard({
  catalog,
  resume,
  live,
  stale,
  onImport,
  onBusyChange,
  onReset,
}: ImportWizardProps) {
  const [step, setStep] = useState(resume ? 3 : 1);
  const [file, setFile] = useState<File | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const [upload, setUpload] = useState<UploadState | null>(null);
  const [draft, setDraft] = useState(resume);
  const [targets, setTargets] = useState(() =>
    resume ? startingTargets(resume, catalog.fields) : [],
  );
  const [estimate, setEstimate] = useState<number | null>(null);
  const [updateExisting, setUpdateExisting] = useState(true);
  const [lists, setLists] = useState<Option[]>([]);
  const [tags, setTags] = useState<Option[]>([]);
  const [errors, setErrors] = useState<StartErrors>({});
  const [starting, setStarting] = useState(false);
  const [cancelling, setCancelling] = useState<Import | null>(null);
  const run = useRef({ cancelled: false });
  const heading = useRef<HTMLHeadingElement>(null);
  const focused = useRef(step);

  const uploading = step === 2 && upload !== null && upload.phase !== "failed";
  const current = draft ? (live[draft.id] ?? draft) : null;
  const problem = mappingProblem(targets);

  useEffect(() => {
    onBusyChange(uploading);
  }, [uploading, onBusyChange]);

  useEffect(() => {
    if (!uploading) {
      return;
    }
    function warn(event: BeforeUnloadEvent) {
      event.preventDefault();
      event.returnValue = "";
    }
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [uploading]);

  useEffect(() => {
    return () => {
      run.current.cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (resume) {
      heading.current?.focus();
    }
  }, [resume]);

  useEffect(() => {
    if (focused.current !== step) {
      focused.current = step;
      heading.current?.focus();
    }
  }, [step]);

  function chooseFiles(files: File[]) {
    const chosen = files[0];
    if (!chosen) {
      return;
    }
    if (files.length > 1) {
      setFileError(copy.file.several);
      return;
    }
    const found = fileProblem(chosen);
    if (found) {
      setFile(null);
      setFileError(copy.file.problems[found]);
      return;
    }
    setFile(chosen);
    setFileError(null);
  }

  async function sendFile(chosen: File) {
    const active = { cancelled: false };
    run.current.cancelled = true;
    run.current = active;

    function fail(message: string, retryable: boolean) {
      if (!active.cancelled) {
        setUpload({ phase: "failed", message, retryable });
      }
    }

    setUpload({ phase: "reading" });
    let text: string;
    try {
      text = await chosen.text();
    } catch {
      fail(copy.upload.unreadable, false);
      return;
    }
    if (active.cancelled) {
      return;
    }
    if (isBlank(text)) {
      fail(copy.file.problems.empty, false);
      return;
    }

    const created = await createImport(chosen.name, chosen.size);
    if (active.cancelled) {
      return;
    }
    if (!created.ok) {
      fail(describeError(created.error), isRetryable(created.error));
      return;
    }
    const { id, chunkSize } = created.data;
    const total = chunkCount(text.length, chunkSize);
    setUpload({ phase: "sending", sent: 0, total });

    const outcome = await sendChunks({
      text,
      chunkSize,
      send: (index, data) => putChunk(id, index, data),
      onProgress: (sent) => {
        if (!active.cancelled) {
          setUpload({ phase: "sending", sent, total });
        }
      },
      isCancelled: () => active.cancelled,
    });
    if (outcome.state === "cancelled" || active.cancelled) {
      return;
    }
    if (outcome.state === "failed") {
      fail(describeError(outcome.error), isRetryable(outcome.error));
      return;
    }

    setUpload({ phase: "finishing", total });
    const finished = await finishUpload(id, total);
    if (active.cancelled) {
      return;
    }
    if (!finished.ok) {
      fail(describeError(finished.error), isRetryable(finished.error));
      return;
    }

    setEstimate(estimateRows(text));
    setDraft(finished.data);
    setTargets(startingTargets(finished.data, catalog.fields));
    setErrors({});
    setUpload(null);
    setStep(3);
    onImport(finished.data);
  }

  function beginUpload() {
    if (!file) {
      return;
    }
    setStep(2);
    void sendFile(file);
  }

  function backToFile() {
    run.current.cancelled = true;
    setUpload(null);
    setErrors({});
    setStep(1);
  }

  function changeTarget(index: number, target: string) {
    setTargets((existing) =>
      existing.map((item, position) => (position === index ? target : item)),
    );
    setErrors((existing) => ({ ...existing, mapping: undefined }));
  }

  async function begin() {
    if (!draft || starting) {
      return;
    }
    if (problem) {
      setStep(3);
      return;
    }
    setStarting(true);
    setErrors({});
    const result = await startImport(draft.id, {
      mapping: toMappingPayload(draft.columns, targets),
      updateExisting,
      listIds: lists.map((item) => item.value),
      tagIds: tags.map((item) => item.value),
    });
    if (result.ok) {
      setStarting(false);
      setDraft(result.data);
      onImport(result.data);
      setStep(progressStep);
      return;
    }
    const { error } = result;
    if (error.status === 409) {
      const latest = await fetchImport(draft.id);
      if (latest.ok && latest.data.status !== "uploaded") {
        setStarting(false);
        setDraft(latest.data);
        onImport(latest.data);
        setStep(progressStep);
        return;
      }
    }
    setStarting(false);
    const message = describeError(error);
    if (error.field === "mapping") {
      setErrors({ mapping: message });
      setStep(3);
      return;
    }
    if (error.field === "listIds" || error.field === "tagIds") {
      setErrors({ [error.field]: message });
      document
        .getElementById(
          error.field === "listIds" ? "import-lists" : "import-tags",
        )
        ?.focus();
      return;
    }
    setErrors({ form: message });
  }

  const failedUpload = upload?.phase === "failed" ? upload : null;

  return (
    <section
      aria-label={copy.wizard.label}
      className="min-w-0 overflow-hidden rounded-xl border border-border bg-card shadow-xs"
    >
      <div className="border-b border-border-subtle px-4 py-[13px]">
        <StepHeader current={step} />
      </div>

      <div className="px-4 py-4">
        {step === 1 ? (
          <FileStep
            headingRef={heading}
            file={file}
            error={fileError}
            onChoose={chooseFiles}
          />
        ) : null}
        {step === 2 && upload ? (
          <UploadStep headingRef={heading} file={file} upload={upload} />
        ) : null}
        {step === 3 && current ? (
          <MappingStep
            headingRef={heading}
            columns={current.columns}
            sampleRows={current.sampleRows}
            targets={targets}
            fields={catalog.fields}
            error={errors.mapping}
            disabled={starting}
            onChange={changeTarget}
          />
        ) : null}
        {step === 4 && current ? (
          <OptionsStep
            headingRef={heading}
            fileName={current.fileName || copy.recent.unnamed}
            fileSize={current.fileSize}
            columns={current.columns}
            targets={targets}
            catalog={catalog}
            updateExisting={updateExisting}
            lists={lists}
            tags={tags}
            errors={errors}
            pending={starting}
            onUpdateExistingChange={setUpdateExisting}
            onListsChange={(next) => {
              setLists(next);
              setErrors((existing) => ({ ...existing, listIds: undefined }));
            }}
            onTagsChange={(next) => {
              setTags(next);
              setErrors((existing) => ({ ...existing, tagIds: undefined }));
            }}
          />
        ) : null}
        {step === progressStep && current ? (
          <ImportProgress
            headingRef={heading}
            item={current}
            estimate={estimate}
            stale={stale}
            onCancel={() => setCancelling(current)}
            onAnother={onReset}
          />
        ) : null}
      </div>

      {step === progressStep ? null : (
        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border-subtle px-4 py-3">
          <div className="flex items-center gap-2">
            {step === 2 && !failedUpload ? (
              <Button
                type="button"
                variant="outline"
                onClick={backToFile}
                className={secondaryButtonClass}
              >
                {copy.upload.cancel}
              </Button>
            ) : null}
            {failedUpload || step === 3 ? (
              <Button
                type="button"
                variant="outline"
                disabled={starting}
                onClick={backToFile}
                className={secondaryButtonClass}
              >
                {copy.upload.chooseAnother}
              </Button>
            ) : null}
            {step === 4 ? (
              <Button
                type="button"
                variant="outline"
                disabled={starting}
                onClick={() => setStep(3)}
                className={secondaryButtonClass}
              >
                {copy.wizard.back}
              </Button>
            ) : null}
          </div>
          <div className="flex items-center gap-2">
            {step === 1 ? (
              <Button
                type="button"
                disabled={!file}
                onClick={beginUpload}
                className={primaryButtonClass}
              >
                {copy.wizard.next}
              </Button>
            ) : null}
            {failedUpload?.retryable ? (
              <Button
                type="button"
                onClick={beginUpload}
                className={primaryButtonClass}
              >
                {copy.upload.retry}
              </Button>
            ) : null}
            {step === 3 ? (
              <Button
                type="button"
                disabled={problem !== null}
                onClick={() => setStep(4)}
                className={primaryButtonClass}
              >
                {copy.wizard.next}
              </Button>
            ) : null}
            {step === 4 ? (
              <Button
                type="button"
                disabled={starting}
                aria-busy={starting || undefined}
                onClick={() => void begin()}
                className={primaryButtonClass}
              >
                {starting ? <Spinner /> : null}
                {copy.options.start}
              </Button>
            ) : null}
          </div>
        </div>
      )}

      <CancelImportDialog
        item={cancelling}
        onClose={() => setCancelling(null)}
        onCancelled={(item) => {
          setDraft(item);
          onImport(item);
        }}
      />
    </section>
  );
}
