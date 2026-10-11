export const FORMS_MAINTENANCE_QUEUE = "forms-maintenance";

export const honeypotField = "fax_number";
export const renderTokenField = "render_token";

const minuteMs = 60 * 1000;
const hourMs = 60 * minuteMs;
const dayMs = 24 * hourMs;

export const minFillMs = 2000;
export const confirmTokenTtlMs = 7 * dayMs;
export const pendingRetentionDays = 30;
export const submitBodyLimit = 16 * 1024;

export type FormRateRule = { limit: number; windowMs: number };

export const formRateRules = {
  page: { limit: 60, windowMs: minuteMs },
  submitPerIpMinute: { limit: 10, windowMs: minuteMs },
  submitPerIpHour: { limit: 60, windowMs: hourMs },
  submitPerForm: { limit: 1000, windowMs: hourMs },
  addressPerForm: { limit: 1, windowMs: hourMs },
  addressPerDay: { limit: 5, windowMs: dayMs },
} as const satisfies Record<string, FormRateRule>;

export type FormRateGroup = keyof typeof formRateRules;

export const formStatuses = ["draft", "published", "archived"] as const;
export type FormStatus = (typeof formStatuses)[number];

export const submissionStatuses = [
  "pending",
  "confirmed",
  "subscribed",
  "rejected",
] as const;
export type SubmissionStatus = (typeof submissionStatuses)[number];
