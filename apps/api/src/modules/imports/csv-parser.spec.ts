import {
  CsvParser,
  detectDelimiter,
  encodeCsvCell,
  encodeCsvRow,
  fitRow,
  isEmptyRow,
  parseCsv,
} from "./csv-parser";

function parsePieces(pieces: string[]) {
  const parser = new CsvParser();
  const rows: string[][] = [];
  for (const piece of pieces) {
    rows.push(...parser.write(piece));
  }
  rows.push(...parser.end());
  return rows;
}

function everyTwoWaySplit(text: string) {
  const splits: string[][] = [];
  for (let at = 0; at <= text.length; at += 1) {
    splits.push([text.slice(0, at), text.slice(at)]);
  }
  return splits;
}

function everyThreeWaySplit(text: string) {
  const splits: string[][] = [];
  for (let first = 0; first <= text.length; first += 1) {
    for (let second = first; second <= text.length; second += 1) {
      splits.push([
        text.slice(0, first),
        text.slice(first, second),
        text.slice(second),
      ]);
    }
  }
  return splits;
}

function piecesOf(text: string, size: number) {
  const pieces: string[] = [];
  for (let at = 0; at < text.length; at += size) {
    pieces.push(text.slice(at, at + size));
  }
  return pieces;
}

describe("detectDelimiter", () => {
  it("picks the most frequent candidate outside quotes", () => {
    expect(detectDelimiter("email,first name,last name")).toBe(",");
    expect(detectDelimiter("email;first name;last name")).toBe(";");
    expect(detectDelimiter("email\tfirst name\tlast name")).toBe("\t");
    expect(detectDelimiter('"a,b,c,d";email;name')).toBe(";");
    expect(detectDelimiter('"Name; full"\t"Email, work"\tCity')).toBe("\t");
  });

  it("falls back to a comma for a single column and on ties", () => {
    expect(detectDelimiter("email")).toBe(",");
    expect(detectDelimiter("")).toBe(",");
    expect(detectDelimiter("a,b;c")).toBe(",");
    expect(detectDelimiter("a;b\tc")).toBe(";");
  });
});

