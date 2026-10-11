import {
  type ApiResult,
  isRow,
  malformed,
  textOrNull,
  toApiError,
} from "@/lib/api";

export type MediaAsset = {
  id: string;
  url: string;
  fileName: string;
  contentType: string;
  byteSize: number;
  width: number | null;
  height: number | null;
  createdAt: string;
};

export const acceptedImageTypes = [
  "image/png",
  "image/jpeg",
  "image/gif",
  "image/webp",
] as const;

export const maxImageBytes = 5 * 1024 * 1024;

function sizeOrNull(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) && value > 0
    ? value
    : null;
}

export function parseMediaAsset(row: unknown): MediaAsset | null {
  if (!isRow(row)) {
    return null;
  }
  const id = textOrNull(row.id);
  const url = textOrNull(row.url);
  if (!id || !url) {
    return null;
  }
  return {
    id,
    url,
    fileName: textOrNull(row.fileName) ?? "",
    contentType: textOrNull(row.contentType) ?? "",
    byteSize: sizeOrNull(row.byteSize) ?? 0,
    width: sizeOrNull(row.width),
    height: sizeOrNull(row.height),
    createdAt: textOrNull(row.createdAt) ?? "",
  };
}

export function isAcceptedImageType(type: string) {
  return acceptedImageTypes.some((accepted) => accepted === type);
}

export async function uploadImage(file: File): Promise<ApiResult<MediaAsset>> {
  if (!isAcceptedImageType(file.type)) {
    return {
      ok: false,
      error: toApiError(415, { code: "unsupported_type" }),
    };
  }
  if (file.size > maxImageBytes) {
    return { ok: false, error: toApiError(413, { code: "too_large" }) };
  }
  try {
    const response = await fetch("/api/v1/media", {
      method: "POST",
      credentials: "same-origin",
      headers: {
        "content-type": file.type,
        "x-file-name": encodeURIComponent(file.name),
      },
      body: file,
      cache: "no-store",
    });
    const data: unknown = await response.json().catch(() => null);
    if (!response.ok) {
      return { ok: false, error: toApiError(response.status, data) };
    }
    const asset = parseMediaAsset(data);
    return asset ? { ok: true, data: asset } : { ok: false, error: malformed };
  } catch {
    return { ok: false, error: toApiError(0, null) };
  }
}
