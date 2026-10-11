const named: Record<string, string> = {
  amp: "&",
  AMP: "&",
  lt: "<",
  LT: "<",
  gt: ">",
  GT: ">",
  quot: '"',
  QUOT: '"',
  apos: "'",
  nbsp: " ",
};

const numericPattern = /&#(?:[xX]([0-9a-fA-F]{1,6})|([0-9]{1,7}));/y;
const namedPattern = /&([a-zA-Z][a-zA-Z0-9]*)(;?)/y;

function codePoint(hex: string | undefined, decimal: string | undefined) {
  const code =
    hex !== undefined
      ? Number.parseInt(hex, 16)
      : Number.parseInt(decimal ?? "", 10);
  if (
    !Number.isInteger(code) ||
    code <= 0 ||
    code > 0x10ffff ||
    (code >= 0xd800 && code <= 0xdfff) ||
    (code >= 0x80 && code <= 0x9f)
  ) {
    return null;
  }
  return String.fromCodePoint(code);
}

function decode(raw: string, strict: boolean): string | null {
  if (!raw.includes("&")) {
    return raw;
  }
  let output = "";
  let position = 0;
  while (true) {
    const index = raw.indexOf("&", position);
    if (index === -1) {
      break;
    }
    output += raw.slice(position, index);

    numericPattern.lastIndex = index;
    const numeric = numericPattern.exec(raw);
    if (numeric) {
      const character = codePoint(numeric[1], numeric[2]);
      if (character === null) {
        if (strict) {
          return null;
        }
        output += numeric[0];
      } else {
        output += character;
      }
      position = numericPattern.lastIndex;
      continue;
    }

    namedPattern.lastIndex = index;
    const name = namedPattern.exec(raw);
    if (name) {
      const end = namedPattern.lastIndex;
      const known = name[1] !== undefined ? named[name[1]] : undefined;
      if (
        name[2] === ";" &&
        known !== undefined &&
        Object.hasOwn(named, name[1] ?? "")
      ) {
        output += known;
      } else if (name[2] === "" && raw.charAt(end) === "=") {
        output += name[0];
      } else if (strict) {
        return null;
      } else {
        output += name[0];
      }
      position = end;
      continue;
    }

    if (strict && raw.charAt(index + 1) === "#") {
      return null;
    }
    output += "&";
    position = index + 1;
  }
  return output + raw.slice(position);
}

export function decodeAttributeValue(raw: string): string | null {
  return decode(raw, true);
}

export function decodeText(raw: string): string {
  return decode(raw, false) ?? raw;
}
