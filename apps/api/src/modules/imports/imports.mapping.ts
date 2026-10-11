import { fitRow } from "./csv-parser";

export const standardTargets = [
  "email",
  "firstName",
  "lastName",
  "company",
  "jobTitle",
  "phone",
  "city",
  "country",
  "timezone",
] as const;

export type StandardTarget = (typeof standardTargets)[number];

export type ImportContact = { email: string } & Partial<
  Record<Exclude<StandardTarget, "email">, string>
> & { fields?: Record<string, string> };

export type MappingPlan = { index: number; target: string }[];

export type MappingResult =
  | { ok: true; mapping: Record<string, string>; customKeys: string[] }
  | { ok: false; message: string };

const customPrefix = "custom:";

function isStandardTarget(value: string): value is StandardTarget {
  return (standardTargets as readonly string[]).includes(value);
}

export function customKeyOf(target: string): string | null {
  return target.startsWith(customPrefix)
    ? target.slice(customPrefix.length)
    : null;
}

export function headerColumns(header: string[]): string[] {
  const used = new Set<string>();
  return header.map((cell, index) => {
    const base = cell.trim() || `Column ${index + 1}`;
    let name = base;
    for (let copy = 2; used.has(name); copy += 1) {
      name = `${base} (${copy})`;
    }
    used.add(name);
    return name;
  });
}

export function validateMapping(
  input: unknown,
  columns: string[],
): MappingResult {
  if (typeof input !== "object" || input === null || Array.isArray(input)) {
    return {
      ok: false,
      message: "mapping must be an object of column names and targets.",
    };
  }
  const entries = Object.entries(input as Record<string, unknown>);
  const known = new Set(columns);
  const taken = new Map<string, string>();
  const customKeys: string[] = [];
  for (const [column, target] of entries) {
    if (!known.has(column)) {
      return {
        ok: false,
        message: `"${column.slice(0, 100)}" is not a column in this file.`,
      };
    }
    if (typeof target !== "string") {
      return {
        ok: false,
        message: `Choose a field for the column "${column}".`,
      };
    }
    if (target === "skip") {
      continue;
    }
    const customKey = customKeyOf(target);
    if (customKey === null && !isStandardTarget(target)) {
      return {
        ok: false,
        message: `"${target.slice(0, 100)}" is not a field a column can be mapped to.`,
      };
    }
    if (customKey === "") {
      return {
        ok: false,
        message: `Choose a custom field for the column "${column}".`,
      };
    }
    const other = taken.get(target);
    if (other !== undefined) {
      return {
        ok: false,
        message: `The columns "${other}" and "${column}" are both mapped to ${target}. Map one of them to something else.`,
      };
    }
    taken.set(target, column);
    if (customKey !== null) {
      customKeys.push(customKey);
    }
  }
  if (!taken.has("email")) {
    return { ok: false, message: "Map one column to email." };
  }
  const given = input as Record<string, string>;
  const mapping: Record<string, string> = {};
  for (const column of columns) {
    mapping[column] = Object.hasOwn(given, column)
      ? (given[column] as string)
      : "skip";
  }
  return { ok: true, mapping, customKeys };
}

export function mappingPlan(
  columns: string[],
  mapping: Record<string, string>,
): MappingPlan {
  const plan: MappingPlan = [];
  columns.forEach((column, index) => {
    const target = Object.hasOwn(mapping, column) ? mapping[column] : "skip";
    if (target && target !== "skip") {
      plan.push({ index, target });
    }
  });
  return plan;
}

export function toContact(
  plan: MappingPlan,
  cells: string[],
): ImportContact | null {
  const contact: Record<string, unknown> = {};
  let fields: Record<string, string> | undefined;
  for (const { index, target } of plan) {
    const value = (cells[index] ?? "").trim();
    if (value === "") {
      continue;
    }
    const customKey = customKeyOf(target);
    if (customKey === null) {
      contact[target] = value;
    } else {
      fields ??= {};
      fields[customKey] = value;
    }
  }
  if (typeof contact.email !== "string") {
    return null;
  }
  if (fields) {
    contact.fields = fields;
  }
  return contact as ImportContact;
}

export function errorReportHeader(columns: string[]): string[] {
  return ["error", ...columns];
}

export function errorReportRow(
  message: string,
  cells: string[],
  width: number,
): string[] {
  return [message, ...fitRow(cells, width)];
}
