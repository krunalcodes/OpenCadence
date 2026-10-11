import type { AudienceType } from "@/lib/audience";
import type { SourceStatus } from "@/lib/sources";

const countFormat = new Intl.NumberFormat("en-US");

const providerNames: Record<string, string> = {
  gmail: "Gmail",
  outlook: "Outlook",
  "imap-smtp": "IMAP/SMTP",
  resend: "Resend",
  "amazon-ses": "Amazon SES",
  sendgrid: "SendGrid",
  smtp: "SMTP relay",
};

const unavailable: Record<Exclude<SourceStatus, "active">, string> = {
  paused: "Paused",
  needs_attention: "Needs attention",
};

const unavailableDetail: Record<Exclude<SourceStatus, "active">, string> = {
  paused:
    "Sending through this source is paused. Resume it on the Integrations page to send from it.",
  needs_attention:
    "This source has a problem and cannot send. Fix it on the Integrations page.",
};

export const copy = {
  source: {
    label: "Sending source",
    labelMany: "Sending sources",
    placeholder: "Choose a sending source",
    placeholderMany: "Choose sending sources",
    noMatch: "No source matches",
    provider: (integrationType: string) =>
      providerNames[integrationType] ?? integrationType,
    detail: (email: string | null, integrationType: string) => {
      const provider = providerNames[integrationType] ?? integrationType;
      return email ? `${email}, ${provider}` : provider;
    },
    defaultMark: "Default",
    unavailable: (status: Exclude<SourceStatus, "active">) =>
      unavailable[status],
    unavailableDetail: (status: Exclude<SourceStatus, "active">) =>
      unavailableDetail[status],
    unavailableChosen: (
      name: string,
      status: Exclude<SourceStatus, "active">,
    ) => `${name}: ${unavailableDetail[status]}`,
    none: "No sending source is connected yet.",
    connect: "Connect a mailbox or provider",
    manage: "Open Integrations",
  },
  template: {
    label: "Template",
    placeholder: "Search templates",
    loading: "Loading templates",
    noMatch: (search: string) => `No template matches "${search}"`,
    none: "No templates yet.",
    create: "Create a template",
    noSubject: "No subject yet",
    failed: "Could not load templates.",
    retry: "Try again",
  },
  audience: {
    label: "Audience",
    types: {
      all: "All contacts",
      lists: "Lists",
      segment: "Segment",
    } satisfies Record<AudienceType, string>,
    lists: {
      label: "Lists",
      placeholder: "Choose lists",
      noMatch: "No list matches",
      subscribed: (count: number) => `${countFormat.format(count)} subscribed`,
      none: "No lists yet.",
      create: "Create a list",
      tooMany: (max: number) => `Choose up to ${max} lists.`,
    },
    segment: {
      label: "Segment",
      placeholder: "Choose a segment",
      noMatch: "No segment matches",
      none: "No segments yet.",
      create: "Create a segment",
    },
    count: {
      loading: "Counting recipients",
      chooseLists: "Choose at least one list to see who would receive this.",
      chooseSegment: "Choose a segment to see who would receive this.",
      number: (count: number) => countFormat.format(count),
      noun: (count: number) =>
        count === 1
          ? "contact would receive this"
          : "contacts would receive this",
      listsNote:
        "Each contact is counted once. Unsubscribed and suppressed addresses are left out.",
      note: "Suppressed addresses are left out.",
      zero: "No one would receive this",
      zeroDetail: {
        all: "This workspace has no contacts that can be emailed yet.",
        lists:
          "These lists have no subscribed contacts that can be emailed. Pick another list or add contacts.",
        segment:
          "No contact that can be emailed matches this segment right now.",
      } satisfies Record<AudienceType, string>,
      failed: "Could not count the recipients.",
      retry: "Try again",
    },
  },
};
