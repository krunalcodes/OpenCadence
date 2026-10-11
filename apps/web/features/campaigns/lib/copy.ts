import type { BadgeTone } from "@/components/status-badge";
import type {
  CampaignProblem,
  CampaignStatus,
  ProblemField,
  RecipientStatus,
  StatKey,
} from "@/features/campaigns/lib/campaigns";
import type { SchedulePreset } from "@/features/campaigns/lib/schedule";
import type { Audience, AudienceList, AudienceSegment } from "@/lib/audience";

const countFormat = new Intl.NumberFormat("en-US");
const percentFormat = new Intl.NumberFormat("en-US", {
  style: "percent",
  maximumFractionDigits: 1,
});

function people(count: number) {
  return count === 1 ? "1 contact" : `${countFormat.format(count)} contacts`;
}

export const statusTones: Record<CampaignStatus, BadgeTone> = {
  draft: "neutral",
  scheduled: "warning",
  sending: "live",
  paused: "danger",
  sent: "success",
  cancelled: "neutral",
  failed: "danger",
};

export const statusLabels: Record<CampaignStatus, string> = {
  draft: "Draft",
  scheduled: "Scheduled",
  sending: "Sending",
  paused: "Paused",
  sent: "Sent",
  cancelled: "Cancelled",
  failed: "Failed",
};

export const recipientTones: Record<RecipientStatus, BadgeTone> = {
  queued: "neutral",
  sent: "success",
  delivered: "success",
  delayed: "warning",
  bounced: "danger",
  complained: "danger",
  failed: "danger",
  skipped: "neutral",
};

export const recipientLabels: Record<RecipientStatus, string> = {
  queued: "Queued",
  sent: "Sent",
  delivered: "Delivered",
  delayed: "Delayed",
  bounced: "Bounced",
  complained: "Complaint",
  failed: "Failed",
  skipped: "Skipped",
};

const sectionNames: Record<ProblemField, string> = {
  template: "Content",
  subject: "Content",
  audience: "Audience",
  source: "Sender",
  from: "Sender",
  brand: "Brand settings",
  schedule: "Schedule",
};

const problemFallbacks: Record<ProblemField, string> = {
  template: "Choose a template with content.",
  subject: "Write a subject line.",
  audience: "Choose who receives this campaign.",
  source: "Choose a sending source that can send.",
  from: "The from address cannot be used with this sending source.",
  brand: "Your brand settings are incomplete.",
  schedule: "The scheduled time is no longer in the future.",
};