describe("CsvParser", () => {
  it("parses plain rows", () => {
    expect(parseCsv("email,name\nada@example.com,Ada\n")).toEqual([
      ["email", "name"],
      ["ada@example.com", "Ada"],
    ]);
  });

  it("parses quoted fields with delimiters, quotes and line breaks inside", () => {
    const text =
      'email,name,note\r\n"ada@example.com","Lovelace, Ada","She said ""hello""\r\nand left"\r\n';
    expect(parseCsv(text)).toEqual([
      ["email", "name", "note"],
      ["ada@example.com", "Lovelace, Ada", 'She said "hello"\r\nand left'],
    ]);
  });

  it("accepts CRLF, LF and lone CR line breaks, mixed", () => {
    expect(parseCsv("a,b\r\n1,2\n3,4\r5,6")).toEqual([
      ["a", "b"],
      ["1", "2"],
      ["3", "4"],
      ["5", "6"],
    ]);
  });

  it("gives the same rows with and without a trailing line break", () => {
    const expected = [
      ["a", "b"],
      ["1", "2"],
    ];
    expect(parseCsv("a,b\n1,2")).toEqual(expected);
    expect(parseCsv("a,b\n1,2\n")).toEqual(expected);
    expect(parseCsv("a,b\r\n1,2\r\n")).toEqual(expected);
  });

  it("removes a byte order mark from the first field only", () => {
    expect(parseCsv("﻿email,name\n﻿x,y\n")).toEqual([
      ["email", "name"],
      ["﻿x", "y"],
    ]);
    expect(parseCsv('﻿"email",name\nx,y')).toEqual([
      ["email", "name"],
      ["x", "y"],
    ]);
    expect(parsePieces(["", "﻿", "email;name\n"])).toEqual([["email", "name"]]);
  });

  it("skips blank lines, including leading ones and lines of spaces", () => {
    expect(parseCsv("\n\r\n  \na;b\n\n1;2\n   \n\n3;4\n\n")).toEqual([
      ["a", "b"],
      ["1", "2"],
      ["3", "4"],
    ]);
  });

  it("keeps a line that holds an empty quoted field", () => {
    expect(parseCsv('a\n""\nb')).toEqual([["a"], [""], ["b"]]);
  });

  it("keeps empty cells, including a trailing one", () => {
    expect(parseCsv("a,b,c\n,,\n1,,\n,,3")).toEqual([
      ["a", "b", "c"],
      ["", "", ""],
      ["1", "", ""],
      ["", "", "3"],
    ]);
    expect(parseCsv('a,b\n"",""\n')).toEqual([
      ["a", "b"],
      ["", ""],
    ]);
  });

  it("detects a semicolon delimiter and keeps commas as text", () => {
    expect(
      parseCsv("email;name;city\nada@example.com;Lovelace, Ada;London"),
    ).toEqual([
      ["email", "name", "city"],
      ["ada@example.com", "Lovelace, Ada", "London"],
    ]);
  });

  it("detects a tab delimiter", () => {
    const parser = new CsvParser();
    const rows = [
      ...parser.write(
        "email\tname\nada@example.com\tAda, Countess; of Lovelace\n",
      ),
      ...parser.end(),
    ];
    expect(parser.delimiter).toBe("\t");
    expect(rows).toEqual([
      ["email", "name"],
      ["ada@example.com", "Ada, Countess; of Lovelace"],
    ]);
  });

  it("detects the delimiter from the header even when it spans lines in quotes", () => {
    expect(parseCsv('"first\nline, with, commas";email;x\n1;2;3')).toEqual([
      ["first\nline, with, commas", "email", "x"],
      ["1", "2", "3"],
    ]);
  });

  it("detects the delimiter of a file with only a header and no line break", () => {
    const parser = new CsvParser();
    expect(parser.write("email;name")).toEqual([]);
    expect(parser.delimiter).toBeNull();
    expect(parser.end()).toEqual([["email", "name"]]);
    expect(parser.delimiter).toBe(";");
  });

  it("uses a given delimiter without detecting", () => {
    expect(parseCsv("a;b,c\n1;2,3", ",")).toEqual([
      ["a;b", "c"],
      ["1;2", "3"],
    ]);
  });

  it("returns ragged rows as they are and fitRow shapes them", () => {
    const rows = parseCsv("a,b,c\n1\n1,2,3,4,5\n");
    expect(rows).toEqual([["a", "b", "c"], ["1"], ["1", "2", "3", "4", "5"]]);
    expect(fitRow(rows[1] ?? [], 3)).toEqual(["1", "", ""]);
    expect(fitRow(rows[2] ?? [], 3)).toEqual(["1", "2", "3"]);
    expect(fitRow(rows[0] ?? [], 3)).toBe(rows[0]);
  });

  it("treats a quote inside an unquoted field as text", () => {
    expect(parseCsv('size,name\n5" pipe,ab"c"d\n')).toEqual([
      ["size", "name"],
      ['5" pipe', 'ab"c"d'],
    ]);
  });

  it("keeps text that follows a closing quote", () => {
    expect(parseCsv('a,b\n"x"y,"p" \n')).toEqual([
      ["a", "b"],
      ["xy", "p "],
    ]);
  });

  it("emits what it has when a quote is never closed", () => {
    expect(parseCsv('a,b\n1,"open\nstill open')).toEqual([
      ["a", "b"],
      ["1", "open\nstill open"],
    ]);
  });

  it("returns nothing for empty input", () => {
    expect(parseCsv("")).toEqual([]);
    expect(parseCsv("\n\n\r\n")).toEqual([]);
    expect(parseCsv("﻿")).toEqual([]);
    expect(parsePieces([])).toEqual([]);
  });

  it("emits rows as soon as they are complete", () => {
    const parser = new CsvParser();
    expect(parser.write("a,b\n1,")).toEqual([["a", "b"]]);
    expect(parser.write('"x')).toEqual([]);
    expect(parser.write('\ny"\n3')).toEqual([["1", "x\ny"]]);
    expect(parser.write(",4")).toEqual([]);
    expect(parser.end()).toEqual([["3", "4"]]);
    expect(parser.end()).toEqual([]);
    expect(() => parser.write("more")).toThrow();
  });

  describe("input split across pieces", () => {
    const cases: [string, string, string[][]][] = [
      [
        "a quoted field with a delimiter",
        'a,b\n"x,y",z\n',
        [
          ["a", "b"],
          ["x,y", "z"],
        ],
      ],
      [
        "an escaped quote",
        'a,b\n"say ""hi""",z\n',
        [
          ["a", "b"],
          ['say "hi"', "z"],
        ],
      ],
      [
        "an escaped quote at the end of a field",
        'a,b\n"x""","""y"\n',
        [
          ["a", "b"],
          ['x"', '"y'],
        ],
      ],
      [
        "a line break inside quotes",
        'a,b\r\n"one\r\ntwo",z\r\n',
        [
          ["a", "b"],
          ["one\r\ntwo", "z"],
        ],
      ],
      [
        "CRLF line endings",
        "a,b\r\n1,2\r\n3,4\r\n",
        [
          ["a", "b"],
          ["1", "2"],
          ["3", "4"],
        ],
      ],
      [
        "lone CR line endings",
        "a,b\r1,2\r3,4",
        [
          ["a", "b"],
          ["1", "2"],
          ["3", "4"],
        ],
      ],
      [
        "a byte order mark and a semicolon delimiter",
        '﻿a;b\n"x;y";2\n',
        [
          ["a", "b"],
          ["x;y", "2"],
        ],
      ],
      [
        "blank lines",
        "\r\n\na\tb\r\n\r\n1\t2\n\n",
        [
          ["a", "b"],
          ["1", "2"],
        ],
      ],
      [
        "empty quoted fields",
        'a,b\n"",""\n"",x',
        [
          ["a", "b"],
          ["", ""],
          ["", "x"],
        ],
      ],
      [
        "empty trailing cells",
        "a,b,c\n1,,\n,,",
        [
          ["a", "b", "c"],
          ["1", "", ""],
          ["", "", ""],
        ],
      ],
      [
        "a quoted header that holds a line break",
        '"h\n1";"h,2"\n"v;1";v2',
        [
          ["h\n1", "h,2"],
          ["v;1", "v2"],
        ],
      ],
      [
        "a surrogate pair",
        'a,b\n😀,"x😀"\n',
        [
          ["a", "b"],
          ["😀", "x😀"],
        ],
      ],
    ];

    it.each(cases)("%s: every two-way split", (_name, text, expected) => {
      expect(parseCsv(text)).toEqual(expected);
      for (const pieces of everyTwoWaySplit(text)) {
        expect(parsePieces(pieces), JSON.stringify(pieces)).toEqual(expected);
      }
    });

    it.each(cases)("%s: every three-way split", (_name, text, expected) => {
      for (const pieces of everyThreeWaySplit(text)) {
        expect(parsePieces(pieces), JSON.stringify(pieces)).toEqual(expected);
      }
    });

    it.each(cases)("%s: one character at a time", (_name, text, expected) => {
      expect(parsePieces([...piecesOf(text, 1)])).toEqual(expected);
    });

    it("gives the same rows for any piece size on a larger file", () => {
      const lines = ["email;name;note"];
      for (let index = 0; index < 300; index += 1) {
        lines.push(
          index % 3 === 0
            ? `person${index}@example.com;"Name ""${index}""; Esq.";"line one\r\nline two"`
            : `person${index}@example.com;Name ${index};`,
        );
        if (index % 50 === 0) {
          lines.push("");
        }
      }
      const text = `﻿${lines.join("\r\n")}\r\n`;
      const whole = parseCsv(text);
      expect(whole).toHaveLength(301);
      expect(whole[1]).toEqual([
        "person0@example.com",
        'Name "0"; Esq.',
        "line one\r\nline two",
      ]);
      expect(whole[2]).toEqual(["person1@example.com", "Name 1", ""]);
      for (const size of [1, 2, 3, 5, 7, 13, 64, 257, 1024, 4096]) {
        expect(parsePieces(piecesOf(text, size))).toEqual(whole);
      }
    });
  });
});

