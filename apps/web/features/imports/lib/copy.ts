import type { BadgeTone } from "@/components/status-badge";
import type { FileProblem } from "@/features/imports/lib/file";
import type { ImportStatus } from "@/features/imports/lib/imports";
import type {
  BuiltInTarget,
  MappingProblem,
} from "@/features/imports/lib/mapping";

const countFormat = new Intl.NumberFormat("en-US");

function count(value: number) {
  return countFormat.format(value);
}

function plural(value: number, one: string, many: string) {
  return `${count(value)} ${value === 1 ? one : many}`;
}

export const statusTones: Record<ImportStatus, BadgeTone> = {
  uploaded: "neutral",
  queued: "neutral",
  running: "warning",
  completed: "success",
  failed: "danger",
  cancelled: "neutral",
};

export const statusLabels: Record<ImportStatus, string> = {
  uploaded: "Not started",
  queued: "Queued",
  running: "Importing",
  completed: "Completed",
  failed: "Failed",
  cancelled: "Cancelled",
};

export const targetLabels: Record<BuiltInTarget, string> = {
  email: "Email",
  firstName: "First name",
  lastName: "Last name",
  company: "Company",
  jobTitle: "Job title",
  phone: "Phone",
  city: "City",
  country: "Country",
  timezone: "Time zone",
};