export const copy = {
  title: "Campaigns",
  description:
    "One email to a list, a segment or all of your contacts, sent now or at a time you choose.",
  add: "New campaign",
  searchLabel: "Search campaigns",
  searchPlaceholder: "Search by name",
  searchChip: (search: string) => `Matches "${search}"`,
  statusLabel: "Filter by status",
  statusPlaceholder: "All statuses",
  statusEmpty: "No status matches. Clear the box to see all.",
  activeFilters: "Active filters",
  clearAll: "Clear all",
  removeFilter: (label: string) => `Remove filter: ${label}`,
  count: (shown: number, more: boolean) =>
    more
      ? `${countFormat.format(shown)} shown, more available`
      : shown === 1
        ? "1 campaign"
        : `${countFormat.format(shown)} campaigns`,
  columns: {
    name: "Name",
    status: "Status",
    audience: "Audience",
    recipients: "Recipients",
    openRate: "Open rate",
    clickRate: "Click rate",
    date: "Sent or scheduled",
    actions: "Actions",
  },
  untitled: "Untitled campaign",
  noSubject: "No subject yet",
  noAudience: "Not chosen",
  none: "–",
  number: (count: number) => countFormat.format(count),
  percent: (rate: number) => percentFormat.format(rate),
  days: { today: "Today", yesterday: "Yesterday" },
  dateLabels: {
    draft: "Edited",
    scheduled: "Sends",
    sending: "Started",
    paused: "Started",
    sent: "Sent",
    cancelled: "Cancelled",
    failed: "Failed",
  } satisfies Record<CampaignStatus, string>,
  actionsFor: (name: string) => `Actions for ${name}`,
  menu: {
    open: "Open",
    duplicate: "Duplicate",
    remove: "Delete",
    removeSending: "Delete (pause or cancel first)",
  },
  emptyTitle: "No campaigns yet",
  emptyBody:
    "A campaign sends one template to the contacts you choose. You pick the audience, check the summary, then send it now or schedule it.",
  noMatchTitle: "No campaigns match",
  noMatchBody: "Try a different name or status, or clear the filters.",
  loadMore: "Load more",
  loadMoreFailed: "Could not load more campaigns",
  loadFailed: {
    title: "Could not load your campaigns.",
    body: "The server did not answer. Check that the API is running, then try again.",
    retry: "Try again",
  },
  nameDialog: {
    title: "New campaign",
    description:
      "Name the campaign so you can find it later. Only your team sees this name. You choose the audience and content next.",
    name: "Name",
    namePlaceholder: "October newsletter",
    nameMissing: "Give the campaign a name.",
    nameTooLong: (max: number) => `Keep the name under ${max} characters.`,
    create: "Create and open",
    cancel: "Cancel",
  },
  deleteDialog: {
    title: (name: string) => `Delete ${name}?`,
    draftBody:
      "The draft is removed for everyone in this workspace. Nothing has been sent.",
    scheduledBody:
      "This campaign is scheduled. Deleting it means it will not be sent.",
    sentBody:
      "The campaign and its results are removed for everyone in this workspace. Emails already sent stay in your recipients' inboxes.",
    confirm: "Delete campaign",
    cancel: "Cancel",
  },
  toasts: {
    createFailed: "Could not create the campaign",
    duplicated: (name: string) => `${name} was created as a draft`,
    duplicateFailed: (name: string) => `Could not duplicate ${name}`,
    deleted: (name: string) => `${name} was deleted`,
    deleteFailed: (name: string) => `Could not delete ${name}`,
  },
  errors: {
    network:
      "The server did not answer. Check your connection and that the API is running.",
    signedOut:
      "You are signed out or have no active workspace. Reload the page and sign in again.",
    notFound: "This campaign no longer exists. It may have been deleted.",
    notReady:
      "This campaign is not ready to send. Fix the problems listed next to the send controls, then try again.",
    notEditable:
      "This campaign has already been scheduled or sent, so it can no longer be changed. Reload the page to see where it stands.",
    campaignSending:
      "This campaign is sending right now. Pause or cancel it first, then try again.",
    validation:
      "Some of the details were not accepted. Check the fields and try again.",
    sourceUnavailable:
      "The sending source cannot send right now. It may be paused or need attention. Check it on the Integrations page or choose another source.",
    invalidStatus:
      "The campaign is no longer in a state that allows this. Reload the page to see where it stands.",
    fallback: "Nothing was changed. Try again in a moment.",
  },
  audienceNames: {
    all: "All contacts",
    lists: (names: string[], more: number) =>
      more > 0
        ? `${names.join(", ")} and ${countFormat.format(more)} more`
        : names.join(", "),
    removedList: "a deleted list",
    removedSegment: "A deleted segment",
    segment: (name: string) => `Segment: ${name}`,
  },
  unavailable: {
    back: "Campaigns",
    title: "This campaign could not be opened.",
    body: "It may have been deleted, or the server did not answer. Go back to your campaigns and try again.",
    retry: "Try again",
  },
  composer: {
    back: "Campaigns",
    nameLabel: "Campaign name",
    namePlaceholder: "Untitled campaign",
    nameMissing: "Give the campaign a name.",
    saveNow: "Save now",
    status: {
      saved: "All changes saved",
      saving: "Saving",
      dirty: "Unsaved changes",
      failed: "Not saved",
    },
    saveFailed: "Could not save the campaign",
    leaveConfirm:
      "This campaign has changes that are not saved yet. Leave without saving them?",
    locked: {
      title: "This campaign can no longer be edited",
      body: "It was scheduled or sent from another tab or by a teammate.",
      reload: "Show its current state",
    },
    audience: {
      title: "Audience",
      description: "Who receives this campaign.",
      hint: "Each contact gets the email once, even when they are in several of the chosen lists.",
    },
    content: {
      title: "Content",
      description: "The template, subject and preview text.",
      template: "Template",
      templateHint:
        "The campaign sends the template as it is at the moment you send or schedule. Later edits to the template do not change a sent campaign.",
      subject: "Subject",
      subjectPlaceholder: "What the recipient sees in their inbox",
      previewText: "Preview text",
      previewTextPlaceholder: "The short line shown after the subject",
      mergeHint:
        "Merge tags such as {{first_name}} are filled in for each contact.",
    },
    preview: {
      title: "Template preview",
      frameTitle: "Preview of the chosen template",
      empty: "Choose a template to see it here.",
      emptyBody:
        "This template has no content yet. Open it in the editor and write the email first.",
      loading: "Loading the template",
      failed: "The template could not be loaded.",
      missing: "This template no longer exists. Choose another one.",
      retry: "Try again",
      reload: "Reload preview",
      edit: "Edit template",
      editLabel: (name: string) => `Edit ${name} in a new tab`,
      note: "Merge tags are shown as written. Each contact sees their own values.",
      widthLabel: "Preview width",
      desktop: "Desktop",
      mobile: "Mobile",
    },
    sender: {
      title: "Sender",
      description: "Which mailbox or provider sends it, and who it is from.",
      source: "Sending source",
      sourcePlaceholderDefault: (name: string) => `Workspace default: ${name}`,
      sourceHintDefault:
        "Leave this empty to send through the workspace default source.",
      sourceHintNone:
        "No default source is set, so choose the source this campaign sends through.",
      fromName: "From name",
      fromNamePlaceholder: "Your company or your name",
      fromNameHint: "The sender name recipients see in their inbox.",
      fromEmail: "From address",
      fromEmailPlaceholder: "news@yourdomain.com",
      fromEmailHint:
        "This source can send from any address on a domain you have verified with it.",
      fromEmailInvalid: "Enter a full email address, like news@yourdomain.com.",
      fromFixed: (email: string) =>
        `Sends from ${email}. This mailbox always sends from its own address.`,
      replyTo: "Reply-to address",
      replyToPlaceholder: "Optional",
      replyToHint:
        "Replies go here. Leave it empty to receive replies at the from address.",
      replyToInvalid: "Enter a full email address, or leave this empty.",
    },
    tracking: {
      title: "Tracking",
      description: "What OpenCadence records after the email is sent.",
      opens: "Track opens",
      opensHint:
        "Adds an invisible image to the email so you can see who opened it. Some mail apps load images automatically, so open counts are an estimate.",
      clicks: "Track clicks",
      clicksHint:
        "Routes links through your tracking address so you can see who clicked. Recipients still land on the original page.",
    },
    fieldRejected: "This value was not accepted.",
  },
  rail: {
    title: "Summary",
    recipients: "Recipients",
    recipientsNoun: (count: number) =>
      count === 1 ? "contact will receive this" : "contacts will receive this",
    recipientsNone: "No audience chosen yet",
    recipientsZero: "No one would receive this",
    recipientsUnknown: "The recipient count is not available.",
    counting: "Counting recipients",
    audience: "Audience",
    from: "From",
    fromMissing: "No from address yet",
    via: (source: string) => `via ${source}`,
    subject: "Subject",
    subjectMissing: "No subject yet",
    checks: "Checks",
    checking: "Checking the campaign",
    checkPending: "Checks run again once your changes are saved.",
    checkFailed: "The checks could not be run.",
    checkRetry: "Run checks again",
    ready: "Ready to send. No problems found.",
    readyWithWarnings: "Ready to send. Read the notes below first.",
    errorsTitle: (count: number) =>
      count === 1
        ? "1 problem to fix before sending"
        : `${countFormat.format(count)} problems to fix before sending`,
    warningsTitle: (count: number) =>
      count === 1
        ? "1 thing to know"
        : `${countFormat.format(count)} things to know`,
    goTo: (section: string) => `Go to ${section}`,
    sectionOf: (field: ProblemField) => sectionNames[field],
    sendTest: "Send test",
    schedule: "Schedule",
    sendNow: "Send now",
    blocked: "Fix the problems above to send or schedule this campaign.",
    unsaved:
      "Your latest changes are not saved. Fix the field marked in red, then try again.",
    incomplete:
      "Choose an audience and a sender to send or schedule this campaign.",
    waiting: "Sending is available once your changes are saved and checked.",
  },
  testDialog: {
    title: "Send a test email",
    description:
      "Sends the saved campaign to one address so you can check it in a real inbox. Merge tags are filled with sample values and the subject starts with [Test].",
    to: "Send to",
    toPlaceholder: "you@yourdomain.com",
    toMissing: "Enter the address to send the test to.",
    toInvalid: "Enter a full email address, like you@yourdomain.com.",
    noTemplate: "Choose a template in Content before sending a test.",
    suppressed:
      "This address is on your suppression list, so no test was sent. Use a different address.",
    sent: (to: string) => `Test email sent to ${to}`,
    failed: "The test was not sent",
    send: "Send test",
    cancel: "Cancel",
  },
  sendDialog: {
    title: (count: number) => `Send to ${people(count)} now?`,
    body: "Sending starts as soon as you confirm. Emails that have left cannot be recalled, though you can pause or cancel the rest while it is sending.",
    audience: "Audience",
    recipients: "Recipients",
    recipientsValue: (count: number) => people(count),
    from: "From",
    source: "Sending source",
    subject: "Subject",
    warnings: "Before you send",
    confirm: (count: number) => `Send to ${people(count)}`,
    cancel: "Go back",
    failed: "The campaign was not sent",
    started: (name: string) => `${name} is sending`,
  },
  scheduleDialog: {
    title: "Schedule this campaign",
    description:
      "Pick when sending starts. You can unschedule it any time before then to make changes.",
    presetsLabel: "Quick choices",
    presets: {
      hour: "In 1 hour",
      tomorrow: "Tomorrow, 09:00",
      monday: "Next Monday, 09:00",
    } satisfies Record<SchedulePreset, string>,
    date: "Date",
    time: "Time",
    zone: (zone: string, id: string) =>
      id ? `Your time zone: ${zone} (${id})` : `Your time zone: ${zone}`,
    missing: "Choose both a date and a time.",
    past: (minutes: number) =>
      `Choose a time at least ${minutes} minutes from now.`,
    summary: (count: number, day: string, time: string, zone: string) =>
      `Sending to ${people(count)} starts on ${day} at ${time} (${zone}).`,
    from: (address: string) => `From ${address}.`,
    confirm: "Schedule campaign",
    cancel: "Go back",
    failed: "The campaign was not scheduled",
    scheduled: (name: string, day: string, time: string) =>
      `${name} is scheduled for ${day} at ${time}`,
  },
  results: {
    back: "Campaigns",
    refresh: "Refresh",
    refreshFailed: (time: string) =>
      `Could not refresh. Showing figures from ${time}.`,
    updated: (time: string) => `Updated ${time}`,
    actions: {
      pause: "Pause",
      resume: "Resume",
      cancel: "Cancel campaign",
      unschedule: "Unschedule and edit",
    },
    actionFailed: {
      pause: "Could not pause the campaign",
      resume: "Could not resume the campaign",
      cancel: "Could not cancel the campaign",
      unschedule: "Could not unschedule the campaign",
    },
    actionDone: {
      pause: "Campaign paused",
      resume: "Campaign resumed",
      cancel: "Campaign cancelled",
      unschedule: "Campaign moved back to draft",
    },
    cancelDialog: {
      title: (name: string) => `Cancel ${name}?`,
      body: (sent: number, left: number, known: boolean) =>
        !known
          ? `${people(sent)} already received it. Everyone who has not been sent it yet will not get it. A few emails that are already on their way may still arrive. This cannot be undone.`
          : left > 0
            ? `${people(sent)} already received it. The remaining ${people(left)} will not. A few emails that are already on their way may still arrive. This cannot be undone.`
            : "No more emails will be sent. A few that are already on their way may still arrive. This cannot be undone.",
      bodyScheduled:
        "It will not be sent at the scheduled time. This cannot be undone. To change it instead, unschedule it.",
      confirm: "Cancel campaign",
      keep: "Keep it",
    },
    headline: {
      scheduled: "Scheduled",
      sending: "Sending now",
      paused: "Paused",
      sent: "Sent",
      cancelled: "Cancelled",
      failed: "Stopped with an error",
      draft: "Draft",
    } satisfies Record<CampaignStatus, string>,
    scheduledFor: (day: string, time: string, zone: string) =>
      `Sending starts on ${day} at ${time} (${zone}).`,
    scheduledHint:
      "Nothing has been sent yet. Unschedule it to change the audience or content.",
    progress: (done: number, total: number) =>
      `${countFormat.format(done)} of ${countFormat.format(total)} sent`,
    progressLabel: "Emails sent so far",
    preparing: "Still adding recipients, so the total will grow.",
    starting: "Getting the recipients ready. Sending starts in a moment.",
    pausedHint:
      "Nothing more goes out until you resume. Emails already sent are not affected.",
    sentOn: (day: string, time: string) => `Finished on ${day} at ${time}.`,
    startedOn: (day: string, time: string) => `Started on ${day} at ${time}.`,
    cancelledHint:
      "Sending was stopped. The figures below cover the emails that went out before then.",
    failedHint: "Sending stopped before it finished.",
    errorFallback: "The server did not give a reason.",
    stats: {
      recipients: "Recipients",
      skipped: "Skipped",
      sent: "Sent",
      delivered: "Delivered",
      opened: "Opened",
      clicked: "Clicked",
      bounced: "Bounced",
      unsubscribed: "Unsubscribed",
      complained: "Complaints",
      failed: "Failed",
    } satisfies Record<StatKey, string>,
    statsLabel: "Results",
    issuesLabel: "Problems and opt-outs",
    skippedNote: (count: number) =>
      `${countFormat.format(count)} skipped as suppressed`,
    rateOfDelivered: "of delivered",
    rateOfSent: "of sent",
    openTrackingOff: "Open tracking was off",
    clickTrackingOff: "Click tracking was off",
    details: {
      title: "Details",
      audience: "Audience",
      subject: "Subject",
      previewText: "Preview text",
      from: "From",
      replyTo: "Reply-to",
      source: "Sending source",
      template: "Template",
      templateRemoved: "The template was deleted",
      tracking: "Tracking",
      trackingValue: (opens: boolean, clicks: boolean) =>
        opens && clicks
          ? "Opens and clicks"
          : opens
            ? "Opens only"
            : clicks
              ? "Clicks only"
              : "Off",
      missing: "Not set",
    },
    recipients: {
      title: "Recipients",
      description: "Every email this campaign has handed over for sending.",
      statusLabel: "Filter recipients by status",
      statusPlaceholder: "All statuses",
      statusEmpty: "No status matches. Clear the box to see all.",
      count: (shown: number, more: boolean) =>
        more
          ? `${countFormat.format(shown)} shown, more available`
          : shown === 1
            ? "1 recipient"
            : `${countFormat.format(shown)} recipients`,
      columns: {
        email: "Recipient",
        status: "Status",
        opened: "Opened",
        clicked: "Clicked",
        sent: "Sent",
      },
      unsubscribed: "Unsubscribed",
      emptyTitle: "No recipients yet",
      emptyScheduled:
        "Recipients appear here once sending starts at the scheduled time.",
      emptyBody: "Recipients appear here as their emails are queued.",
      noMatchTitle: "No recipients with this status",
      noMatchBody: "Clear the filter to see everyone.",
      loadMore: "Load more",
      loadMoreFailed: "Could not load more recipients",
      loadFailed: {
        title: "Could not load the recipients.",
        body: "The server did not answer. Try again in a moment.",
        retry: "Try again",
      },
      loading: "Loading recipients",
    },
  },
};

