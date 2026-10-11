import { type List, type ListInput, toList } from "@/features/lists/lib/lists";
import { type ApiResult, malformed, request } from "@/lib/api";

function toResult(result: ApiResult<unknown>): ApiResult<List> {
  if (!result.ok) {
    return result;
  }
  const list = toList(result.data);
  return list ? { ok: true, data: list } : { ok: false, error: malformed };
}

export async function createList(input: ListInput) {
  return toResult(
    await request("POST", "/lists", {
      name: input.name,
      ...(input.description === "" ? {} : { description: input.description }),
    }),
  );
}

export async function updateList(id: string, input: ListInput) {
  return toResult(
    await request("PATCH", `/lists/${encodeURIComponent(id)}`, {
      name: input.name,
      description: input.description === "" ? null : input.description,
    }),
  );
}

export async function deleteList(id: string) {
  return request("DELETE", `/lists/${encodeURIComponent(id)}`);
}