export const copy = {
  title: "Import contacts",
  description:
    "Add or update contacts from a CSV file. You choose which columns to import before anything is saved.",
  metaTitle: "Import contacts",
  count,
  days: { today: "Today", yesterday: "Yesterday" },
  wizard: {
    label: "Import a file",
    back: "Back",
    next: "Continue",
  },
  steps: {
    label: "Import steps",
    done: "done",
    titles: ["Choose a file", "Upload", "Match columns", "Options and start"],
  },
  file: {
    heading: "Choose a file",
    guidance:
      "Use a CSV file whose first row contains the column names, with one contact per row. A column of email addresses is required. Every other column is optional, and you choose what to import in the next steps.",
    drop: "Drop a CSV file here, or click to choose one",
    dropHint: "CSV, TSV or TXT, up to 50 MB",
    dropActive: "Drop the file to select it",
    replace: "Click or drop another file to replace it",
    chosen: (name: string, size: string) => `Selected file: ${name}, ${size}`,
    inputLabel: "CSV file",
    sample: "Download a sample file",
    sampleName: "opencadence-contacts-sample.csv",
    sampleRows: [
      [
        "email",
        "first_name",
        "last_name",
        "company",
        "job_title",
        "phone",
        "city",
        "country",
        "timezone",
      ],
      [
        "ada@example.com",
        "Ada",
        "Moreno",
        "Example Bakery",
        "Owner",
        "+1 555 0100",
        "Lisbon",
        "Portugal",
        "Europe/Lisbon",
      ],
      [
        "sam@example.org",
        "Sam",
        "Okafor",
        "Example Studio",
        "Head of Sales",
        "+1 555 0101",
        "Toronto",
        "Canada",
        "America/Toronto",
      ],
    ],
    problems: {
      empty:
        "This file is empty. Choose a file with a header row and at least one contact.",
      too_large:
        "This file is larger than 50 MB. Split it into smaller files and import them one at a time.",
      wrong_type:
        "This file type is not supported. Export your contacts as a CSV file and choose that.",
    } as Record<FileProblem, string>,
    several: "Choose one file at a time.",
  },
  upload: {
    heading: "Upload",
    reading: "Reading the file",
    sending: "Uploading the file",
    finishing: "Checking the header row",
    progressLabel: "Upload progress",
    parts: (sent: number, total: number) =>
      `${count(sent)} of ${plural(total, "part", "parts")}`,
    keepOpen: "Keep this tab open until the upload finishes.",
    cancel: "Cancel upload",
    failedTitle: "The file was not uploaded.",
    unreadable:
      "The browser could not read this file. Check that it still exists and is not open in another program, then choose it again.",
    retry: "Try again",
    chooseAnother: "Choose another file",
  },
  mapping: {
    heading: "Match columns",
    guidance:
      "Choose where each column in your file goes. Columns set to Do not import are left out.",
    columns: {
      column: "Column in your file",
      target: "Import as",
    },
    unnamed: (position: number) => `Column ${position} (no name)`,
    noSamples: "No values in the first rows",
    targetFor: (column: string) => `Import ${column} as`,
    targetPlaceholder: "Search fields",
    targetEmpty: "No field matches. Clear the box to see all.",
    skip: "Do not import",
    inUse: "In use",
    repeated:
      "Another column has the same name, so this one cannot be matched on its own. Rename it in the file to import it.",
    matched: (matched: number, total: number) =>
      `${count(matched)} of ${plural(total, "column", "columns")} matched`,
    problems: {
      missing_email:
        "No column is matched to Email. Choose Email for the column that holds the email addresses.",
      repeated_target:
        "Two columns are matched to the same field. Match each field to one column only.",
    } as Record<MappingProblem, string>,
    emailMatched: (column: string) => `Email comes from the column ${column}.`,
    fieldsHelp: {
      before: "Need a field that is not listed? Create a custom field under ",
      link: "Contacts",
      after:
        ", Fields. This upload is kept, so you can pick it up again from Recent imports.",
    },
    chooseAnother: "Choose another file",
  },
  options: {
    heading: "Options and start",
    update: "Update contacts that already exist",
    updateHints: {
      on: "On: a row whose email address is already a contact updates that contact with the values in the file.",
      off: "Off: a row whose email address is already a contact is skipped, and that contact is left as it is.",
    },
    lists: "Add to lists",
    listsHint:
      "Imported contacts are added to these lists as subscribed. A contact who unsubscribed from a list stays unsubscribed.",
    listsPlaceholder: "Search lists",
    listsEmpty: "No list matches.",
    noLists: "There are no lists in this workspace yet.",
    tags: "Add tags",
    tagsHint: "These tags are added to every contact in the file.",
    tagsPlaceholder: "Search tags",
    tagsEmpty: "No tag matches.",
    noTags: "There are no tags in this workspace yet.",
    optional: "Optional",
    summary: "Summary",
    summaryFile: "File",
    summaryMatched: "Matched columns",
    summarySkipped: "Columns left out",
    fileValue: (name: string, size: string) => `${name} (${size})`,
    matchedValue: (matched: number, total: number) =>
      `${count(matched)} of ${count(total)}`,
    skippedNone: "None",
    skippedMore: (names: string, more: number) =>
      `${names} and ${count(more)} more`,
    suppression:
      "Addresses on the suppression list are imported like any other contact, but OpenCadence will still not email them.",
    start: "Start import",
    startFailed: "The import was not started.",
  },
  progress: {
    heading: (name: string) => `Importing ${name}`,
    finishedHeading: (name: string) => `Import of ${name}`,
    label: "Rows processed",
    rows: (processed: number, total: number, estimated: boolean) =>
      total > 0
        ? `${count(processed)} of ${estimated ? "about " : ""}${plural(total, "row", "rows")}`
        : `${plural(processed, "row", "rows")} processed`,
    counts: {
      created: "Created",
      updated: "Updated",
      skipped: "Skipped",
      errors: "Errors",
    },
    queued:
      "Waiting for the import to begin. If it stays queued for more than a minute, check that the worker process is running.",
    running: "You can leave this page. The import keeps going on the server.",
    stale: "Could not refresh the status. Trying again every few seconds.",
    cancel: "Cancel import",
    completed: (created: number, updated: number) =>
      `The import finished. ${plural(created, "contact was", "contacts were")} created and ${plural(updated, "was", "were")} updated.`,
    completedSkipped: (skipped: number) =>
      `${plural(skipped, "row was", "rows were")} skipped.`,
    completedErrors: (errors: number) =>
      `${plural(errors, "row", "rows")} could not be imported. Download them, fix the values in the error column, and import that file again.`,
    cancelled:
      "This import was cancelled. Rows processed before that stay imported.",
    failedTitle: "The import stopped before it finished.",
    failedFallback: "The server did not report a reason.",
    failedNext:
      "Rows processed before the failure stay imported. Fix the problem, then import the file again with Update contacts that already exist turned on, so the rows that were already imported are updated and not duplicated.",
    viewContacts: "View contacts",
    downloadErrors: "Download rows with errors",
    another: "Import another file",
  },
  cancelDialog: {
    title: (name: string) => `Cancel the import of ${name}?`,
    body: "Rows that were already processed stay imported. The rest of the file is not imported.",
    confirm: "Cancel import",
    keep: "Keep importing",
    failed: "Could not cancel the import",
    done: (name: string) => `The import of ${name} was cancelled`,
  },
  recent: {
    title: "Recent imports",
    description: "The 50 most recent imports in this workspace.",
    columns: {
      file: "File",
      status: "Status",
      progress: "Progress",
      created: "Created",
      updated: "Updated",
      skipped: "Skipped",
      errors: "Errors",
      started: "Started",
      actions: "Actions",
    },
    progress: (processed: number, total: number) =>
      total > 0 ? `${count(processed)} of ${count(total)}` : count(processed),
    progressLabel: (name: string) => `Rows processed for ${name}`,
    unnamed: "Unnamed file",
    resume: "Continue",
    resumeFor: (name: string) => `Continue the import of ${name}`,
    errorsFor: (name: string) => `Download rows with errors for ${name}`,
    emptyTitle: "No imports yet",
    emptyBody: "Files you import will be listed here with their results.",
    loadFailed: {
      title: "Could not load recent imports.",
      body: "The server did not answer. Check that the API is running, then try again.",
      retry: "Try again",
    },
  },
  catalogFailed: {
    title: "Could not load your lists, tags and custom fields.",
    body: "They are needed to match columns. Check that the API is running, then try again.",
    retry: "Try again",
  },
  errors: {
    network:
      "The server did not answer. Check your connection and that the API is running.",
    signedOut:
      "You are signed out or have no active workspace. Reload the page and sign in again.",
    fallback: "Nothing was changed. Try again in a moment.",
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
  return error.message ?? copy.errors.fallback;
}