describe("encodeCsvRow", () => {
  it("quotes only the cells that need it", () => {
    expect(encodeCsvCell("plain")).toBe("plain");
    expect(encodeCsvCell("")).toBe("");
    expect(encodeCsvCell("a,b")).toBe('"a,b"');
    expect(encodeCsvCell('say "hi"')).toBe('"say ""hi"""');
    expect(encodeCsvCell("two\nlines")).toBe('"two\nlines"');
    expect(encodeCsvCell(" padded ")).toBe('" padded "');
    expect(encodeCsvRow(["x", "a;b", "c,d"])).toBe('x,a;b,"c,d"');
  });

  it("round-trips through the parser", () => {
    const rows = [
      ["error", "email", "note"],
      ['Not "valid"', "a@b", "x,y\r\nz"],
      ["", " lead", "trail "],
      ["last", "", ""],
    ];
    const text = `${rows.map(encodeCsvRow).join("\r\n")}\r\n`;
    expect(parseCsv(text, ",")).toEqual(rows);
  });
});

describe("isEmptyRow", () => {
  it("is true when every cell is blank", () => {
    expect(isEmptyRow(["", "  ", "\t"])).toBe(true);
    expect(isEmptyRow([])).toBe(true);
    expect(isEmptyRow(["", "x"])).toBe(false);
  });
});
