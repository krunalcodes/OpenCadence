export const builtInTargets = [
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

export type BuiltInTarget = (typeof builtInTargets)[number];

export const emailTarget: BuiltInTarget = "email";

export const skipTarget = "skip";

export type MappingProblem = "missing_email" | "repeated_target";

export function customTarget(key: string) {
  return `custom:${key}`;
}

export function repeatedColumns(columns: string[]) {
  const seen = new Set<string>();
  return columns.map((column) => {
    const repeated = seen.has(column);
    seen.add(column);
    return repeated;
  });
}

export function usedTargets(targets: string[]) {
  return new Set(targets.filter((target) => target !== skipTarget));
}

export function mappingProblem(targets: string[]): MappingProblem | null {
  const used = targets.filter((target) => target !== skipTarget);
  if (new Set(used).size !== used.length) {
    return "repeated_target";
  }
  return used.includes(emailTarget) ? null : "missing_email";
}

export function matchedCount(targets: string[]) {
  return usedTargets(targets).size;
}

export function skippedIndexes(targets: string[]) {
  return targets.flatMap((target, index) =>
    target === skipTarget ? [index] : [],
  );
}

export function toMappingPayload(columns: string[], targets: string[]) {
  const repeated = repeatedColumns(columns);
  const mapping: Record<string, string> = {};
  columns.forEach((column, index) => {
    if (!repeated[index]) {
      mapping[column] = targets[index] ?? skipTarget;
    }
  });
  return mapping;
}

export function restoreTargets(
  columns: string[],
  mapping: Record<string, string>,
  allowed: Set<string>,
) {
  const repeated = repeatedColumns(columns);
  const used = new Set<string>();
  return columns.map((column, index) => {
    const target = mapping[column];
    if (
      repeated[index] ||
      !target ||
      !allowed.has(target) ||
      used.has(target)
    ) {
      return skipTarget;
    }
    used.add(target);
    return target;
  });
}

export function sampleValues(rows: string[][], index: number, limit = 3) {
  const values: string[] = [];
  for (const row of rows) {
    const value = (row[index] ?? "").trim();
    if (value !== "") {
      values.push(value);
    }
    if (values.length === limit) {
      break;
    }
  }
  return values;
}
