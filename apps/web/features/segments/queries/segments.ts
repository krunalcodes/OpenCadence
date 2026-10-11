import "server-only";

import {
  type SegmentsResult,
  toFieldOptions,
  toListOptions,
  toSegments,
  toTagOptions,
} from "@/features/segments/lib/segments";
import { apiRequest } from "@/lib/api-server";

async function load<T>(path: string, parse: (data: unknown) => T | null) {
  const { status, data } = await apiRequest(path);
  return status === 200 ? parse(data) : null;
}

export async function getSegmentsPage(): Promise<SegmentsResult> {
  const [segments, lists, tags, fields] = await Promise.all([
    load("/segments", toSegments),
    load("/lists", toListOptions),
    load("/tags", toTagOptions),
    load("/contact-fields", toFieldOptions),
  ]);
  if (!segments || !lists || !tags || !fields) {
    return { state: "failed" };
  }
  return { state: "ready", segments, lists, tags, fields };
}
