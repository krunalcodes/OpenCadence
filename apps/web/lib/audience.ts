import {
  type ApiResult,
  countOf,
  isRow,
  malformed,
  request,
  rowsOf,
  textOrNull,
  textsOf,
} from "@/lib/api";

export type AudienceType = "all" | "lists" | "segment";

export type Audience =
  | { type: "all" }
  | { type: "lists"; listIds: string[] }
  | { type: "segment"; segmentId: string };

export type AudienceSelection = {
  type: AudienceType;
  listIds: string[];
  segmentId: string | null;
};

export type AudienceList = {
  id: string;
  name: string;
  subscribedCount: number;
};

export type AudienceSegment = { id: string; name: string };

export const audienceTypes: AudienceType[] = ["all", "lists", "segment"];

export const maxAudienceLists = 50;

export const emptyAudienceSelection: AudienceSelection = {
  type: "all",
  listIds: [],
  segmentId: null,
};

export function toAudience(selection: AudienceSelection): Audience | null {
  if (selection.type === "all") {
    return { type: "all" };
  }
  if (selection.type === "lists") {
    return selection.listIds.length > 0
      ? { type: "lists", listIds: selection.listIds }
      : null;
  }
  return selection.segmentId
    ? { type: "segment", segmentId: selection.segmentId }
    : null;
}

export function toAudienceSelection(value: unknown): AudienceSelection {
  if (!isRow(value)) {
    return emptyAudienceSelection;
  }
  return {
    type: audienceTypes.find((type) => type === value.type) ?? "all",
    listIds: textsOf(value.listIds),
    segmentId: textOrNull(value.segmentId),
  };
}

export function audienceKey(audience: Audience) {
  if (audience.type === "lists") {
    return `lists:${[...audience.listIds].sort().join(",")}`;
  }
  return audience.type === "segment" ? `segment:${audience.segmentId}` : "all";
}

export function toAudienceLists(value: unknown): AudienceList[] {
  if (!isRow(value)) {
    return [];
  }
  return rowsOf(value.lists).flatMap((item) => {
    const id = textOrNull(item.id);
    const name = textOrNull(item.name);
    return id && name
      ? [{ id, name, subscribedCount: countOf(item.subscribedCount) }]
      : [];
  });
}

export function toAudienceSegments(value: unknown): AudienceSegment[] {
  if (!isRow(value)) {
    return [];
  }
  return rowsOf(value.segments).flatMap((item) => {
    const id = textOrNull(item.id);
    const name = textOrNull(item.name);
    return id && name ? [{ id, name }] : [];
  });
}

export async function fetchAudienceCount(
  audience: Audience,
): Promise<ApiResult<number>> {
  const result = await request("POST", "/audiences/count", { audience });
  if (!result.ok) {
    return result;
  }
  return isRow(result.data) && typeof result.data.count === "number"
    ? { ok: true, data: countOf(result.data.count) }
    : { ok: false, error: malformed };
}
