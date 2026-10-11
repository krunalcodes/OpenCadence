import type { BadgeTone } from "@/components/status-badge";
import type {
  FormStatus,
  SettingKey,
  SubmissionStatus,
} from "@/features/forms/lib/forms";

const countFormat = new Intl.NumberFormat("en-US");
const percentFormat = new Intl.NumberFormat("en-US", {
  style: "percent",
  maximumFractionDigits: 0,
});

export const statusLabels: Record<FormStatus, string> = {
  draft: "Draft",
  published: "Published",
  archived: "Archived",
};

export const statusTones: Record<FormStatus, BadgeTone> = {
  draft: "neutral",
  published: "success",
  archived: "neutral",
};

export const submissionLabels: Record<SubmissionStatus, string> = {
  pending: "Waiting for confirmation",
  confirmed: "Confirmed",
  subscribed: "Subscribed",
  rejected: "Rejected",
};

export const submissionTones: Record<SubmissionStatus, BadgeTone> = {
  pending: "warning",
  confirmed: "success",
  subscribed: "success",
  rejected: "danger",
};

export const fieldNames: Record<string, string> = {
  email: "Email",
  first_name: "First name",
  last_name: "Last name",
  company: "Company",
  job_title: "Job title",
  phone: "Phone",
  city: "City",
  country: "Country",
};

