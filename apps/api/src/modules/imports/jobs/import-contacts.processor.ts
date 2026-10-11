import { Processor, WorkerHost } from "@nestjs/bullmq";
import { Inject, Logger } from "@nestjs/common";
import { type Job, UnrecoverableError } from "bullmq";
import { ContactsService } from "../../contacts/contacts.service";
import { encodeCsvRow, parseCsv } from "../csv-parser";
import { ImportFiles, MissingPartError } from "../import-files";
import {
  errorReportKey,
  IMPORTS_QUEUE,
  type ImportJob,
  importBatchSize,
  maxErrorRows,
} from "../imports.constants";
import {
  errorReportHeader,
  errorReportRow,
  type ImportContact,
  type MappingPlan,
  mappingPlan,
  toContact,
} from "../imports.mapping";
import {
  type ImportRow,
  ImportsRepository,
  readOptions,
  type StoredOptions,
} from "../imports.repository";

const maxErrorMessageLength = 300;
const missingEmail = "The email address is missing.";
const unexpectedFailure =
  "The import stopped because of an unexpected error. Upload the file again to retry.";
const fileUnavailable =
  "The uploaded file is no longer available. Upload it again to retry.";
const mappingMissing =
  "The import has no column mapping. Upload the file again to retry.";

type Counts = {
  processed: number;
  created: number;
  updated: number;
  skipped: number;
  errors: number;
};

type ErrorReport = { lines: string[]; dirty: boolean };

type Run = {
  row: ImportRow;
  plan: MappingPlan;
  options: StoredOptions;
  counts: Counts;
  report: ErrorReport;
};

class ImportFailure extends Error {}

@Processor(IMPORTS_QUEUE, { concurrency: 2 })
export class ImportContactsProcessor extends WorkerHost {
  private readonly logger = new Logger(ImportContactsProcessor.name);

  constructor(
    @Inject(ImportsRepository) private readonly repository: ImportsRepository,
    @Inject(ImportFiles) private readonly files: ImportFiles,
    @Inject(ContactsService) private readonly contacts: ContactsService,
  ) {
    super();
  }

  async process(job: Job<ImportJob>) {
    const row = await this.repository.findById(job.data.importId);
    if (!row) {
      return { status: "missing" };
    }
    if (row.status === "cancelled") {
      await this.cleanUp(row);
      return { status: "cancelled" };
    }
    if (row.status !== "queued" && row.status !== "running") {
      return { status: row.status };
    }
    try {
      return await this.run(row);
    } catch (error) {
      const known = error instanceof ImportFailure;
      const lastAttempt = job.attemptsMade + 1 >= (job.opts?.attempts ?? 1);
      this.logger.error(
        `Import ${row.id} stopped: ${error instanceof Error ? error.message : String(error)}`,
      );
      if (!known && !lastAttempt) {
        throw error;
      }
      const message = known ? error.message : unexpectedFailure;
      await this.repository.update(
        row.id,
        {
          status: "failed",
          errorMessage: message.slice(0, maxErrorMessageLength),
          finishedAt: new Date(),
        },
        ["queued", "running"],
      );
      await this.cleanUp(row);
      if (known) {
        throw new UnrecoverableError(message);
      }
      throw error;
    }
  }

