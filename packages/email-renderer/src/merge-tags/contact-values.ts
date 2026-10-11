export type ContactMergeInput = {
  contact: {
    email: string;
    firstName?: string | null;
    lastName?: string | null;
    company?: string | null;
    jobTitle?: string | null;
    phone?: string | null;
    city?: string | null;
    country?: string | null;
    fields?: Record<string, string | number | boolean | null>;
  };
  brand: { name: string; address: string | null; website: string | null };
};

const fieldKeyPattern = /^[a-z][a-z0-9_]*$/;

export function contactMergeValues(
  input: ContactMergeInput,
): Record<string, string> {
  const values: Record<string, string> = {};
  const set = (
    key: string,
    value: string | number | boolean | null | undefined,
  ) => {
    if (value === null || value === undefined) {
      return;
    }
    const text = String(value).trim();
    if (text !== "") {
      values[key] = text;
    }
  };

  const { contact, brand } = input;
  set("email", contact.email);
  set("first_name", contact.firstName);
  set("last_name", contact.lastName);
  set("company", contact.company);
  set("job_title", contact.jobTitle);
  set("phone", contact.phone);
  set("city", contact.city);
  set("country", contact.country);
  for (const [key, value] of Object.entries(contact.fields ?? {})) {
    if (fieldKeyPattern.test(key)) {
      set(`fields.${key}`, value);
    }
  }
  set("brand.name", brand.name);
  set("brand.address", brand.address);
  set("brand.website", brand.website);
  return values;
}
