import type { FieldOption, Import } from "@/features/imports/lib/imports";
import {
  type BuiltInTarget,
  builtInTargets,
  customTarget,
  repeatedColumns,
  restoreTargets,
  skipTarget,
} from "@/features/imports/lib/mapping";

const headings: Record<BuiltInTarget, string[]> = {
  email: [
    "email",
    "emailaddress",
    "emailid",
    "mail",
    "contactemail",
    "workemail",
    "primaryemail",
  ],
  firstName: ["firstname", "fname", "first", "givenname", "forename"],
  lastName: ["lastname", "lname", "last", "surname", "familyname"],
  company: [
    "company",
    "companyname",
    "organisation",
    "organization",
    "org",
    "employer",
    "business",
    "account",
  ],
  jobTitle: ["jobtitle", "title", "position", "role", "job"],
  phone: [
    "phone",
    "phonenumber",
    "mobile",
    "mobilephone",
    "mobilenumber",
    "cell",
    "cellphone",
    "telephone",
    "tel",
  ],
  city: ["city", "town"],
  country: ["country", "countryname"],
  timezone: ["timezone", "tz"],
};

export function normalizeHeading(value: string) {
  return value.toLowerCase().replace(/[\s\-_]+/g, "");
}

function matchHeading(heading: string, fields: FieldOption[]) {
  const builtIn = builtInTargets.find((target) =>
    headings[target].includes(heading),
  );
  if (builtIn) {
    return builtIn;
  }
  const field = fields.find(
    (item) =>
      normalizeHeading(item.label) === heading ||
      normalizeHeading(item.key) === heading,
  );
  return field ? customTarget(field.key) : skipTarget;
}

export function suggestTargets(columns: string[], fields: FieldOption[]) {
  const repeated = repeatedColumns(columns);
  const used = new Set<string>();
  return columns.map((column, index) => {
    const heading = normalizeHeading(column);
    if (repeated[index] || heading === "") {
      return skipTarget;
    }
    const target = matchHeading(heading, fields);
    if (target === skipTarget || used.has(target)) {
      return skipTarget;
    }
    used.add(target);
    return target;
  });
}

export function allowedTargets(fields: FieldOption[]) {
  return new Set<string>([
    ...builtInTargets,
    ...fields.map((field) => customTarget(field.key)),
  ]);
}

export function startingTargets(item: Import, fields: FieldOption[]) {
  return item.mapping
    ? restoreTargets(item.columns, item.mapping, allowedTargets(fields))
    : suggestTargets(item.columns, fields);
}
