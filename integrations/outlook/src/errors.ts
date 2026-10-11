import {
  IntegrationError,
  type IntegrationErrorCode,
} from "@workspace/integration-core";
import {
  asString,
  isObject,
  type JsonObject,
  readJson,
  retryAfterSeconds,
} from "./http";

type ParsedGraphError = {
  codes: string[];
  providerCode?: string;
  message?: string;
};

type Classified = [IntegrationErrorCode, string];

const maxProviderMessageLength = 300;

const maxErrorDepth = 6;

const sendLimitCodes = [
  "errorsubmissionquotaexceeded",
  "errorexceededmessagelimit",
];

const mailboxFullCodes = ["errorquotaexceeded"];

const mailboxUnavailableCodes = [
  "mailboxnotenabledforrestapi",
  "mailboxnotsupportedforrestapi",
  "errornonexistentmailbox",
  "erroraccountdisabled",
];

const throttleCodes = [
  "toomanyrequests",
  "applicationthrottled",
  "activitylimitreached",
  "errorserverbusy",
];

const temporaryCodes = [
  "errormailboxstoreunavailable",
  "errorinternalservertransienterror",
  "errormailboxmoveinprogress",
  "errorconnectionfailed",
  "servicenotavailable",
];

const validationCodes = [
  "errorinvalidrecipients",
  "errormissingrecipients",
  "errormessagesizeexceeded",
  "errormimecontentinvalid",
  "errormimecontentinvalidbase64string",
  "errormimecontentconversionfailed",
];

const staleCursorCodes = [
  "syncstatenotfound",
  "syncstateinvalid",
  "resyncrequired",
  "errorinvalidsyncstatedata",
];

const validationStatuses = [400, 405, 406, 411, 413, 415, 422];

function clip(value: string | undefined) {
  return value?.slice(0, maxProviderMessageLength);
}

function parseGraphError(body: JsonObject): ParsedGraphError {
  const codes: string[] = [];
  let message: string | undefined;
  let node: unknown = body.error;
  for (let depth = 0; depth < maxErrorDepth && isObject(node); depth += 1) {
    const code = asString(node.code);
    if (code) {
      codes.push(code);
    }
    message ??= asString(node.message);
    node = node.innererror ?? node.innerError;
  }
  return {
    codes: codes.map((code) => code.toLowerCase()),
    providerCode: codes[0],
    message,
  };
}

function needsStepUp(response: Response, parsed: ParsedGraphError) {
  const challenge = response.headers.get("www-authenticate") ?? "";
  return (
    challenge.toLowerCase().includes("insufficient_claims") ||
    parsed.codes.includes("insufficientclaims") ||
    parsed.codes.includes("insufficient_claims")
  );
}

function classifyForbidden(
  response: Response,
  parsed: ParsedGraphError,
): Classified {
  if (needsStepUp(response, parsed)) {
    return [
      "blocked_by_policy",
      "The organization's sign-in policy blocked this request. Reconnect the account and complete the extra sign-in steps, or ask the administrator to allow this app.",
    ];
  }
  if (parsed.message?.toLowerCase().includes("odata is disabled")) {
    return [
      "blocked_by_policy",
      "The organization's Exchange administrator has blocked this app from reaching the mailbox.",
    ];
  }
  if (parsed.codes.includes("errorsendasdenied")) {
    return [
      "insufficient_permission",
      "This mailbox is not allowed to send as the From address on the message.",
    ];
  }
  return [
    "insufficient_permission",
    "Microsoft denied access to the mailbox. Reconnect the account and allow the requested permissions, and check that the account has an Exchange Online mailbox.",
  ];
}

