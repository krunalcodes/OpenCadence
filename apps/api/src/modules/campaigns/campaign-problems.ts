import { contactMergeKeys, findMergeTags } from "@workspace/email-renderer";

export type CampaignProblemField =
  | "template"
  | "subject"
  | "audience"
  | "source"
  | "from"
  | "brand"
  | "schedule";

export type CampaignProblem = {
  severity: "error" | "warning";
  field: CampaignProblemField;
  code: string;
  message: string;
};

export const unsubscribeKey = "unsubscribe_url";
export const preferencesKey = "preferences_url";
export const brandMergeKeys = ["brand.name", "brand.address", "brand.website"];

const namedTags = 5;

export function knownMergeKeys(fieldKeys: string[]) {
  return new Set([
    ...contactMergeKeys,
    ...brandMergeKeys,
    unsubscribeKey,
    preferencesKey,
    ...fieldKeys.map((key) => `fields.${key}`),
  ]);
}

export function unknownMergeTags(inputs: string[], known: Set<string>) {
  const unknown = new Set<string>();
  for (const input of inputs) {
    for (const tag of findMergeTags(input)) {
      if (!known.has(tag.key)) {
        unknown.add(tag.key);
      }
    }
  }
  return [...unknown].sort();
}

export function hasUnsubscribeTag(html: string) {
  return findMergeTags(html).some((tag) => tag.key === unsubscribeKey);
}

function tagList(keys: string[]) {
  const named = keys
    .slice(0, namedTags)
    .map((key) => `{{${key}}}`)
    .join(", ");
  const rest = keys.length - namedTags;
  return rest > 0 ? `${named} and ${rest} more` : named;
}

export function mergeTagProblems(input: {
  subject: string;
  previewText: string;
  html: string;
  text: string;
  fieldKeys: string[];
}): CampaignProblem[] {
  const known = knownMergeKeys(input.fieldKeys);
  const problems: CampaignProblem[] = [];
  const inSubject = unknownMergeTags([input.subject, input.previewText], known);
  if (inSubject.length > 0) {
    problems.push({
      severity: "error",
      field: "subject",
      code: "unknown_merge_tag",
      message: `The subject or preview text uses merge tags that do not exist: ${tagList(inSubject)}. Remove them or add the matching custom fields.`,
    });
  }
  const inBody = unknownMergeTags([input.html, input.text], known);
  if (inBody.length > 0) {
    problems.push({
      severity: "error",
      field: "template",
      code: "unknown_merge_tag",
      message: `The template uses merge tags that do not exist: ${tagList(inBody)}. Remove them or add the matching custom fields.`,
    });
  }
  return problems;
}
