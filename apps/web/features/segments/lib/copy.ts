const countFormat = new Intl.NumberFormat("en-US");

export const copy = {
  title: "Segments",
  description:
    "A segment is a saved filter. Contacts enter and leave it automatically as their details change.",
  add: "New segment",
  count: (count: number) => countFormat.format(count),
  columns: {
    name: "Name",
    rules: "Rules",
    contacts: "Contacts",
    updated: "Updated",
    actions: "Actions",
  },
  days: { today: "Today", yesterday: "Yesterday" },
  actionsFor: (name: string) => `Actions for ${name}`,
  menu: {
    view: "View contacts",
    edit: "Edit",
    duplicate: "Duplicate",
    remove: "Delete",
  },
  needsFixing: "Needs fixing",
  needsFixingFallback:
    "A condition in this segment no longer applies. Edit the segment and save it again.",
  needsFixingDetail: (detail: string) => `Needs fixing: ${detail}`,
  countFailed: "Not available",
  countFailedDetail: "The contact count could not be loaded.",
  countLoading: "Counting contacts",
  emptyTitle: "No segments yet",
  emptyBody:
    "A segment groups contacts by rules you choose, such as everyone at one company or everyone added in the last 30 days. It stays up to date on its own.",
  loadFailed: {
    title: "Could not load your segments.",
    body: "The server did not answer. Check that the API is running, then try again.",
    retry: "Try again",
  },
  duplicateName: (name: string) => `${name} copy`,
  sheet: {
    createTitle: "New segment",
    editTitle: "Edit segment",
    duplicateTitle: "Duplicate segment",
    description:
      "Choose the rules a contact must match. The segment updates on its own as contacts change.",
    name: "Name",
    namePlaceholder: "Active subscribers",
    nameMissing: "Give the segment a name.",
    descriptionLabel: "Description",
    optional: "Optional",
    descriptionPlaceholder: "Who this segment is for",
    rules: "Rules",
    rulesIncomplete: "Finish every condition before saving.",
    rulesEmpty: "Add at least one condition before saving.",
    create: "Create segment",
    save: "Save changes",
    cancel: "Cancel",
  },
  preview: {
    title: "Preview",
    idle: "Finish the conditions above to see who matches.",
    loading: "Loading the preview",
    matches: (count: number) =>
      `${countFormat.format(count)} ${count === 1 ? "contact matches" : "contacts match"}`,
    none: "No contacts match these rules right now.",
    sampleNote: (shown: number) =>
      `Showing the ${countFormat.format(shown)} most recently added.`,
    sampleLabel: "Sample of matching contacts",
    rejected: "These rules cannot be used yet.",
    failed: "Could not load the preview.",
  },
  deleteDialog: {
    title: (name: string) => `Delete ${name}?`,
    body: "The saved filter is removed. The contacts it matched are not affected.",
    confirm: "Delete segment",
    cancel: "Cancel",
  },
  toasts: {
    created: (name: string) => `${name} was created`,
    createFailed: "Could not create the segment",
    saved: (name: string) => `${name} was saved`,
    saveFailed: "Could not save the segment",
    deleted: (name: string) => `${name} was deleted`,
    deleteFailed: (name: string) => `Could not delete ${name}`,
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