type Failure = { status: number; code: string; message: string | null };

export function describeError(error: Failure) {
  if (error.status === 0) {
    return copy.errors.network;
  }
  if (error.status === 401) {
    return copy.errors.signedOut;
  }
  switch (error.code) {
    case "not_ready":
      return copy.errors.notReady;
    case "not_editable":
      return copy.errors.notEditable;
    case "campaign_sending":
      return copy.errors.campaignSending;
    case "source_unavailable":
      return copy.errors.sourceUnavailable;
    case "not_found":
      return copy.errors.notFound;
    case "validation":
      return error.message ?? copy.errors.validation;
    case "invalid_status":
      return error.message ?? copy.errors.invalidStatus;
    default:
      if (error.status === 404) {
        return copy.errors.notFound;
      }
      return error.message ?? copy.errors.fallback;
  }
}

export function problemText(problem: CampaignProblem) {
  if (problem.message) {
    return problem.message;
  }
  return problem.field ? problemFallbacks[problem.field] : copy.errors.fallback;
}

export function fromLine(name: string, email: string | null) {
  const cleanName = name.trim();
  if (!email) {
    return cleanName || null;
  }
  return cleanName ? `${cleanName} <${email}>` : email;
}

const namedLists = 3;

export function audienceLabel(
  audience: Audience | null,
  lists: AudienceList[],
  segments: AudienceSegment[],
) {
  const text = copy.audienceNames;
  if (!audience) {
    return null;
  }
  if (audience.type === "all") {
    return text.all;
  }
  if (audience.type === "segment") {
    const segment = segments.find((item) => item.id === audience.segmentId);
    return segment ? text.segment(segment.name) : text.removedSegment;
  }
  const names = audience.listIds.map(
    (id) => lists.find((list) => list.id === id)?.name ?? text.removedList,
  );
  return text.lists(
    names.slice(0, namedLists),
    Math.max(names.length - namedLists, 0),
  );
}
