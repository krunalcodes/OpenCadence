import { countOf, isRow, type Row, rowsOf, textOrNull } from "@/lib/api";

export type EnrollmentStatus =
  | "active"
  | "paused"
  | "completed"
  | "replied"
  | "bounced"
  | "unsubscribed"
  | "failed"
  | "removed";

export type EnrollmentContact = {
  id: string;
  email: string;
  firstName: string | null;
  lastName: string | null;
};

export type Enrollment = {
  id: string;
  contact: EnrollmentContact;
  status: EnrollmentStatus;
  source: { id: string; name: string } | null;
  nextStepPosition: number;
  nextRunAt: string | null;
  lastSentAt: string | null;
  finishReason: string | null;
  enrolledAt: string;
  finishedAt: string | null;
};

export type EnrollmentMessage = {
  id: string;
  stepId: string | null;
  subject: string;
  status: string;
  sentAt: string | null;
  openedAt: string | null;
  clickedAt: string | null;
  repliedAt: string | null;
};

export type EnrollmentDetail = Enrollment & { messages: EnrollmentMessage[] };

export type EnrollmentsPage = {
  enrollments: Enrollment[];
  nextCursor: string | null;
};

export type EnrollmentFilters = {
  status: EnrollmentStatus | null;
  search: string;
};

export type EnrollResult = {
  enrolled: number;
  alreadyEnrolled: number;
  suppressed: number;
  queued: boolean;
};

export type EnrollmentAction = "pause" | "resume" | "remove";

export const enrollmentStatuses: EnrollmentStatus[] = [
  "active",
  "paused",
  "completed",
  "replied",
  "bounced",
  "unsubscribed",
  "failed",
  "removed",
];

export const enrollmentPageSize = 30;

function text(value: unknown) {
  return typeof value === "string" ? value : "";
}

export function toEnrollment(value: unknown): Enrollment | null {
  if (!isRow(value)) {
    return null;
  }
  const id = textOrNull(value.id);
  const contact: Row | null = isRow(value.contact) ? value.contact : null;
  const contactId = contact ? textOrNull(contact.id) : null;
  if (!id || !contact || !contactId) {
    return null;
  }
  const source = isRow(value.source) ? value.source : null;
  const sourceId = source ? textOrNull(source.id) : null;
  return {
    id,
    contact: {
      id: contactId,
      email: text(contact.email),
      firstName: textOrNull(contact.firstName),
      lastName: textOrNull(contact.lastName),
    },
    status:
      enrollmentStatuses.find((status) => status === value.status) ?? "active",
    source:
      source && sourceId
        ? { id: sourceId, name: textOrNull(source.name) ?? "" }
        : null,
    nextStepPosition: countOf(value.nextStepPosition),
    nextRunAt: textOrNull(value.nextRunAt),
    lastSentAt: textOrNull(value.lastSentAt),
    finishReason: textOrNull(value.finishReason),
    enrolledAt: text(value.enrolledAt),
    finishedAt: textOrNull(value.finishedAt),
  };
}

export function toEnrollmentsPage(value: unknown): EnrollmentsPage | null {
  if (!isRow(value) || !Array.isArray(value.items)) {
    return null;
  }
  return {
    enrollments: rowsOf(value.items).flatMap((item) => {
      const enrollment = toEnrollment(item);
      return enrollment ? [enrollment] : [];
    }),
    nextCursor: textOrNull(value.nextCursor),
  };
}

export function toEnrollmentDetail(value: unknown): EnrollmentDetail | null {
  const enrollment = toEnrollment(value);
  if (!enrollment || !isRow(value)) {
    return null;
  }
  return {
    ...enrollment,
    messages: rowsOf(value.messages).flatMap((item) => {
      const id = textOrNull(item.id);
      return id
        ? [
            {
              id,
              stepId: textOrNull(item.stepId),
              subject: text(item.subject),
              status: text(item.status),
              sentAt: textOrNull(item.sentAt),
              openedAt: textOrNull(item.openedAt),
              clickedAt: textOrNull(item.clickedAt),
              repliedAt: textOrNull(item.repliedAt),
            },
          ]
        : [];
    }),
  };
}

export function toEnrollResult(value: unknown): EnrollResult | null {
  if (!isRow(value)) {
    return null;
  }
  return {
    enrolled: countOf(value.enrolled),
    alreadyEnrolled: countOf(value.alreadyEnrolled),
    suppressed: countOf(value.suppressed),
    queued: value.queued === true,
  };
}

export function enrollmentsQuery(
  filters: EnrollmentFilters,
  cursor?: string | null,
) {
  const params = new URLSearchParams();
  if (filters.status) {
    params.set("status", filters.status);
  }
  if (filters.search) {
    params.set("search", filters.search);
  }
  if (cursor) {
    params.set("cursor", cursor);
  }
  params.set("limit", String(enrollmentPageSize));
  return params.toString();
}

export function contactName(contact: EnrollmentContact) {
  const name = [contact.firstName, contact.lastName]
    .filter((part) => part !== null)
    .join(" ")
    .trim();
  return name === "" ? null : name;
}

export function canPause(enrollment: Enrollment) {
  return enrollment.status === "active";
}

export function canResume(enrollment: Enrollment) {
  return enrollment.status === "paused";
}

export function canRemove(enrollment: Enrollment) {
  return enrollment.status === "active" || enrollment.status === "paused";
}
