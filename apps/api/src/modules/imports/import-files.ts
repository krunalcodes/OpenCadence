import { Inject, Injectable } from "@nestjs/common";
import { StorageService } from "../../infra/storage/storage.service";
import { CsvParser, isEmptyRow } from "./csv-parser";
import { errorReportKey, maxChunkIndex, partKey } from "./imports.constants";

const deleteConcurrency = 20;

export class MissingPartError extends Error {
  constructor(readonly index: number) {
    super(`Part ${index} of the uploaded file is missing.`);
  }
}

@Injectable()
export class ImportFiles {
  constructor(
    @Inject(StorageService) private readonly storage: StorageService,
  ) {}

  async putPart(prefix: string, index: number, data: string) {
    await this.storage.putObject(
      partKey(prefix, index),
      Buffer.from(data, "utf16le"),
      "application/octet-stream",
    );
  }

  async *rows(prefix: string, parts: number): AsyncGenerator<string[]> {
    const parser = new CsvParser();
    for (let index = 0; index < parts; index += 1) {
      const part = await this.storage.getObject(partKey(prefix, index));
      if (!part) {
        throw new MissingPartError(index);
      }
      for (const row of parser.write(part.toString("utf16le"))) {
        if (!isEmptyRow(row)) {
          yield row;
        }
      }
    }
    for (const row of parser.end()) {
      if (!isEmptyRow(row)) {
        yield row;
      }
    }
  }

  async deleteParts(prefix: string, parts: number | null) {
    const count = parts ?? maxChunkIndex + 1;
    await this.deleteIndexes(
      prefix,
      Array.from({ length: count }, (_, index) => index),
    );
  }

  async deleteIndexes(prefix: string, indexes: number[]) {
    for (let start = 0; start < indexes.length; start += deleteConcurrency) {
      await Promise.all(
        indexes
          .slice(start, start + deleteConcurrency)
          .map((index) => this.storage.deleteObject(partKey(prefix, index))),
      );
    }
  }

  putErrorReport(prefix: string, csv: string) {
    return this.storage.putObject(
      errorReportKey(prefix),
      Buffer.from(csv, "utf8"),
      "text/csv; charset=utf-8",
    );
  }

  getErrorReport(prefix: string) {
    return this.storage.getObject(errorReportKey(prefix));
  }

  deleteErrorReport(prefix: string) {
    return this.storage.deleteObject(errorReportKey(prefix));
  }
}
