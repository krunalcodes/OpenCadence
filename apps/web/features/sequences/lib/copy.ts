import type { BadgeTone } from "@/components/status-badge";
import type { EnrollmentStatus } from "@/features/sequences/lib/enrollments";
import type { Weekday } from "@/features/sequences/lib/schedule";
import type {
  Problem,
  SequenceStatus,
  SequenceTab,
  ThreadMode,
} from "@/features/sequences/lib/sequences";
import { toWait, type WaitUnit } from "@/features/sequences/lib/steps";

const countFormat = new Intl.NumberFormat("en-US");
const percentFormat = new Intl.NumberFormat("en-US", {
  style: "percent",
  maximumFractionDigits: 0,
});

function plural(count: number, one: string, many: string) {
  return `${countFormat.format(count)} ${count === 1 ? one : many}`;
}

const unitNames: Record<WaitUnit, [string, string]> = {
  minutes: ["minute", "minutes"],
  hours: ["hour", "hours"],
  days: ["day", "days"],
};

function waitText(minutes: number) {
  const wait = toWait(minutes);
  const [one, many] = unitNames[wait.unit];
  return plural(wait.amount, one, many);
}

export const statusLabels: Record<SequenceStatus, string> = {
  draft: "Draft",
  active: "Active",
  paused: "Paused",
  archived: "Archived",
};

export function statusTone(status: SequenceStatus, sending: boolean) {
  const tones: Record<SequenceStatus, BadgeTone> = {
    draft: "neutral",
    active: sending ? "live" : "success",
    paused: "warning",
    archived: "neutral",
  };
  return tones[status];
}

export const enrollmentLabels: Record<EnrollmentStatus, string> = {
  active: "Active",
  paused: "Paused",
  completed: "Completed",
  replied: "Replied",
  bounced: "Bounced",
  unsubscribed: "Unsubscribed",
  failed: "Failed",
  removed: "Removed",
};

export const enrollmentTones: Record<EnrollmentStatus, BadgeTone> = {
  active: "success",
  paused: "warning",
  completed: "neutral",
  replied: "success",
  bounced: "danger",
  unsubscribed: "neutral",
  failed: "danger",
  removed: "neutral",
};

const messageLabels: Record<string, string> = {
  queued: "Queued",
  scheduled: "Scheduled",
  sending: "Sending",
  sent: "Sent",
  delivered: "Delivered",
  delayed: "Delayed",
  opened: "Opened",
  clicked: "Clicked",
  replied: "Replied",
  bounced: "Bounced",
  complained: "Marked as spam",
  failed: "Failed",
  skipped: "Not sent",
  suppressed: "Not sent",
  cancelled: "Cancelled",
  canceled: "Cancelled",
};

const messageTones: Record<string, BadgeTone> = {
  sending: "live",
  sent: "success",
  delivered: "success",
  opened: "success",
  clicked: "success",
  replied: "success",
  bounced: "danger",
  complained: "danger",
  failed: "danger",
  queued: "warning",
  delayed: "warning",
  scheduled: "warning",
};

export function messageLabel(status: string) {
  return messageLabels[status] ?? (status || "Unknown");
}

export function messageTone(status: string): BadgeTone {
  return messageTones[status] ?? "neutral";
}

const weekdayShort: Record<Weekday, string> = {
  1: "Mon",
  2: "Tue",
  3: "Wed",
  4: "Thu",
  5: "Fri",
  6: "Sat",
  7: "Sun",
};

const weekdayLong: Record<Weekday, string> = {
  1: "Monday",
  2: "Tuesday",
  3: "Wednesday",
  4: "Thursday",
  5: "Friday",
  6: "Saturday",
  7: "Sunday",
};

const tabLabels: Record<SequenceTab, string> = {
  steps: "Steps",
  contacts: "Contacts",
  settings: "Settings",
};

const threadLabels: Record<ThreadMode, string> = {
  reply: "Reply in thread",
  new: "New thread",
};

const unitLabels: Record<WaitUnit, string> = {
  minutes: "Minutes",
  hours: "Hours",
  days: "Days",
};

