export const maxFileSize = 50 * 1024 * 1024;

export const acceptedExtensions = [".csv", ".txt", ".tsv"];

export const acceptAttribute =
  ".csv,.txt,.tsv,text/csv,text/plain,text/tab-separated-values";

export type FileProblem = "empty" | "too_large" | "wrong_type";

export function fileProblem(file: {
  name: string;
  size: number;
}): FileProblem | null {
  const name = file.name.toLowerCase();
  if (!acceptedExtensions.some((extension) => name.endsWith(extension))) {
    return "wrong_type";
  }
  if (file.size === 0) {
    return "empty";
  }
  return file.size > maxFileSize ? "too_large" : null;
}

const sizeUnits = ["byte", "kilobyte", "megabyte"] as const;

export function formatFileSize(bytes: number) {
  let value = Math.max(bytes, 0);
  let unit = 0;
  while (value >= 1024 && unit < sizeUnits.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return new Intl.NumberFormat("en-US", {
    style: "unit",
    unit: sizeUnits[unit],
    unitDisplay: unit === 0 ? "long" : "short",
    maximumFractionDigits: unit === 0 || value >= 100 ? 0 : 1,
  }).format(value);
}

export function isBlank(text: string) {
  return !/\S/.test(text);
}

const lineFeed = 10;
const carriageReturn = 13;

export function estimateRows(text: string) {
  let end = text.length;
  while (end > 0 && text.charCodeAt(end - 1) <= 32) {
    end -= 1;
  }
  if (end === 0) {
    return 0;
  }
  let lines = 1;
  for (let index = 0; index < end; index += 1) {
    const code = text.charCodeAt(index);
    if (
      code === lineFeed ||
      (code === carriageReturn && text.charCodeAt(index + 1) !== lineFeed)
    ) {
      lines += 1;
    }
  }
  return lines - 1;
}

function csvCell(value: string) {
  return /[",\r\n]/.test(value) ? `"${value.replaceAll('"', '""')}"` : value;
}

export function toCsv(rows: string[][]) {
  return `${rows.map((row) => row.map(csvCell).join(",")).join("\r\n")}\r\n`;
}
