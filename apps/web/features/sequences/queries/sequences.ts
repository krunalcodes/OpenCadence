import "server-only";

import {
  type Sequence,
  type SequenceFilters,
  type SequencesResult,
  sequencePath,
  sequencesQuery,
  toSequence,
  toSequencesPage,
} from "@/features/sequences/lib/sequences";
import { apiRequest } from "@/lib/api-server";
import {
  type AudienceList,
  type AudienceSegment,
  toAudienceLists,
  toAudienceSegments,
} from "@/lib/audience";
import { type SourceChoice, toSourceChoices } from "@/lib/sources";

export async function getSequences(
  filters: SequenceFilters,
): Promise<SequencesResult> {
  const { status, data } = await apiRequest(
    `/sequences?${sequencesQuery(filters)}`,
  );
  const page = status === 200 ? toSequencesPage(data) : null;
  return page ? { state: "ready", ...page } : { state: "failed" };
}

export type SequenceResult =
  | { state: "ready"; sequence: Sequence }
  | { state: "missing" }
  | { state: "failed" };

export async function getSequence(id: string): Promise<SequenceResult> {
  const { status, data } = await apiRequest(`/${sequencePath(id)}`);
  if (status === 404 || status === 400) {
    return { state: "missing" };
  }
  const sequence = status === 200 ? toSequence(data) : null;
  return sequence ? { state: "ready", sequence } : { state: "failed" };
}

export async function getSources(): Promise<SourceChoice[]> {
  const { status, data } = await apiRequest("/sending-sources");
  return status === 200 ? toSourceChoices(data) : [];
}

export async function getAudienceLists(): Promise<AudienceList[]> {
  const { status, data } = await apiRequest("/lists");
  return status === 200 ? toAudienceLists(data) : [];
}

export async function getAudienceSegments(): Promise<AudienceSegment[]> {
  const { status, data } = await apiRequest("/segments");
  return status === 200 ? toAudienceSegments(data) : [];
}
