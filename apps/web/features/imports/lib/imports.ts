import type { Option } from "@/components/product/option";
import { countOf, isRow, type Row, rowsOf, textOrNull } from "@/lib/api";

export type ImportStatus =
  | "uploaded"
  | "queued"
  | "running"
  | "completed"
  | "failed"
  | "cancelled";

export type ImportOptions = {
  updateExisting: boolean;
  listIds: string[];
  tagIds: string[];
};

export type Import = {
  id: string;
  status: ImportStatus;
  fileName: string;
  fileSize: number;
  columns: string[];
  sampleRows: string[][];
  mapping: Record<string, string> | null;
  options: ImportOptions | null;
  totalRows: number;
  processedRows: number;
  createdCount: number;
  updatedCount: number;
  skippedCount: number;
  errorCount: number;
  hasErrorReport: boolean;
  errorMessage: string | null;
  createdAt: string;
  startedAt: string | null;
  finishedAt: string | null;
};

export type CreatedImport = { id: string; chunkSize: number };

export type StartInput = {
  mapping: Record<string, string>;
  updateExisting: boolean;
  listIds: string[];
  tagIds: string[];
};

export type { Option } from "@/components/product/option";

export type FieldOption = { key: string; label: string };

export type Catalog = {
  lists: Option[];
  tags: Option[];
  fields: FieldOption[];
};

export type CatalogResult =
  | ({ state: "ready" } & Catalog)
  | { state: "failed" };

export type ImportsResult =
  | { state: "ready"; imports: Import[] }
  | { state: "failed" };

export const importStatuses: ImportStatus[] = [
  "uploaded",
  "queued",
  "running",
  "completed",
  "failed",
  "cancelled",
];

export const pollInterval = 2000;

export function isActive(status: ImportStatus) {
  return status === "queued" || status === "running";
}

function cellsOf(value: unknown): string[] {
  return Array.isArray(value)
    ? value.map((item) => (typeof item === "string" ? item : ""))
    : [];
}

function idsOf(value: unknown): string[] {
  return cellsOf(value).filter((item) => item !== "");
}

function toMapping(value: unknown): Record<string, string> | null {
  if (!isRow(value)) {
    return null;
  }
  const mapping: Record<string, string> = {};
  for (const [column, target] of Object.entries(value)) {
    if (typeof target === "string") {
      mapping[column] = target;
    }
  }
  return mapping;
}

function toOptions(value: unknown): ImportOptions | null {
  if (!isRow(value)) {
    return null;
  }
  return {
    updateExisting: value.updateExisting !== false,
    listIds: idsOf(value.listIds),
    tagIds: idsOf(value.tagIds),
  };
}

export function toImport(value: unknown): Import | null {
  if (!isRow(value)) {
    return null;
  }
  const id = textOrNull(value.id);
  const status = importStatuses.find((item) => item === value.status);
  if (!id || !status) {
    return null;
  }
  return {
    id,
    status,
    fileName: textOrNull(value.fileName) ?? "",
    fileSize: countOf(value.fileSize),
    columns: cellsOf(value.columns),
    sampleRows: Array.isArray(value.sampleRows)
      ? value.sampleRows.map(cellsOf)
      : [],
    mapping: toMapping(value.mapping),
    options: toOptions(value.options),
    totalRows: countOf(value.totalRows),
    processedRows: countOf(value.processedRows),
    createdCount: countOf(value.createdCount),
    updatedCount: countOf(value.updatedCount),
    skippedCount: countOf(value.skippedCount),
    errorCount: countOf(value.errorCount),
    hasErrorReport: value.hasErrorReport === true,
    errorMessage: textOrNull(value.errorMessage),
    createdAt: textOrNull(value.createdAt) ?? "",
    startedAt: textOrNull(value.startedAt),
    finishedAt: textOrNull(value.finishedAt),
  };
}

export function toImports(value: unknown): Import[] | null {
  if (!isRow(value) || !Array.isArray(value.imports)) {
    return null;
  }
  return value.imports.flatMap((item) => {
    const parsed = toImport(item);
    return parsed ? [parsed] : [];
  });
}

export function toCreatedImport(value: unknown): CreatedImport | null {
  if (!isRow(value)) {
    return null;
  }
  const id = textOrNull(value.id);
  const chunkSize = countOf(value.chunkSize);
  return id && Number.isInteger(chunkSize) && chunkSize > 0
    ? { id, chunkSize }
    : null;
}

function toOption(value: Row): Option | null {
  const id = textOrNull(value.id);
  const name = textOrNull(value.name);
  return id && name ? { value: id, label: name } : null;
}

export function toOptionList(value: unknown, key: string): Option[] | null {
  if (!isRow(value) || !Array.isArray(value[key])) {
    return null;
  }
  return rowsOf(value[key]).flatMap((item) => {
    const option = toOption(item);
    return option ? [option] : [];
  });
}

export function toFieldOptions(value: unknown): FieldOption[] | null {
  if (!isRow(value) || !Array.isArray(value.fields)) {
    return null;
  }
  return rowsOf(value.fields).flatMap((item) => {
    const key = textOrNull(item.key);
    return key ? [{ key, label: textOrNull(item.label) ?? key }] : [];
  });
}

export function errorReportHref(id: string) {
  return `/api/v1/imports/${encodeURIComponent(id)}/errors`;
}

export function knownTotal(item: Import, estimate: number | null) {
  const total = item.totalRows > 0 ? item.totalRows : (estimate ?? 0);
  return Math.max(total, item.processedRows);
}

export function isEstimatedTotal(item: Import, estimate: number | null) {
  return item.totalRows <= 0 && estimate !== null && estimate > 0;
}

const statusRank: Record<ImportStatus, number> = {
  uploaded: 0,
  queued: 1,
  running: 2,
  completed: 3,
  failed: 3,
  cancelled: 3,
};

export function mergeImports(loaded: Import[], live: Record<string, Import>) {
  const known = new Set(loaded.map((item) => item.id));
  const added = Object.values(live)
    .filter((item) => !known.has(item.id))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  return [
    ...added,
    ...loaded.map((item) => {
      const latest = live[item.id];
      return latest && statusRank[latest.status] >= statusRank[item.status]
        ? latest
        : item;
    }),
  ];
}
