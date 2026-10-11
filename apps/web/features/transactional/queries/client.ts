import {
  type EmailDetail,
  type EmailFilters,
  type EmailsPage,
  emailsQuery,
  toEmailDetail,
  toEmailsPage,
} from "@/features/transactional/lib/emails";
import { type ApiResult, malformed, request } from "@/lib/api";

export async function fetchEmails(
  filters: EmailFilters,
  cursor: string,
): Promise<ApiResult<EmailsPage>> {
  const result = await request(
    "GET",
    `/emails?${emailsQuery(filters, cursor)}`,
  );
  if (!result.ok) {
    return result;
  }
  const page = toEmailsPage(result.data);
  return page ? { ok: true, data: page } : { ok: false, error: malformed };
}

export async function fetchEmail(id: string): Promise<ApiResult<EmailDetail>> {
  const result = await request("GET", `/emails/${encodeURIComponent(id)}`);
  if (!result.ok) {
    return result;
  }
  const detail = toEmailDetail(result.data);
  return detail ? { ok: true, data: detail } : { ok: false, error: malformed };
}
