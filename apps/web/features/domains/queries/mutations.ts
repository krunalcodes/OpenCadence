import { type Domain, toDomain } from "@/features/domains/lib/domains";
import { type ApiResult, malformed, request } from "@/lib/api";

function toResult(result: ApiResult<unknown>): ApiResult<Domain> {
  if (!result.ok) {
    return result;
  }
  const domain = toDomain(result.data);
  return domain ? { ok: true, data: domain } : { ok: false, error: malformed };
}

export async function createDomain(input: {
  domain: string;
  dkimSelectors: string[];
}) {
  return toResult(
    await request("POST", "/domains", {
      domain: input.domain,
      ...(input.dkimSelectors.length > 0
        ? { dkimSelectors: input.dkimSelectors }
        : {}),
    }),
  );
}

export async function updateSelectors(id: string, dkimSelectors: string[]) {
  return toResult(
    await request("PATCH", `/domains/${encodeURIComponent(id)}`, {
      dkimSelectors,
    }),
  );
}

export async function checkDomain(id: string) {
  return toResult(
    await request("POST", `/domains/${encodeURIComponent(id)}/check`),
  );
}

export async function deleteDomain(id: string) {
  return request("DELETE", `/domains/${encodeURIComponent(id)}`);
}
