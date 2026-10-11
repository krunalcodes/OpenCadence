import type { MailboxProvider } from "@/features/integrations/lib/catalog";
import {
  type EventFilters,
  type EventsPage,
  type EventTopicResult,
  eventsQuery,
  type SendingSource,
  toEventsPage,
  toEventTopicResult,
  toSource,
} from "@/features/integrations/lib/sources";
import {
  type ApiError,
  type ApiResult,
  isRow,
  malformed,
  request,
  textOrNull,
  toApiError,
} from "@/lib/api";

export type { ApiError, ApiResult };

export type TestResult = {
  ok: boolean;
  source: SendingSource | null;
  error: ApiError | null;
};

function asSource(result: ApiResult<unknown>): ApiResult<SendingSource> {
  if (!result.ok) {
    return result;
  }
  const source = toSource(result.data);
  return source ? { ok: true, data: source } : { ok: false, error: malformed };
}

function sourcePath(id: string, suffix = "") {
  return `/sending-sources/${encodeURIComponent(id)}${suffix}`;
}

export async function connectResend(input: { name: string; apiKey: string }) {
  return asSource(await request("POST", "/sending-sources/resend", input));
}

export async function connectMailbox(input: {
  email: string;
  password: string;
  name?: string;
  username?: string;
  smtpHost: string;
  smtpPort: number;
  smtpSecurity: "tls" | "starttls";
  imapHost: string;
  imapPort: number;
  imapSecurity: "tls" | "starttls";
  dailySendLimit?: number;
}) {
  return asSource(await request("POST", "/sending-sources/imap-smtp", input));
}

export async function connectSes(input: {
  name: string;
  accessKeyId: string;
  secretAccessKey: string;
  region: string;
  configurationSet?: string;
}) {
  return asSource(await request("POST", "/sending-sources/ses", input));
}

function asUrl(result: ApiResult<unknown>): ApiResult<{ url: string }> {
  if (!result.ok) {
    return result;
  }
  const url = isRow(result.data) ? textOrNull(result.data.url) : null;
  return url ? { ok: true, data: { url } } : { ok: false, error: malformed };
}

export async function authorizeMailbox(
  provider: MailboxProvider,
  input: { dailySendLimit?: number },
) {
  return asUrl(
    await request("POST", `/sending-sources/${provider}/authorize`, input),
  );
}

export async function startReplyDetection(id: string) {
  return asUrl(await request("POST", sourcePath(id, "/reply-detection")));
}

export async function stopReplyDetection(id: string) {
  return asSource(await request("DELETE", sourcePath(id, "/reply-detection")));
}

export async function saveEventTopic(
  id: string,
  topicArn: string,
): Promise<ApiResult<EventTopicResult>> {
  const result = await request("PUT", sourcePath(id, "/event-topic"), {
    topicArn,
  });
  if (!result.ok) {
    return result;
  }
  const saved = toEventTopicResult(result.data);
  return saved ? { ok: true, data: saved } : { ok: false, error: malformed };
}

export async function updateSource(
  id: string,
  input: {
    name?: string;
    dailySendLimit?: number | null;
    paused?: boolean;
    isDefault?: boolean;
  },
) {
  return asSource(await request("PATCH", sourcePath(id), input));
}

export async function testSource(id: string): Promise<ApiResult<TestResult>> {
  const result = await request("POST", sourcePath(id, "/test"));
  if (!result.ok) {
    return result;
  }
  if (!isRow(result.data)) {
    return { ok: false, error: malformed };
  }
  return {
    ok: true,
    data: {
      ok: result.data.ok === true,
      source: toSource(result.data.source),
      error: isRow(result.data.error)
        ? toApiError(200, result.data.error)
        : null,
    },
  };
}

export async function sendTestEmail(
  id: string,
  input: { to: string; from?: string },
) {
  return request("POST", sourcePath(id, "/test-email"), input);
}

export async function disconnectSource(id: string) {
  return request("DELETE", sourcePath(id));
}

export async function fetchEvents(
  filters: EventFilters,
  cursor: string,
): Promise<ApiResult<EventsPage>> {
  const result = await request(
    "GET",
    `/sending-sources/events?${eventsQuery(filters, cursor)}`,
  );
  if (!result.ok) {
    return result;
  }
  const page = toEventsPage(result.data);
  return page ? { ok: true, data: page } : { ok: false, error: malformed };
}