export const copy = {
  title: "Sequences",
  description:
    "A sequence sends a series of emails to each enrolled contact, one step at a time, from your own mailboxes, and stops when they reply.",
  add: "New sequence",
  searchLabel: "Search sequences",
  searchPlaceholder: "Search by name",
  searchChip: (search: string) => `Search: ${search}`,
  statusFilterLabel: "Filter by status",
  allStatuses: "All",
  activeFilters: "Active filters",
  clearAll: "Clear all",
  removeFilter: (label: string) => `Remove filter: ${label}`,
  count: (count: number, more: boolean) =>
    `${more ? "First " : ""}${plural(count, "sequence", "sequences")}`,
  number: (value: number) => countFormat.format(value),
  percent: (value: number) => percentFormat.format(value),
  columns: {
    name: "Name",
    status: "Status",
    steps: "Steps",
    active: "Active",
    replied: "Replied",
    sent: "Sent",
    actions: "Actions",
  },
  replyRate: (rate: number) => `${percentFormat.format(rate)} of enrolled`,
  actionsFor: (name: string) => `Actions for ${name}`,
  menu: {
    open: "Open",
    rename: "Rename",
    duplicate: "Duplicate",
    archive: "Archive",
    remove: "Delete",
  },
  emptyTitle: "No sequences yet",
  emptyBody:
    "Build a series of emails with waits between them, then enrol contacts. Each contact moves through the steps on their own schedule.",
  noMatchTitle: "No sequences match",
  noMatchBody: "Try a different name or status, or clear the filters.",
  loadMore: "Load more",
  loadMoreFailed: "Could not load more sequences",
  loadFailed: {
    title: "Could not load sequences.",
    body: "The API did not answer. Check that it is running, then try again.",
    retry: "Try again",
  },
  days: { today: "Today", yesterday: "Yesterday" },
  statuses: statusLabels,
  nameDialog: {
    createTitle: "New sequence",
    createDescription:
      "Name it for the audience or the goal. You will add steps next.",
    renameTitle: "Rename sequence",
    renameDescription: (name: string) => `Choose a new name for ${name}.`,
    name: "Name",
    namePlaceholder: "Founder outreach, spring",
    nameMissing: "Enter a name for the sequence.",
    nameTooLong: (max: number) => `Use ${max} characters or fewer.`,
    nameTaken:
      "Another sequence already uses this name. Choose a different one.",
    cancel: "Cancel",
    create: "Create sequence",
    save: "Save name",
  },
  deleteDialog: {
    title: (name: string) => `Delete ${name}?`,
    body: "Its steps, enrolments and results are deleted with it. Emails already sent stay in each contact's history. This cannot be undone.",
    activeBody:
      "This sequence is active. Pause it first, then delete it, so no email is cut off halfway through a send.",
    cancel: "Cancel",
    close: "Close",
    confirm: "Delete sequence",
  },
  toasts: {
    createFailed: "Could not create the sequence",
    renamed: (name: string) => `Renamed to ${name}`,
    renameFailed: "Could not rename the sequence",
    duplicated: (name: string) => `Created ${name}`,
    duplicateFailed: (name: string) => `Could not duplicate ${name}`,
    archived: (name: string) => `Archived ${name}`,
    archiveFailed: (name: string) => `Could not archive ${name}`,
    deleted: (name: string) => `Deleted ${name}`,
    deleteFailed: (name: string) => `Could not delete ${name}`,
    activated: (name: string) => `${name} is active`,
    activatedWithWarnings: (count: number) =>
      `${plural(count, "thing", "things")} to look at. Open the checks next to the status for details.`,
    activateFailed: "Could not activate the sequence",
    notReady: "This sequence is not ready to activate",
    notReadyBody: "Fix the problems listed next to the Activate button.",
    paused: (name: string) => `Paused ${name}`,
    pauseFailed: "Could not pause the sequence",
    checkFailed: "Could not check the sequence",
  },
  errors: {
    network:
      "The server did not answer. Check your connection and that the API is running.",
    signedOut:
      "You are signed out or have no active workspace. Reload the page and sign in again.",
    notFound: "This sequence no longer exists. It may have been deleted.",
    notReady:
      "The sequence has problems that must be fixed before it can be activated.",
    sequenceActive: "This sequence is active. Pause it first, then try again.",
    validation:
      "Something in the request was not accepted. Check the values and try again.",
    nameTaken:
      "Another sequence already uses this name. Choose a different one.",
    archived:
      "This sequence is archived. Activate it again to change it or enrol contacts.",
    invalidState:
      "This contact's enrolment has already moved on, so that change no longer applies. Reload to see where it stands.",
    fallback: "Nothing was changed. Try again in a moment.",
  },
  detail: {
    back: "Sequences",
    backLabel: "Back to sequences",
    notFoundTitle: "This sequence could not be opened.",
    notFoundBody:
      "It may have been deleted, or the API did not answer. Go back to sequences or try again.",
    tabsLabel: "Sequence sections",
    tabs: tabLabels,
    activate: "Activate",
    resume: "Resume",
    pause: "Pause",
    more: "More actions",
    summary: (steps: number, active: number) =>
      `${plural(steps, "step", "steps")}, ${plural(active, "active contact", "active contacts")}`,
    archivedNote:
      "This sequence is archived. It sends nothing and is kept for its results.",
  },
  check: {
    trigger: (errors: number, warnings: number) =>
      errors > 0
        ? plural(errors, "problem", "problems")
        : plural(warnings, "warning", "warnings"),
    ready: "Ready to send",
    checking: "Checking",
    title: "Before this sequence can send",
    titleWarnings: "Worth a look",
    errorsLabel: "Must fix",
    warningsLabel: "Warnings",
    warningsNote: "Warnings do not block activation.",
    readyBody: "Nothing is stopping this sequence from sending.",
    failed: "The check did not run. Try again.",
    retry: "Check again",
    stepLabel: (position: number) => `Step ${position}`,
    showStep: "Show step",
    openSettings: "Open settings",
    addFromEmail: "Add a from address",
    openBrand: "Open brand settings",
  },
  builder: {
    canvasLabel: "Sequence steps",
    hint: "Select a step to edit it, or a wait to change it. Drag steps to arrange the canvas.",
    activeNotice:
      "This sequence is active. Changes apply to contacts who have not reached that step yet.",
    start: "Contact is enrolled",
    startHint: "The sequence starts here for each contact",
    stepNumber: (position: number) => `Step ${position}`,
    email: "Email",
    noTemplate: "Choose a template",
    noSubject: "No subject yet",
    replySubject: "Sent as a reply, with the thread's subject",
    thread: threadLabels,
    stats: {
      sent: "Sent",
      opened: "Opened",
      replied: "Replied",
    },
    notSentYet: "Nothing sent yet",
    nodeLabel: (position: number, name: string | null) =>
      name ? `Step ${position}: ${name}` : `Step ${position}: no template`,
    nodeProblem: "This step has a problem",
    addStep: "Add step",
    addFirstStep: "Add the first email",
    insertStep: (position: number) => `Add a step at position ${position}`,
    stepLimit: (max: number) => `A sequence can have up to ${max} steps.`,
    wait: (minutes: number, first: boolean) =>
      minutes <= 0
        ? "Send immediately"
        : first
          ? `Wait ${waitText(minutes)} after enrolment`
          : `Wait ${waitText(minutes)}`,
    waitShort: (minutes: number) =>
      minutes <= 0 ? "Send immediately" : `Wait ${waitText(minutes)}`,
    editWait: (label: string) => `${label}. Change the wait`,
    a11y: {
      node: "Press Enter or Space to open this step. Use the arrow keys to move it on the canvas, and Delete to remove it.",
      nodeNoKeyboard: "Press Enter or Space to open this step.",
      moved: ({
        direction,
        x,
        y,
      }: {
        direction: string;
        x: number;
        y: number;
      }) => `Moved the step ${direction}. New position, x: ${x}, y: ${y}`,
      edge: "The wait between two steps.",
    },
    controls: {
      label: "Canvas controls",
      zoomIn: "Zoom in",
      zoomOut: "Zoom out",
      fit: "Fit to view",
      tidy: "Tidy up",
      tidyHint: "Reset every step to the automatic layout",
    },
    status: {
      saved: "All changes saved",
      saving: "Saving",
      dirty: "Unsaved changes",
      failed: "Not saved",
      held: "Waiting to save",
    },
    heldHint:
      "An active sequence cannot hold a step without a template. Choose one for every step, and the changes save. Or pause the sequence first.",
    heldArchived:
      "This sequence is archived, so these changes are not saved. Activate it again to keep them.",
    archivedNotice:
      "This sequence is archived. Activate it again to change its steps.",
    heldEmpty:
      "An active sequence needs at least one step. Add one, or pause the sequence first.",
    retrySave: "Save now",
    saveFailed: "Could not save the steps",
    layoutFailed: "Could not save the canvas layout",
    leaveConfirm:
      "This sequence has changes that are not saved yet. Leave without saving?",
    loading: "Loading the step builder",
    panel: {
      label: "Step settings",
      title: (position: number) => `Step ${position}`,
      close: "Close step settings",
      template: "Template",
      templateHint: "The email this step sends. Edit its content in Templates.",
      subject: "Subject",
      subjectPlaceholder: "Uses the template's subject",
      subjectHint:
        "Merge tags such as {{first_name}} are filled in per contact.",
      subjectReply:
        "A reply in the same thread keeps the first email's subject, with Re: in front, so this step has no subject of its own.",
      wait: "Wait before sending",
      waitFirstHint:
        "Counted from the moment the contact is enrolled. Use 0 to send straight away.",
      waitHint:
        "Counted from when the previous step was sent, within the sending window.",
      waitAmount: "Amount",
      waitUnit: "Unit",
      units: unitLabels,
      waitInvalid: "Enter a whole number.",
      waitTooShort: "A follow-up needs a wait of at least 1 minute.",
      waitTooLong: "Use a wait of 365 days or less.",
      thread: "Thread",
      threadFirst: "The first email always starts a new thread.",
      threadHint:
        "A reply lands under the earlier email in the contact's inbox. A new thread arrives as a separate email.",
      order: "Order",
      moveUp: "Move up",
      moveDown: "Move down",
      preview: "Preview",
      previewFrame: "Template preview",
      previewEmpty: "Choose a template to see it here.",
      previewLoading: "Loading the template",
      previewFailed:
        "The template could not be loaded. It may have been deleted.",
      previewBlank: "This template has no content yet.",
      previewNote: "Merge tags are shown as written.",
      remove: "Delete step",
      sentBefore: (sent: number) =>
        `${plural(sent, "email", "emails")} sent from this step so far`,
    },
    waitPopover: {
      title: "Wait before this step",
      done: "Done",
    },
    deleteStep: {
      title: (position: number) => `Delete step ${position}?`,
      body: "Contacts who have not reached this step will skip it.",
      sentBody: (sent: number) =>
        `This step has already sent ${plural(sent, "email", "emails")}. Deleting it removes its results from this sequence. Contacts who have not reached it will skip it.`,
      cancel: "Cancel",
      confirm: "Delete step",
    },
    stepDeleted: (position: number) => `Deleted step ${position}`,
    undo: "Undo",
  },
  contacts: {
    sectionLabel: "Enrolled contacts",
    enroll: "Enrol contacts",
    searchLabel: "Search enrolled contacts",
    searchPlaceholder: "Search by email or name",
    statusLabel: "Filter by status",
    statusPlaceholder: "Any status",
    statusEmpty: "No status matches",
    count: (count: number, more: boolean) =>
      `${more ? "First " : ""}${plural(count, "contact", "contacts")}`,
    columns: {
      contact: "Contact",
      status: "Status",
      mailbox: "Mailbox",
      next: "Next step",
      lastSent: "Last sent",
      actions: "Actions",
    },
    noMailbox: "Not assigned yet",
    nextStep: (position: number) => `Step ${position}`,
    noNext: "None",
    waitingForWindow: "When the window opens",
    never: "Never",
    emptyTitle: "No contacts enrolled",
    emptyBody:
      "Enrol contacts from a list or a segment. Each one starts at the first step and moves on by themselves.",
    noMatchTitle: "No contacts match",
    noMatchBody: "Try a different search or status, or clear the filters.",
    loadFailedTitle: "Could not load the enrolled contacts.",
    loadFailedBody: "The API did not answer. Try again.",
    loadMoreFailed: "Could not load more contacts",
    actionsFor: (email: string) => `Actions for ${email}`,
    view: "View messages",
    pause: "Pause",
    resume: "Resume",
    remove: "Remove from sequence",
    paused: (email: string) => `Paused ${email}`,
    resumed: (email: string) => `Resumed ${email}`,
    removed: (email: string) => `Removed ${email} from the sequence`,
    actionFailed: (email: string) => `Could not update ${email}`,
    removeDialog: {
      title: (email: string) => `Remove ${email} from this sequence?`,
      body: "They get no further emails from it. What was already sent stays in their history. To send to them again you would have to enrol them again.",
      cancel: "Cancel",
      confirm: "Remove contact",
    },
  },
  enroll: {
    title: "Enrol contacts",
    description:
      "Choose who starts this sequence. Contacts already in it, and anyone on the suppression list, are skipped.",
    draftNote:
      "This sequence is not active yet. Enrolled contacts wait and start once you activate it.",
    cancel: "Cancel",
    submit: "Enrol contacts",
    submitCount: (count: number) =>
      `Enrol ${plural(count, "contact", "contacts")}`,
    incomplete: "Choose who to enrol.",
    empty: "Nobody matches this choice, so there is nothing to enrol.",
    failed: "Could not enrol contacts",
    queued: "Enrolment is running in the background",
    queuedBody:
      "Contacts appear here as they are added. This can take a minute for a large audience.",
    done: (count: number) => `Enrolled ${plural(count, "contact", "contacts")}`,
    doneBody: (already: number, suppressed: number) => {
      const parts: string[] = [];
      if (already > 0) {
        parts.push(`${countFormat.format(already)} already enrolled`);
      }
      if (suppressed > 0) {
        parts.push(`${countFormat.format(suppressed)} suppressed`);
      }
      return parts.length > 0 ? `Skipped: ${parts.join(", ")}.` : undefined;
    },
  },
  enrollment: {
    description: (status: string) => `Status: ${status}`,
    facts: {
      mailbox: "Mailbox",
      enrolled: "Enrolled",
      next: "Next step",
      finished: "Finished",
      reason: "Reason",
    },
    messages: "Messages",
    step: (position: number) => `Step ${position}`,
    deletedStep: "Deleted step",
    noSubject: "No subject",
    sent: "Sent",
    opened: "Opened",
    clicked: "Clicked",
    replied: "Replied",
    notSent: "Not sent yet",
    noMessages: "Nothing has been sent to this contact from this sequence yet.",
    loadFailed: "Could not load this contact's messages.",
    retry: "Try again",
    loading: "Loading messages",
  },
  ai: {
    open: "Generate with AI",
    title: "Generate a sequence with AI",
    description:
      "Describe the outreach and get a first draft of every email. You review and edit it before anything is created.",
    setup: {
      title: "AI is not set up for this workspace",
      body: "Connect a model provider first. After that you can draft a whole sequence from a short brief, and nothing is created until you review it.",
      link: "Open AI settings",
      close: "Close",
    },
    brief: {
      prompt: "What are you offering?",
      promptPlaceholder:
        "A scheduling tool for dental clinics that cuts no-shows by sending text reminders. Free for the first 30 days, set up in an afternoon.",
      promptMissing: "Describe what you are offering first.",
      promptCounter: (count: number, max: number) =>
        `${countFormat.format(count)} / ${countFormat.format(max)}`,
      audience: "Who are you writing to?",
      audiencePlaceholder: "Practice managers at clinics with 3 to 10 dentists",
      audienceHint:
        "Optional. Role, kind of company, and what they care about.",
      goal: "The one thing you want them to do",
      goalPlaceholder: "Choose a goal",
      goalEmpty: "No goal matches",
      goals: {
        reply: "Reply to the email",
        call: "Book a call",
        trial: "Start a trial",
        link: "Open a link",
        custom: "Something else",
      },
      customGoal: "Describe the goal",
      customGoalPlaceholder: "Forward the email to whoever runs the front desk",
      customGoalMissing: "Describe the goal, or choose one from the list.",
      steps: "Number of emails",
      stepsOption: (count: number) => `${count} emails`,
      tone: "Tone",
      tonePlaceholder: "Choose a tone",
      toneEmpty: "No tone matches",
      tones: {
        friendly: "Friendly",
        professional: "Professional",
        direct: "Direct",
        casual: "Casual",
        custom: "Something else",
      },
      customTone: "Describe the tone",
      customTonePlaceholder: "Dry, a little self-deprecating",
      customToneMissing: "Describe the tone, or choose one from the list.",
      generate: "Generate sequence",
      viewDraft: "Back to the draft",
      cancel: "Cancel",
    },
    result: {
      name: "Sequence name",
      namePlaceholder: "Dental clinics, reminders trial",
      nameMissing: "Give the sequence a name.",
      nameTooLong: (max: number) => `Use ${max} characters or fewer.`,
      nameTaken:
        "Another sequence already uses this name. Choose a different one.",
      waitingForName: "Waiting for a name",
      progress: (current: number, total: number) =>
        `Writing email ${current} of ${total}`,
      starting: "Starting the draft",
      words: (count: number) => `${plural(count, "word", "words")} so far`,
      stopped: "Stopped. The last email may be cut short, so check it.",
      done: (count: number) => `${plural(count, "email", "emails")} drafted`,
      stepsLabel: "Drafted emails",
      emailNumber: (position: number) => `Email ${position}`,
      subject: "Subject",
      subjectPlaceholder: "A short, specific subject",
      subjectMissing:
        "The first email starts the thread, so it needs a subject.",
      noSubject: "No subject yet",
      replyNote: "Sent as a reply in the same thread",
      wait: "Wait before sending",
      body: "Email text",
      bodyHint:
        "Leave an empty line between paragraphs. Start lines with a dash for a list. Links stay attached to their words.",
      bodyMissing: "This email is empty. Write something or remove it.",
      writing: "Writing",
      edit: "Edit",
      editLabel: (position: number) => `Edit email ${position}`,
      doneEditing: "Done",
      remove: "Remove",
      removeLabel: (position: number) => `Remove email ${position}`,
      mergeNote:
        "Merge tags such as {{first_name}} are shown as written. They are filled in for each contact when the email is sent.",
      empty:
        "The AI returned no emails. Try again, or go back and say more about the offer.",
      noSteps: "Every email was removed. Regenerate, or go back to the brief.",
      keptAfterError:
        "The emails that arrived before the error are kept below. You can use them or regenerate.",
      stop: "Stop",
      back: "Back to brief",
      regenerate: "Regenerate",
      create: "Create sequence",
      createFailed: "Could not create the sequence",
      created: (name: string) => `Created ${name}`,
      createdBody:
        "The emails were saved as templates. Nothing is sent until you activate the sequence.",
      stepRejected: (position: number) =>
        `Email ${position} was not accepted. Check its text and try again.`,
    },
    discard: {
      title: "Discard your edits?",
      regenerateBody:
        "Regenerating writes every email again and replaces the changes you made to this draft.",
      closeBody:
        "This draft has not been created yet. Closing discards it and the changes you made.",
      cancel: "Keep editing",
      regenerate: "Regenerate",
      close: "Discard draft",
    },
    errors: {
      notConfigured:
        "AI is not set up for this workspace. Add a provider in AI settings, then try again.",
      rateLimited:
        "Too many AI requests in the last minute. Wait a moment, then try again.",
      provider:
        "The AI provider returned an error. Check the base URL, model and key in AI settings, or try again.",
      validation:
        "The brief was too long or incomplete. Shorten it and try again.",
      forbidden: "You do not have permission to use this.",
      network:
        "The server did not answer. Check your connection and that the API is running.",
      empty:
        "The AI returned nothing usable. Try again, or go back and say more about the offer.",
      fallback: "The AI request failed. Try again in a moment.",
    },
  },
  settings: {
    sending: {
      title: "Mailboxes",
      description:
        "Contacts are spread across these mailboxes. Each contact stays with one mailbox so the thread stays together.",
      sources: "Send from",
      sourcesPlaceholder: "Choose mailboxes",
      sourcesMissing:
        "Choose at least one mailbox, or the sequence cannot send.",
      noInbox: (names: string) =>
        `Replies cannot be detected for ${names}, because that source cannot read its inbox. Contacts who reply there keep getting follow-ups.`,
      fromName: "From name",
      fromNamePlaceholder: "Each mailbox's own name",
      fromNameHint:
        "Shown to the recipient. Leave empty to use each mailbox's own name.",
      fromNameTooLong: (max: number) => `Use ${max} characters or fewer.`,
      fromEmail: "From address",
      fromEmailPlaceholder: "you@yourdomain.com",
      fromEmailHint:
        "Used only by sources that have no fixed address of their own, such as an email provider account. Mailboxes always send from their own address.",
      fromEmailInvalid: "Enter one email address, such as you@yourdomain.com.",
      fromEmailNeeded: (names: string, count: number) =>
        count === 1
          ? `${names} has no address of its own, so this sequence needs a from address on a domain verified with that provider.`
          : `${names} have no address of their own, so this sequence needs a from address on a domain verified with those providers.`,
      dailyLimit: "Daily limit per mailbox",
      dailyLimitPlaceholder: "No limit",
      dailyLimitHint:
        "The most emails this sequence sends from one mailbox in a day. Leave empty for no limit beyond the mailbox's own.",
      dailyLimitInvalid: (max: number) =>
        `Enter a whole number from 1 to ${countFormat.format(max)}, or leave it empty.`,
      dailyLimitSuffix: "emails a day",
    },
    window: {
      title: "Sending window",
      description:
        "Steps that come due outside the window wait for it to open.",
      days: "Days",
      dayShort: weekdayShort,
      dayLong: weekdayLong,
      daysMissing: "Choose at least one day.",
      start: "From",
      end: "Until",
      timeInvalid: "Enter a time.",
      endBeforeStart: "The end time must be later than the start time.",
      timezone: "Timezone",
      timezonePlaceholder: "Search timezones",
      timezoneEmpty: "No timezone matches",
      timezoneMissing: "Choose a timezone.",
      timezoneHint:
        "The window opens and closes on this clock, daylight saving included.",
      useBrowser: (zone: string) => `Use ${zone}`,
    },
    behavior: {
      title: "Replies and tracking",
      description:
        "These apply to every step and save as soon as you change them.",
      stopOnReply: "Stop when a contact replies",
      stopOnReplyHint:
        "A reply ends the sequence for that contact, so nobody gets a follow-up after answering.",
      trackOpens: "Track opens",
      trackOpensHint: "Adds a tiny image to each email to see who opened it.",
      trackClicks: "Track clicks",
      trackClicksHint: "Rewrites links so clicks can be counted.",
      trackingNote:
        "Tracking can hurt deliverability for one-to-one outreach, because tracked mail looks less like a personal email. It is off by default for sequences.",
    },
    save: "Save changes",
    saved: "Settings saved",
    saveFailed: "Could not save the settings",
    switchFailed: "Could not change the setting",
  },
};