function classify(response: Response, parsed: ParsedGraphError): Classified {
  const status = response.status;
  const has = (names: string[]) =>
    names.some((name) => parsed.codes.includes(name));

  if (has(sendLimitCodes)) {
    return [
      "quota_reached",
      "This mailbox has reached its sending limit. Sending will resume when Microsoft lifts the limit.",
    ];
  }
  if (has(mailboxFullCodes) || status === 507) {
    return [
      "quota_reached",
      "This mailbox is full. Free up space in the mailbox, then try again.",
    ];
  }
  if (status === 401) {
    return ["auth_expired", "The Microsoft access token has expired."];
  }
  if (has(mailboxUnavailableCodes)) {
    return [
      "blocked_by_policy",
      "This account has no usable Exchange Online mailbox. Ask the administrator to enable and license the mailbox.",
    ];
  }
  if (status === 429 || status === 509 || has(throttleCodes)) {
    return [
      "rate_limited",
      "Microsoft is receiving requests too quickly. Sending will resume shortly.",
    ];
  }
  if (
    (status === 503 || status === 504) &&
    retryAfterSeconds(response) !== undefined
  ) {
    return [
      "rate_limited",
      "Microsoft asked to slow down. Sending will resume shortly.",
    ];
  }
  if (status === 403) {
    return classifyForbidden(response, parsed);
  }
  if (status >= 500 || has(temporaryCodes)) {
    return [
      "temporary",
      "Outlook is temporarily unavailable. Try again in a moment.",
    ];
  }
  if (has(validationCodes) || validationStatuses.includes(status)) {
    return ["validation", "Outlook rejected the request as invalid."];
  }
  if (status === 404) {
    return ["unknown", "Outlook could not find the requested item."];
  }
  return ["unknown", "Outlook returned an unexpected error."];
}

export type GraphFailure = {
  status: number;
  staleCursor: boolean;
  error: IntegrationError;
};

export async function graphFailure(response: Response): Promise<GraphFailure> {
  const parsed = parseGraphError(await readJson(response));
  const [code, message] = classify(response, parsed);
  return {
    status: response.status,
    staleCursor:
      response.status === 410 ||
      staleCursorCodes.some((name) => parsed.codes.includes(name)),
    error: new IntegrationError(code, message, {
      retryAfterSeconds:
        code === "rate_limited" ? retryAfterSeconds(response) : undefined,
      providerStatus: response.status,
      providerCode: parsed.providerCode,
      providerMessage: clip(parsed.message),
    }),
  };
}

export async function graphApiError(
  response: Response,
): Promise<IntegrationError> {
  return (await graphFailure(response)).error;
}

export type TokenAction = "exchange" | "refresh";

const policyErrorCodes = [53000, 53001, 53002, 53003, 53004, 530003];

const clientSecretErrorCodes = [7000215, 7000222, 700016];

function numericCodes(value: unknown): number[] {
  return Array.isArray(value)
    ? value.filter((entry): entry is number => typeof entry === "number")
    : [];
}

function classifyToken(
  status: number,
  providerCode: string | undefined,
  errorCodes: number[],
  action: TokenAction,
): Classified {
  const hasAny = (codes: number[]) =>
    codes.some((code) => errorCodes.includes(code));

  if (status >= 500 || providerCode === "temporarily_unavailable") {
    return [
      "temporary",
      "Microsoft sign-in is temporarily unavailable. Try again in a moment.",
    ];
  }
  if (status === 429) {
    return [
      "rate_limited",
      "Microsoft sign-in is receiving requests too quickly. Try again shortly.",
    ];
  }
  if (hasAny(policyErrorCodes)) {
    return [
      "blocked_by_policy",
      "The organization's sign-in policy blocked access for this app. Ask the administrator to allow it, then reconnect the account.",
    ];
  }
  if (
    hasAny(clientSecretErrorCodes) ||
    providerCode === "invalid_client" ||
    providerCode === "unauthorized_client" ||
    status === 401
  ) {
    return [
      "invalid_credentials",
      "Microsoft rejected the app registration. Check the Outlook client ID and secret, and that the secret has not expired.",
    ];
  }
  if (
    providerCode === "invalid_grant" ||
    providerCode === "interaction_required" ||
    providerCode === "consent_required"
  ) {
    if (action === "exchange") {
      return [
        "validation",
        "The Microsoft authorization code is invalid or has expired. Start the connection again.",
      ];
    }
    return [
      "auth_revoked",
      "Access to this Microsoft account was revoked or has expired. Reconnect the account.",
    ];
  }
  if (status === 400) {
    return ["validation", "Microsoft rejected the sign-in request as invalid."];
  }
  return ["unknown", "Microsoft sign-in returned an unexpected error."];
}

export async function tokenEndpointError(
  response: Response,
  action: TokenAction,
): Promise<IntegrationError> {
  const body = await readJson(response);
  const providerCode = asString(body.error);
  const [code, message] = classifyToken(
    response.status,
    providerCode,
    numericCodes(body.error_codes),
    action,
  );
  return new IntegrationError(code, message, {
    retryAfterSeconds:
      code === "rate_limited" ? retryAfterSeconds(response) : undefined,
    providerStatus: response.status,
    providerCode,
    providerMessage: clip(
      asString(body.error_description)?.split(/\r?\n/)[0]?.trim(),
    ),
  });
}
