export type MergeTag = {
  raw: string;
  key: string;
  fallback: string | null;
  start: number;
  end: number;
};

export type MergeValues = Record<
  string,
  string | number | boolean | null | undefined
>;

export const contactMergeKeys: readonly string[] = [
  "email",
  "first_name",
  "last_name",
  "company",
  "job_title",
  "phone",
  "city",
  "country",
];

const tagPattern =
  /\{\{\s*([a-z][a-z0-9_]*(?:\.[a-z][a-z0-9_]*)?)\s*(?:\|([^{}]*))?\}\}/g;

const htmlEntities: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
};

export function escapeHtml(value: string) {
  return value.replace(
    /[&<>"']/g,
    (character) => htmlEntities[character] ?? character,
  );
}

export function findMergeTags(input: string): MergeTag[] {
  const tags: MergeTag[] = [];
  for (const match of input.matchAll(tagPattern)) {
    const key = match[1];
    if (key === undefined) {
      continue;
    }
    const fallback = match[2]?.trim();
    tags.push({
      raw: match[0],
      key,
      fallback: fallback ? fallback : null,
      start: match.index,
      end: match.index + match[0].length,
    });
  }
  return tags;
}

export function mergeTagValue(tag: MergeTag, values: MergeValues): string {
  const value = Object.hasOwn(values, tag.key) ? values[tag.key] : undefined;
  const text =
    value === null || value === undefined ? "" : String(value).trim();
  return text === "" ? (tag.fallback ?? "") : text;
}

export function renderMergeTags(
  input: string,
  values: MergeValues,
  options: { escape?: "html" | "none" } = {},
): string {
  const escapeValue =
    options.escape === "html" ? escapeHtml : (value: string) => value;
  let output = "";
  let position = 0;
  for (const tag of findMergeTags(input)) {
    output += input.slice(position, tag.start);
    output += escapeValue(mergeTagValue(tag, values));
    position = tag.end;
  }
  return output + input.slice(position);
}