  private async run(queued: ImportRow) {
    const row =
      queued.status === "queued"
        ? await this.repository.update(
            queued.id,
            { status: "running", startedAt: new Date() },
            ["queued"],
          )
        : queued;
    if (!row) {
      return this.stopped(queued);
    }
    const options = readOptions(row.options);
    if (!row.mapping || options.parts === null) {
      throw new ImportFailure(mappingMissing);
    }
    const state: Run = {
      row,
      plan: mappingPlan(row.columns, row.mapping),
      options,
      counts: {
        processed: row.processedRows,
        created: row.createdCount,
        updated: row.updatedCount,
        skipped: row.skippedCount,
        errors: row.errorCount,
      },
      report: await this.loadReport(row),
    };

    let header = true;
    let seen = 0;
    let batch: string[][] = [];
    try {
      for await (const cells of this.files.rows(row.fileKey, options.parts)) {
        if (header) {
          header = false;
          continue;
        }
        seen += 1;
        if (seen <= state.counts.processed) {
          continue;
        }
        batch.push(cells);
        if (batch.length === importBatchSize) {
          if (!(await this.importBatch(state, batch))) {
            return this.stopped(row);
          }
          batch = [];
        }
      }
    } catch (error) {
      if (error instanceof MissingPartError) {
        const current = await this.repository.findById(row.id);
        if (current?.status === "cancelled") {
          return this.stopped(row);
        }
        throw new ImportFailure(fileUnavailable);
      }
      throw error;
    }
    if (batch.length > 0 && !(await this.importBatch(state, batch))) {
      return this.stopped(row);
    }

    const hasReport = state.report.lines.length > 0;
    const completed = await this.repository.update(
      row.id,
      {
        status: "completed",
        totalRows: state.counts.processed,
        finishedAt: new Date(),
        errorReportKey: hasReport ? errorReportKey(row.fileKey) : null,
      },
      ["running"],
    );
    if (!completed) {
      return this.stopped(row);
    }
    if (!hasReport) {
      await this.files.deleteErrorReport(row.fileKey);
    }
    await this.files.deleteParts(row.fileKey, options.parts);
    return { status: "completed", ...state.counts };
  }

  private async importBatch(state: Run, batch: string[][]) {
    const { row, counts, report, options } = state;
    const contacts: ImportContact[] = [];
    const positions: number[] = [];
    const failures = new Map<number, string>();
    batch.forEach((cells, position) => {
      const contact = toContact(state.plan, cells);
      if (contact) {
        contacts.push(contact);
        positions.push(position);
      } else {
        failures.set(position, missingEmail);
      }
    });

    if (contacts.length > 0) {
      const result = await this.contacts.upsertMany(row.workspaceId, contacts, {
        origin: "import",
        updateExisting: options.updateExisting,
        listIds: options.listIds,
        tagIds: options.tagIds,
      });
      counts.created += result.created;
      counts.updated += result.updated;
      counts.skipped += result.skipped;
      for (const failure of result.errors) {
        const position = positions[failure.index];
        if (position !== undefined) {
          failures.set(position, failure.message);
        }
      }
    }
    counts.processed += batch.length;
    counts.errors += failures.size;

    const width = row.columns.length;
    for (const position of [...failures.keys()].sort((a, b) => a - b)) {
      if (report.lines.length >= maxErrorRows) {
        break;
      }
      report.lines.push(
        encodeCsvRow(
          errorReportRow(
            failures.get(position) ?? "",
            batch[position] ?? [],
            width,
          ),
        ),
      );
      report.dirty = true;
    }
    if (report.dirty) {
      await this.files.putErrorReport(
        row.fileKey,
        this.reportCsv(row, report.lines),
      );
      report.dirty = false;
    }

    const updated = await this.repository.update(row.id, {
      processedRows: counts.processed,
      createdCount: counts.created,
      updatedCount: counts.updated,
      skippedCount: counts.skipped,
      errorCount: counts.errors,
    });
    return updated?.status === "running";
  }

  private reportCsv(row: ImportRow, lines: string[]) {
    return `${[encodeCsvRow(errorReportHeader(row.columns)), ...lines].join("\r\n")}\r\n`;
  }

  private async loadReport(row: ImportRow): Promise<ErrorReport> {
    if (row.errorCount === 0) {
      return { lines: [], dirty: false };
    }
    const stored = await this.files.getErrorReport(row.fileKey);
    const rows = stored ? parseCsv(stored.toString("utf8"), ",") : [];
    return {
      lines: rows
        .slice(1, 1 + Math.min(row.errorCount, maxErrorRows))
        .map(encodeCsvRow),
      dirty: false,
    };
  }

  private async stopped(row: ImportRow) {
    await this.cleanUp(row);
    return { status: "cancelled" };
  }

  private async cleanUp(row: ImportRow) {
    await this.repository.attachErrorReport(
      row.id,
      errorReportKey(row.fileKey),
    );
    await this.files.deleteParts(row.fileKey, readOptions(row.options).parts);
  }
}
