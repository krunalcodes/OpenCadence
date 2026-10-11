export const formField = "_form";
export const embedField = "_embed";
export const formIdPrefix = "form";
export const doneAnchor = `${formIdPrefix}-done`;
export const problemAnchor = `${formIdPrefix}-problem`;

type FormQuery = {
  submitted?: string;
  error?: string;
  field?: string;
};

export function hostedFormPath(
  publicId: string,
  embed: boolean,
  query: FormQuery,
) {
  const params = new URLSearchParams();
  if (embed) {
    params.set("embed", "1");
  }
  for (const [key, value] of Object.entries(query)) {
    if (value) {
      params.set(key, value);
    }
  }
  const search = params.toString();
  const anchor = query.submitted
    ? `#${doneAnchor}`
    : query.error
      ? `#${problemAnchor}`
      : "";
  return `/f/${publicId}${search ? `?${search}` : ""}${anchor}`;
}

export function confirmPath(
  token: string,
  query: { done?: string; failed?: string },
) {
  const params = new URLSearchParams(
    Object.entries(query).filter(([, value]) => Boolean(value)),
  );
  const search = params.toString();
  return `/f/confirm/${token}${search ? `?${search}` : ""}`;
}
