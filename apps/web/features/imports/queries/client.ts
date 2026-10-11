import {
  type CreatedImport,
  type Import,
  type StartInput,
  toCreatedImport,
  toImport,
} from "@/features/imports/lib/imports";
import { type ApiResult, malformed, request } from "@/lib/api";

function importPath(id: string, suffix = "") {
  return `/imports/${encodeURIComponent(id)}${suffix}`;
}

function asImport(result: ApiResult<unknown>): ApiResult<Import> {
  if (!result.ok) {
    return result;
  }
  const parsed = toImport(result.data);
  return parsed ? { ok: true, data: parsed } : { ok: false, error: malformed };
}

export async function createImport(
  fileName: string,
  fileSize: number,
): Promise<ApiResult<CreatedImport>> {
  const result = await request("POST", "/imports", { fileName, fileSize });
  if (!result.ok) {
    return result;
  }
  const created = toCreatedImport(result.data);
  return created
    ? { ok: true, data: created }
    : { ok: false, error: malformed };
}

export function putChunk(id: string, index: number, data: string) {
  return request("PUT", importPath(id, `/chunks/${index}`), { data });
}

export async function finishUpload(id: string, chunks: number) {
  return asImport(
    await request("POST", importPath(id, "/uploaded"), { chunks }),
  );
}

export async function startImport(id: string, input: StartInput) {
  return asImport(await request("POST", importPath(id, "/start"), input));
}

export async function fetchImport(id: string) {
  return asImport(await request("GET", importPath(id)));
}

export async function cancelImport(id: string) {
  return asImport(await request("POST", importPath(id, "/cancel")));
}
