export type RequestHeaders = Record<string, string | string[] | undefined>;

export type TrackedRequest = {
  ip?: string;
  method?: string;
  headers: RequestHeaders;
};

export type Visitor = { ip: string; userAgent: string | undefined };

function single(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[value.length - 1] : value;
}

export function clientIp(request: TrackedRequest) {
  const forwarded = single(request.headers["x-forwarded-for"]);
  const nearest = forwarded?.split(",").at(-1)?.trim();
  return nearest || request.ip || "unknown";
}

export function visitorOf(request: TrackedRequest): Visitor {
  return {
    ip: clientIp(request),
    userAgent: single(request.headers["user-agent"]),
  };
}

export function maskEmail(email: string) {
  const at = email.lastIndexOf("@");
  if (at <= 0) {
    return "***";
  }
  return `${email.slice(0, 1)}***${email.slice(at)}`;
}
