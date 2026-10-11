export type Delimiter = "," | ";" | "\t";

const delimiters: Delimiter[] = [",", ";", "\t"];
const QUOTE = 34;
const CR = 13;
const LF = 10;
const SPACE = 32;
const BYTE_ORDER_MARK = 0xfeff;

type State = "start" | "unquoted" | "quoted" | "quoteClosed";

export function detectDelimiter(line: string): Delimiter {
  const counts: Record<Delimiter, number> = { ",": 0, ";": 0, "\t": 0 };
  let quoted = false;
  for (const character of line) {
    if (character === '"') {
      quoted = !quoted;
    } else if (!quoted && character in counts) {
      counts[character as Delimiter] += 1;
    }
  }
  let best: Delimiter = ",";
  for (const candidate of delimiters) {
    if (counts[candidate] > counts[best]) {
      best = candidate;
    }
  }
  return best;
}

export function fitRow(row: string[], width: number): string[] {
  if (row.length === width) {
    return row;
  }
  const fitted = row.slice(0, width);
  while (fitted.length < width) {
    fitted.push("");
  }
  return fitted;
}

export function isEmptyRow(row: string[]): boolean {
  return row.every((cell) => cell.trim() === "");
}

export function encodeCsvCell(cell: string): string {
  return /[",\r\n]|^\s|\s$/.test(cell)
    ? `"${cell.replaceAll('"', '""')}"`
    : cell;
}

export function encodeCsvRow(cells: string[]): string {
  return cells.map(encodeCsvCell).join(",");
}

export class CsvParser {
  private separator: Delimiter | null;
  private started = false;
  private head = "";
  private headScan = 0;
  private headLineStart = 0;
  private headQuoted = false;
  private headHasContent = false;
  private state: State = "start";
  private field = "";
  private row: string[] = [];
  private rowQuoted = false;
  private skipLineFeed = false;
  private ended = false;

  constructor(delimiter?: Delimiter) {
    this.separator = delimiter ?? null;
  }

  get delimiter(): Delimiter | null {
    return this.separator;
  }

  write(text: string): string[][] {
    if (this.ended) {
      throw new Error("The parser has already ended.");
    }
    let input = text;
    if (!this.started && input.length > 0) {
      this.started = true;
      if (input.charCodeAt(0) === BYTE_ORDER_MARK) {
        input = input.slice(1);
      }
    }
    if (this.separator === null) {
      this.head += input;
      if (!this.headLineComplete()) {
        return [];
      }
      this.separator = detectDelimiter(
        this.head.slice(this.headLineStart, this.headScan),
      );
      input = this.head;
      this.head = "";
    }
    return this.consume(input, this.separator);
  }

  end(): string[][] {
    if (this.ended) {
      return [];
    }
    this.ended = true;
    const rows: string[][] = [];
    if (this.separator === null) {
      this.separator = detectDelimiter(this.head.slice(this.headLineStart));
      rows.push(...this.consume(this.head, this.separator));
      this.head = "";
    }
    if (this.state !== "start" || this.row.length > 0) {
      this.endRow(rows);
    }
    return rows;
  }

  private headLineComplete(): boolean {
    while (this.headScan < this.head.length) {
      const code = this.head.charCodeAt(this.headScan);
      if (code === QUOTE) {
        this.headQuoted = !this.headQuoted;
        this.headHasContent = true;
      } else if (!this.headQuoted && (code === CR || code === LF)) {
        if (this.headHasContent) {
          return true;
        }
        this.headLineStart = this.headScan + 1;
      } else if (code !== SPACE) {
        this.headHasContent = true;
      }
      this.headScan += 1;
    }
    return false;
  }

  private consume(input: string, separator: Delimiter): string[][] {
    const rows: string[][] = [];
    const separatorCode = separator.charCodeAt(0);
    const length = input.length;
    let index = 0;
    while (index < length) {
      const code = input.charCodeAt(index);
      if (this.skipLineFeed) {
        this.skipLineFeed = false;
        if (code === LF) {
          index += 1;
          continue;
        }
      }
      if (this.state === "quoted") {
        let end = index;
        while (end < length && input.charCodeAt(end) !== QUOTE) {
          end += 1;
        }
        this.field += input.slice(index, end);
        if (end < length) {
          this.state = "quoteClosed";
          end += 1;
        }
        index = end;
        continue;
      }
      if (this.state === "quoteClosed") {
        if (code === QUOTE) {
          this.field += '"';
          this.state = "quoted";
          index += 1;
          continue;
        }
        this.state = "unquoted";
      }
      if (this.state === "start" && code === QUOTE) {
        this.state = "quoted";
        this.rowQuoted = true;
        index += 1;
        continue;
      }
      let end = index;
      while (end < length) {
        const next = input.charCodeAt(end);
        if (next === separatorCode || next === CR || next === LF) {
          break;
        }
        end += 1;
      }
      if (end > index) {
        this.field += input.slice(index, end);
        this.state = "unquoted";
      }
      if (end < length) {
        const stop = input.charCodeAt(end);
        if (stop === separatorCode) {
          this.endField();
        } else {
          this.endRow(rows);
          this.skipLineFeed = stop === CR;
        }
        end += 1;
      }
      index = end;
    }
    return rows;
  }

  private endField() {
    this.row.push(this.field);
    this.field = "";
    this.state = "start";
  }

  private endRow(rows: string[][]) {
    this.endField();
    const row = this.row;
    const blank =
      row.length === 1 && !this.rowQuoted && (row[0] ?? "").trim() === "";
    this.row = [];
    this.rowQuoted = false;
    if (!blank) {
      rows.push(row);
    }
  }
}

export function parseCsv(text: string, delimiter?: Delimiter): string[][] {
  const parser = new CsvParser(delimiter);
  return [...parser.write(text), ...parser.end()];
}
