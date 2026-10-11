export const IMPORTS_QUEUE = "imports";
export const IMPORT_CONTACTS_JOB = "import-contacts";

export type ImportJob = { importId: string };

export const importJobOptions = {
  attempts: 3,
  backoff: { type: "exponential" as const, delay: 5000 },
};

export const chunkSize = 262_144;
export const maxFileSize = 52_428_800;
export const maxChunkIndex = 400;
export const maxColumns = 200;
export const sampleRowCount = 5;
export const maxSampleCellLength = 500;
export const importBatchSize = 500;
export const maxErrorRows = 10_000;
export const maxActiveImports = 3;
export const sessionTtlSeconds = 2 * 60 * 60;

export function sessionKey(id: string) {
  return `opencadence:import:${id}`;
}

export function filePrefix(workspaceId: string, id: string) {
  return `imports/${workspaceId}/${id}`;
}

export function partKey(prefix: string, index: number) {
  return `${prefix}/part-${String(index).padStart(5, "0")}`;
}

export function errorReportKey(prefix: string) {
  return `${prefix}/errors.csv`;
}
