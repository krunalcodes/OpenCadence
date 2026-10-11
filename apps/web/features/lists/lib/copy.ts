const countFormat = new Intl.NumberFormat("en-US");

export const copy = {
  title: "Lists",
  description:
    "A list is a group of contacts who chose to receive something. A contact can be subscribed to one list and unsubscribed from another.",
  add: "New list",
  count: (count: number) => countFormat.format(count),
  columns: {
    name: "Name",
    subscribed: "Subscribed",
    unsubscribed: "Unsubscribed",
    created: "Created",
    actions: "Actions",
  },
  days: { today: "Today", yesterday: "Yesterday" },
  actionsFor: (name: string) => `Actions for ${name}`,
  publicBadge: "In preference centre",
  menu: {
    view: "View contacts",
    edit: "Rename and describe",
    remove: "Delete",
  },
  emptyTitle: "No lists yet",
  emptyBody:
    "Lists keep track of who agreed to receive what, such as a newsletter or product updates. Create one, then add contacts to it.",
  loadFailed: {
    title: "Could not load your lists.",
    body: "The server did not answer. Check that the API is running, then try again.",
    retry: "Try again",
  },
  sheet: {
    createTitle: "New list",
    createDescription:
      "Name the list after what its contacts agreed to receive.",
    editTitle: "Rename and describe",
    editDescription: (name: string) =>
      `Change the name or description of ${name}. Its contacts stay as they are.`,
    name: "Name",
    namePlaceholder: "Monthly newsletter",
    nameMissing: "Give the list a name.",
    description: "Description",
    optional: "Optional",
    descriptionPlaceholder: "What contacts on this list receive",
    isPublic: "Show in the preference centre",
    isPublicHint:
      "People can join or leave this list themselves from the preferences link in your emails. Lists that are not shown only appear to people already subscribed to them.",
    publicName: "Public name",
    publicNameHint:
      "What subscribers see. Leave it empty to show the list name.",
    publicDescription: "Public description",
    publicDescriptionPlaceholder: "One email a month with our best articles",
    publicDescriptionHint:
      "A line under the name that tells people what they will get.",
    create: "Create list",
    save: "Save changes",
    cancel: "Cancel",
  },
  deleteDialog: {
    title: (name: string) => `Delete ${name}?`,
    body: "The contacts on this list are kept. Only their membership of this list is removed, including who subscribed and who unsubscribed.",
    confirm: "Delete list",
    cancel: "Cancel",
  },
  toasts: {
    created: (name: string) => `${name} was created`,
    createFailed: "Could not create the list",
    saved: (name: string) => `${name} was saved`,
    saveFailed: "Could not save the list",
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
