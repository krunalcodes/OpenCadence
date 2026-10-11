import {
  emptyFilterGroup,
  toFilterGroup,
} from "@/components/filter-builder/filter";
import type {
  CustomFieldType,
  FilterField,
  FilterGroup,
  FilterOption,
} from "@/components/filter-builder/types";
import { countOf, isRow, rowsOf, textOrNull, textsOf } from "@/lib/api";

export type Segment = {
  id: string;
  name: string;
  description: string | null;
  rules: FilterGroup;
  createdAt: string;
  updatedAt: string;
};

export type SegmentOptions = {
  fields: FilterField[];
  lists: FilterOption[];
  tags: FilterOption[];
};

export type SegmentsResult =
  | ({ state: "ready"; segments: Segment[] } & SegmentOptions)
  | { state: "failed" };

export type SegmentInput = {
  name: string;
  description: string;
  rules: FilterGroup;
};

export type PreviewContact = { id: string; email: string; name: string | null };

export type SegmentPreview = { count: number; sample: PreviewContact[] };

export type SegmentCount =
  | { state: "loading" }
  | { state: "ready"; count: number }
  | { state: "invalid"; message: string | null }
  | { state: "failed" };

export const maxCountRequests = 4;
export const previewDelay = 500;
export const previewSampleSize = 5;

const fieldTypes: CustomFieldType[] = [
  "text",
  "number",
  "date",
  "boolean",
  "select",
];

export function toSegment(value: unknown): Segment | null {
  if (!isRow(value)) {
    return null;
  }
  const id = textOrNull(value.id);
  const name = textOrNull(value.name);
  if (!id || !name) {
    return null;
  }
  return {
    id,
    name,
    description: textOrNull(value.description),
    rules: toFilterGroup(value.rules) ?? emptyFilterGroup(),
    createdAt: textOrNull(value.createdAt) ?? "",
    updatedAt: textOrNull(value.updatedAt) ?? "",
  };
}

export function toSegments(value: unknown): Segment[] | null {
  if (!isRow(value) || !Array.isArray(value.segments)) {
    return null;
  }
  return rowsOf(value.segments).flatMap((item) => {
    const segment = toSegment(item);
    return segment ? [segment] : [];
  });
}

function toOptions(value: unknown): FilterOption[] | null {
  if (!Array.isArray(value)) {
    return null;
  }
  return rowsOf(value).flatMap((item) => {
    const id = textOrNull(item.id);
    const name = textOrNull(item.name);
    return id && name ? [{ id, name }] : [];
  });
}

export function toListOptions(value: unknown) {
  return isRow(value) ? toOptions(value.lists) : null;
}

export function toTagOptions(value: unknown) {
  return isRow(value) ? toOptions(value.tags) : null;
}

export function toFieldOptions(value: unknown): FilterField[] | null {
  if (!isRow(value) || !Array.isArray(value.fields)) {
    return null;
  }
  return rowsOf(value.fields).flatMap((item) => {
    const key = textOrNull(item.key);
    const type = fieldTypes.find((candidate) => candidate === item.type);
    if (!key || !type) {
      return [];
    }
    return [
      {
        key,
        label: textOrNull(item.label) ?? key,
        type,
        options: type === "select" ? textsOf(item.options) : null,
      },
    ];
  });
}

export function toCount(value: unknown): number | null {
  return isRow(value) && typeof value.count === "number"
    ? countOf(value.count)
    : null;
}

export function toPreview(value: unknown): SegmentPreview | null {
  if (
    !isRow(value) ||
    typeof value.count !== "number" ||
    !Array.isArray(value.sample)
  ) {
    return null;
  }
  return {
    count: countOf(value.count),
    sample: rowsOf(value.sample)
      .flatMap((item) => {
        const id = textOrNull(item.id);
        const email = textOrNull(item.email);
        if (!id || !email) {
          return [];
        }
        const name = [textOrNull(item.firstName), textOrNull(item.lastName)]
          .filter(Boolean)
          .join(" ");
        return [{ id, email, name: name === "" ? null : name }];
      })
      .slice(0, previewSampleSize),
  };
}

export function segmentContactsSearch(id: string) {
  return new URLSearchParams({ segmentId: id }).toString();
}

export function countKey(segment: Segment) {
  return `${segment.id}:${segment.updatedAt}`;
}
