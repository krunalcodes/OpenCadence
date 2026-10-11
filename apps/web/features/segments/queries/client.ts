import type { FilterGroup } from "@/components/filter-builder/types";
import {
  type Segment,
  type SegmentInput,
  type SegmentPreview,
  toCount,
  toPreview,
  toSegment,
} from "@/features/segments/lib/segments";
import { type ApiResult, malformed, request } from "@/lib/api";

function toResult(result: ApiResult<unknown>): ApiResult<Segment> {
  if (!result.ok) {
    return result;
  }
  const segment = toSegment(result.data);
  return segment
    ? { ok: true, data: segment }
    : { ok: false, error: malformed };
}

export async function createSegment(input: SegmentInput) {
  return toResult(
    await request("POST", "/segments", {
      name: input.name,
      ...(input.description === "" ? {} : { description: input.description }),
      rules: input.rules,
    }),
  );
}

export async function updateSegment(id: string, input: SegmentInput) {
  return toResult(
    await request("PATCH", `/segments/${encodeURIComponent(id)}`, {
      name: input.name,
      description: input.description === "" ? null : input.description,
      rules: input.rules,
    }),
  );
}

export async function deleteSegment(id: string) {
  return request("DELETE", `/segments/${encodeURIComponent(id)}`);
}

export async function fetchSegmentCount(
  id: string,
): Promise<ApiResult<number>> {
  const result = await request(
    "GET",
    `/segments/${encodeURIComponent(id)}/count`,
  );
  if (!result.ok) {
    return result;
  }
  const count = toCount(result.data);
  return count === null
    ? { ok: false, error: malformed }
    : { ok: true, data: count };
}

export async function previewSegment(
  rules: FilterGroup,
): Promise<ApiResult<SegmentPreview>> {
  const result = await request("POST", "/segments/preview", { rules });
  if (!result.ok) {
    return result;
  }
  const preview = toPreview(result.data);
  return preview
    ? { ok: true, data: preview }
    : { ok: false, error: malformed };
}