export const copy = {
  title: "Forms",
  description:
    "A form lets people subscribe themselves. Share its link, or put it on your website, and new subscribers go straight onto the lists you choose.",
  add: "New form",
  untitled: "Untitled form",
  none: "–",
  number: (count: number) => countFormat.format(count),
  percent: (rate: number) => percentFormat.format(rate),
  days: { today: "Today", yesterday: "Yesterday" },
  count: (count: number) =>
    count === 1 ? "1 form" : `${countFormat.format(count)} forms`,
  columns: {
    name: "Name",
    status: "Status",
    lists: "Lists",
    submissions: "Submissions",
    confirmed: "Confirmed",
    rate: "Rate",
    actions: "Actions",
  },
  noLists: "No lists chosen",
  moreLists: (count: number) => `+${count} more`,
  doubleOptInOff: "Double opt-in is off",
  actionsFor: (name: string) => `Actions for ${name}`,
  menu: {
    edit: "Edit",
    copyLink: "Copy link",
    open: "Open form",
    publish: "Publish",
    unpublish: "Unpublish",
    archive: "Archive",
    remove: "Delete",
  },
  emptyTitle: "No forms yet",
  emptyBody:
    "Create a form to collect subscribers from your website or a shared link. Each one adds people to the lists you pick.",
  loadFailed: {
    title: "Could not load your forms.",
    body: "The server did not answer. Check that the API is running, then try again.",
    retry: "Try again",
  },
  nameDialog: {
    createTitle: "New form",
    createDescription:
      "The name is only for you and your team. Visitors see the title you write in the form.",
    name: "Name",
    namePlaceholder: "Newsletter sign-up",
    nameMissing: "Give the form a name.",
    nameTooLong: (max: number) => `Use ${max} characters or fewer.`,
    nameTaken: "Another form already has this name. Choose a different one.",
    create: "Create form",
    cancel: "Cancel",
  },
  deleteDialog: {
    title: (name: string) => `Delete ${name}?`,
    body: "The form, its link and its record of submissions are deleted. Contacts who subscribed through it stay on their lists.",
    confirm: "Delete form",
    cancel: "Cancel",
  },
  archiveDialog: {
    title: (name: string) => `Archive ${name}?`,
    body: "The link and any copy on your website stop accepting new subscribers. The submissions are kept.",
    confirm: "Archive form",
    cancel: "Cancel",
  },
  toasts: {
    createFailed: "Could not create the form",
    published: (name: string) => `${name} is published`,
    publishFailed: (name: string) => `Could not publish ${name}`,
    unpublished: (name: string) => `${name} is no longer published`,
    unpublishFailed: (name: string) => `Could not unpublish ${name}`,
    undo: "Undo",
    archived: (name: string) => `${name} was archived`,
    archiveFailed: (name: string) => `Could not archive ${name}`,
    deleted: (name: string) => `${name} was deleted`,
    deleteFailed: (name: string) => `Could not delete ${name}`,
    linkCopied: "Link copied",
  },
  clipboard: {
    failed: "Could not copy",
    failedBody:
      "Your browser blocked access to the clipboard. Select the text and copy it yourself.",
  },
  unavailable: {
    back: "Forms",
    title: "This form could not be opened.",
    body: "It may have been deleted, or the server did not answer.",
    retry: "Try again",
  },
  editor: {
    nameLabel: "Form name",
    namePlaceholder: "Form name",
    nameMissing: "Give the form a name. Your other changes are saved.",
    status: {
      saved: "All changes saved",
      dirty: "Unsaved changes",
      saving: "Saving",
      failed: "Not saved",
    },
    saveNow: "Save now",
    saveFailed: "Could not save the form",
    fieldRejected: "This value was not accepted.",
    leaveConfirm:
      "This form has changes that are not saved yet. Leave without saving them?",
    tabsLabel: "Form sections",
    tabs: {
      build: "Build",
      share: "Share",
      submissions: "Submissions",
    },
    publish: "Publish",
    publishAgain: "Publish again",
    unpublish: "Unpublish",
    moreActions: "More actions",
    openForm: "Open form",
    archivedNote: {
      title: "This form is archived",
      body: "Its link does not accept new subscribers. Publish it again to edit it and take submissions.",
    },
    liveNote:
      "This form is published. Changes go live as soon as they are saved.",
    refused: {
      publishTitle: "The form was not published",
      saveTitle: "This change was not saved",
      saveBody:
        "The form is published, and this change would stop it working. Fix what is listed here, or unpublish the form first.",
      unsaved: "Some changes could not be saved. Fix them, then publish again.",
      chooseLists: "Choose lists",
      chooseSource: "Choose a source",
      openSources: "Open sending sources",
      enterFrom: "Enter a From address",
      problems: {
        no_lists:
          "Choose at least one list, so new subscribers have somewhere to go.",
        no_source:
          "Double opt-in sends a confirmation email, and there is no sending source to send it. Connect a source, set a default one, or choose one for this form.",
        source_missing:
          "The sending source chosen for the confirmation email no longer exists. Choose another one.",
        source_paused:
          "The sending source for the confirmation email is paused. Resume it, or choose another one.",
        source_needs_attention:
          "The sending source for the confirmation email needs attention before it can send. Fix it on the Integrations page, or choose another one.",
        from_missing:
          "This sending source has no fixed address. Enter a From address on a domain that is verified in that account.",
      } as Record<string, string>,
    },
    audience: {
      title: "Lists and consent",
      description: "Where new subscribers go, and how they confirm",
      lists: "Add subscribers to",
      listsPlaceholder: "Choose lists",
      listsEmpty: "No list matches",
      listsHint:
        "Everyone who signs up is subscribed to all of these lists. A form needs at least one list before it can be published.",
      noListsYet: "You have no lists yet.",
      missingList: "Deleted list",
      createList: "Create a list",
      doubleOptIn: "Double opt-in",
      doubleOptInHint:
        "New subscribers get an email and must click a link before they are added. This proves the address is real and belongs to them, which protects your sender reputation.",
      warningTitle: "Without double opt-in, anyone can add any address",
      warningBody:
        "Typos, bots and people entering someone else's email all land on your lists. Mailbox providers treat unconfirmed lists as a risk, so expect more bounces and spam complaints.",
    },
    fields: {
      title: "Fields",
      description: "What the form asks for",
      listLabel: "Form fields",
      label: (name: string) => `Label for ${name}`,
      labelPlaceholder: "Label shown on the form",
      labelMissing: "Write a label, so people know what to enter.",
      required: "Required",
      requiredFor: (name: string) => `${name} is required`,
      emailLocked: "Always first and always required",
      moveUp: (name: string) => `Move ${name} up`,
      moveDown: (name: string) => `Move ${name} down`,
      remove: (name: string) => `Remove ${name}`,
      moved: (name: string, position: number, total: number) =>
        `${name} moved to position ${position} of ${total}`,
      added: (name: string) => `${name} added`,
      removed: (name: string) => `${name} removed`,
      unknown: "This contact field no longer exists. Remove it from the form.",
      add: "Add a field",
      addPlaceholder: "Add a contact field",
      addEmpty: "No field matches",
      allAdded: "Every contact field is already on the form.",
      limit: (max: number) =>
        `A form can have up to ${max} fields. Remove one to add another.`,
      hint: "Ask for as little as you can. Every extra field means fewer people finish the form.",
      custom: "Custom field",
      rejected: "The fields were not accepted.",
    },
    texts: {
      title: "Texts",
      description: "What visitors read on the form",
      labels: {
        title: "Title",
        description: "Description",
        buttonLabel: "Button label",
        consentText: "Consent text",
        successTitle: "Title after signing up",
        successMessage: "Message after signing up",
        confirmSubject: "Subject of the confirmation email",
      } satisfies Record<SettingKey, string>,
      consentHint:
        "Shown above the button and stored with every submission as proof of what the person agreed to.",
      emptyHint: "Leave a text empty to use the standard wording.",
    },
    after: {
      title: "After signing up",
      description: "What people see once the form is sent",
      redirectUrl: "Send people to your own page",
      redirectPlaceholder: "https://example.com/thanks",
      redirectHint:
        "Optional. Leave it empty to show the title and message above. A form placed on your website with the iframe always shows the message in place.",
      redirectInvalid:
        "Enter a full web address that starts with https:// or http://.",
      doubleOptInHint:
        "Double opt-in is on, so use these texts to tell people to check their inbox and confirm.",
    },
    confirmation: {
      title: "Confirmation email",
      description: "Sent to every new subscriber when double opt-in is on",
      source: "Send it from",
      sourceHintDefault: "Leave empty to use the workspace default source.",
      sourceHintNone:
        "No default source is set. Pick the source that should send confirmation emails.",
      sourcePlaceholderDefault: (name: string) => `Default: ${name}`,
      noSources: "No sending source is connected yet.",
      connect: "Connect a source",
      off: "Double opt-in is off, so no confirmation email is sent.",
      subjectHint:
        "Keep it plain, so people recognise the email they just asked for.",
      fromEmail: "From address",
      fromEmailPlaceholder: "hello@example.com",
      fromEmailHint:
        "This source can send from any address on its verified domains, so say which one to use.",
      fromEmailInvalid: "Enter one email address, like hello@example.com.",
      fromFixed: (email: string) => `Sent from ${email}`,
    },
    preview: {
      title: "Preview",
      description: "The hosted form, drawn with your brand",
      viewLabel: "What to preview",
      form: "Form",
      done: "After signing up",
      note: "This is a preview. Nothing you type here is sent.",
      brandLink: "Change the logo, colours and font in Brand settings",
    },
  },
  share: {
    notPublished:
      "This form is not published. The link and the snippets below only start working once you publish it.",
    copy: "Copy",
    copied: "Copied",
    open: "Open",
    link: {
      title: "Hosted link",
      when: "Use the link when you have no website to put the form on, or to share it in an email, a bio or a QR code.",
      label: "Link to the form",
    },
    iframe: {
      title: "Embed on your website",
      when: "Use the iframe to show this exact form on your own page. It updates by itself when you edit the form here.",
      label: "Iframe snippet",
    },
    html: {
      title: "Plain HTML",
      when: "Use the plain HTML to style the form with your own CSS. It works without JavaScript, but you must copy it again after changing the fields.",
      label: "HTML snippet",
    },
    missing: "The server did not send this snippet. Reload the page.",
  },
  submissions: {
    title: "Submissions",
    description: "Everyone who sent this form",
    count: (count: number, more: boolean) =>
      `${countFormat.format(count)}${more ? "+" : ""} shown`,
    statusLabel: "Filter by status",
    statusPlaceholder: "All statuses",
    statusEmpty: "No status matches",
    activeFilters: "Active filters",
    clearAll: "Clear filter",
    removeFilter: (label: string) => `Remove filter ${label}`,
    loading: "Loading submissions",
    columns: {
      email: "Email",
      status: "Status",
      answers: "Answers",
      submitted: "Submitted",
      confirmed: "Confirmed",
    },
    emptyTitle: "No submissions yet",
    emptyBody:
      "People who send the form appear here, with what they entered and whether they confirmed.",
    noMatchTitle: "No submissions with this status",
    noMatchBody: "Clear the filter to see every submission.",
    loadMore: "Load more",
    loadMoreFailed: "Could not load more submissions",
    loadFailed: {
      title: "Could not load the submissions.",
      body: "The server did not answer. Try again in a moment.",
      retry: "Try again",
    },
    answer: (label: string, value: string) => `${label}: ${value}`,
    answers: (items: string[]) => items.join(" · "),
  },
  errors: {
    network:
      "The server did not answer. Check your connection and that the API is running.",
    signedOut:
      "You are signed out or have no active workspace. Reload the page and sign in again.",
    forbidden: "Only workspace owners and admins can do this.",
    notFound: "This form no longer exists. Go back to the list of forms.",
    nameTaken: "Another form already has this name. Choose a different one.",
    notReady:
      "The form is not ready to be published. Choose a list, and a sending source if double opt-in is on.",
    unavailable: "The server could not finish that. Try again in a moment.",
    validation: "One of the values was not accepted. Check it and try again.",
    busy: "Too many requests in a short time. Wait a moment, then try again.",
    fallback: "Nothing was changed. Try again in a moment.",
  },
  public: {
    metaTitle: "Subscribe",
    fallbackTitle: "Subscribe",
    fallbackButton: "Subscribe",
    logoAlt: (name: string) => name,
    selectPlaceholder: "Choose one",
    requiredNote: "Fields marked with * are required.",
    honeypotLabel: "Leave this field empty",
    pending: "Sending",
    doneFallbackTitle: "Thank you",
    problem: {
      title: "The form was not sent",
      invalid: "Check the highlighted field, then send the form again.",
      invalidGeneral:
        "Something you entered was not accepted. Check your answers, then send the form again.",
      busy: "Too many sign-ups came from your network in the last few minutes. Wait a minute, then try again.",
      offline:
        "We could not reach the server, so nothing was saved. Check your connection and try again.",
    },
    fieldErrors: {
      email: "Enter an email address like name@example.com.",
      other: (label: string) => `Check what you entered for ${label}.`,
      missing: (label: string) => `Fill in ${label}.`,
    },
    unavailable: {
      title: "This form is not available",
      body: "It may have been closed, or the link may be incomplete. Ask whoever shared it for a new link.",
    },
    failed: {
      title: "The form could not be loaded",
      busy: "Too many requests came from your network in the last minute. Wait a minute, then reload the page.",
      offline:
        "We could not reach the server. Check your connection and reload the page.",
      retryAction: "Try again",
    },
  },
  confirm: {
    metaTitle: "Confirm your subscription",
    fallbackSender: "this sender",
    ask: {
      title: "Confirm your subscription",
      body: (sender: string) =>
        `Use the button to confirm that you want to get emails from ${sender}.`,
      address: (email: string) => `The emails will be sent to ${email}.`,
      action: "Confirm subscription",
      note: "If you did not sign up, close this page. Nothing happens unless you confirm.",
    },
    confirmed: {
      title: "Your subscription is confirmed",
      body: (sender: string) =>
        `Thank you. You will now get emails from ${sender}. Every email has a link to unsubscribe.`,
    },
    already: {
      title: "You are already confirmed",
      body: (sender: string) =>
        `This address was confirmed earlier. You are getting emails from ${sender}, and there is nothing more to do.`,
    },
    expired: {
      title: "This confirmation link has expired",
      body: "Confirmation links work for 7 days. Fill in the sign-up form again to get a new one.",
    },
    invalid: {
      title: "This link does not work",
      body: "It may be incomplete. Open the confirmation email again and use its button, or fill in the sign-up form once more.",
    },
    failed: {
      title: "We could not confirm that yet",
      busy: "Too many requests came from your network in the last minute. Wait a minute, then try again.",
      offline:
        "We could not reach the server, so nothing was changed. Check your connection and try again.",
      retryAction: "Try again",
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
    case "name_taken":
      return copy.errors.nameTaken;
    case "form_not_ready":
      return error.message ?? copy.errors.notReady;
    case "unavailable":
      return copy.errors.unavailable;
    case "forbidden":
      return copy.errors.forbidden;
    case "not_found":
      return copy.errors.notFound;
    case "rate_limited":
      return copy.errors.busy;
    case "validation":
      return error.message ?? copy.errors.validation;
    default:
      if (error.status === 404) {
        return copy.errors.notFound;
      }
      if (error.status === 403) {
        return copy.errors.forbidden;
      }
      if (error.status === 429) {
        return copy.errors.busy;
      }
      return error.message ?? copy.errors.fallback;
  }
}

type Problem = { code: string; message: string | null };

export function problemText(problem: Problem) {
  if (
    problem.message &&
    (problem.code === "source_paused" ||
      problem.code === "source_needs_attention" ||
      problem.code === "from_missing")
  ) {
    return problem.message;
  }
  return (
    copy.editor.refused.problems[problem.code] ??
    problem.message ??
    copy.errors.notReady
  );
}