const problemTexts: Record<string, string> = {
  no_steps: "Add at least one email step.",
  step_without_template: "This step has no template. Choose one.",
  step_template_empty:
    "This step's template has no content. Write the email in Templates.",
  step_without_subject:
    "This step starts a thread and has no subject. Add one.",
  unknown_merge_tag: "This step uses a merge tag that does not exist.",
  no_sources: "Choose at least one mailbox to send from, in Settings.",
  source_paused:
    "A chosen mailbox is paused. Resume it in Integrations or remove it in Settings.",
  source_needs_attention:
    "A chosen mailbox needs attention. Fix it in Integrations or remove it in Settings.",
  source_without_address:
    "A chosen source has no fixed sending address and this sequence has no from address. Add one in Settings.",
  source_without_inbox:
    "A chosen mailbox cannot read its inbox, so replies to it will not stop the sequence.",
  brand_without_address:
    "Your brand has no postal address. Many countries require one in outreach email.",
  window_short:
    "The sending window is shorter than an hour, so few emails will go out each day.",
};

export function problemText(problem: Pick<Problem, "code" | "message">) {
  return (
    problem.message ||
    problemTexts[problem.code] ||
    "Something about this sequence needs attention."
  );
}

type Failure = { status: number; code: string; message: string | null };

export function describeError(error: Failure) {
  if (error.status === 0) {
    return copy.errors.network;
  }
  if (error.status === 401) {
    return copy.errors.signedOut;
  }
  switch (error.code) {
    case "not_found":
      return copy.errors.notFound;
    case "not_ready":
      return copy.errors.notReady;
    case "sequence_active":
      return copy.errors.sequenceActive;
    case "name_taken":
      return copy.errors.nameTaken;
    case "not_editable":
    case "sequence_archived":
      return copy.errors.archived;
    case "invalid_state":
      return error.message ?? copy.errors.invalidState;
    case "validation":
      return error.message ?? copy.errors.validation;
    default:
      return error.message ?? copy.errors.fallback;
  }
}

export function describeAiError(error: Failure) {
  const text = copy.ai.errors;
  if (error.status === 0) {
    return text.network;
  }
  if (error.status === 401) {
    return copy.errors.signedOut;
  }
  switch (error.code) {
    case "ai_not_configured":
      return text.notConfigured;
    case "ai_rate_limited":
      return text.rateLimited;
    case "ai_provider_error":
      return error.message ?? text.provider;
    case "validation":
      return error.message ?? text.validation;
    case "forbidden":
      return text.forbidden;
    case "empty":
      return text.empty;
    default:
      return text.fallback;
  }
}
