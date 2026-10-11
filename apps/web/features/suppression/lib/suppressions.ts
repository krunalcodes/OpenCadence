import { isRow, type Row, rowsOf, textOrNull } from "@/lib/api";

export type SuppressionReason =
  | "unsubscribed"
  | "bounced"
  | "complained"
  | "manual";

export type SuppressionOrigin = "user" | "api" | "webhook" | "import";

export type AddReason = "manual" | "unsubscribed";

export type Suppression = {
  id: string;
  email: string;
  reason: SuppressionReason;
  origin: SuppressionOrigin;
  sourceId: string | null;
  note: string | null;
  createdAt: string;
};

export type SuppressionsPage = {
  suppressions: Suppression[];
  nextCursor: string | null;
};

export type SuppressionsResult =
  | ({ state: "ready" } & SuppressionsPage)
  | { state: "failed" };

export type SuppressionFilters = {
  reason: SuppressionReason | null;
  search: string;
};

export type AddResult = { added: number; existing: number };

export const suppressionPageSize = 50;
export const maxAddresses = 1000;
export const maxNoteLength = 500;
export const maxSearchLength = 254;

export const suppressionReasons: SuppressionReason[] = [
  "bounced",
  "complained",
  "unsubscribed",
  "manual",
];

const origins: SuppressionOrigin[] = ["user", "api", "webhook", "import"];

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function isEmail(value: string) {
  return value.length <= 254 && emailPattern.test(value);
}

export function normalizeEmail(value: string) {
  return value
    .trim()
    .replace(/^[<"']+|[>"']+$/g, "")
    .toLowerCase();
}

function toSuppression(value: Row): Suppression | null {
  const id = textOrNull(value.id);
  const email = textOrNull(value.email);
  if (!id || !email) {
    return null;
  }
  return {
    id,
    email,
    reason:
      suppressionReasons.find((reason) => reason === value.reason) ?? "manual",
    origin: origins.find((origin) => origin === value.origin) ?? "user",
    sourceId: textOrNull(value.sourceId),
    note: textOrNull(value.note),
    createdAt: textOrNull(value.createdAt) ?? "",
  };
}

export function toSuppressionsPage(value: unknown): SuppressionsPage | null {
  if (!isRow(value) || !Array.isArray(value.suppressions)) {
    return null;
  }
  return {
    suppressions: rowsOf(value.suppressions).flatMap((item) => {
      const suppression = toSuppression(item);
      return suppression ? [suppression] : [];
    }),
    nextCursor: textOrNull(value.nextCursor),
  };
}

export function toAddResult(value: unknown): AddResult | null {
  if (
    !isRow(value) ||
    typeof value.added !== "number" ||
    typeof value.existing !== "number"
  ) {
    return null;
  }
  return { added: value.added, existing: value.existing };
}

export function filtersSearch(filters: SuppressionFilters) {
  const params = new URLSearchParams();
  if (filters.reason) {
    params.set("reason", filters.reason);
  }
  if (filters.search !== "") {
    params.set("search", filters.search);
  }
  return params.toString();
}

export function suppressionsQuery(
  filters: SuppressionFilters,
  cursor?: string | null,
) {
  const params = new URLSearchParams(filtersSearch(filters));
  if (cursor) {
    params.set("cursor", cursor);
  }
  params.set("limit", String(suppressionPageSize));
  return params.toString();
}

export function toReasonFilter(value: string | null): SuppressionReason | null {
  return suppressionReasons.find((reason) => reason === value) ?? null;
}

export function toSearchFilter(value: string | null) {
  return (value ?? "").trim().slice(0, maxSearchLength);
}
