import type {
  BulkAction,
  ContactOrigin,
  FieldType,
  MembershipStatus,
  ProfileKey,
  SuppressedReason,
} from "@/features/contacts/lib/contacts";

const countFormat = new Intl.NumberFormat("en-US");

function contactsCount(count: number) {
  return `${countFormat.format(count)} ${count === 1 ? "contact" : "contacts"}`;
}

export type BulkPickAction = Exclude<BulkAction, "delete">;

export const suppressedLabels: Record<SuppressedReason, string> = {
  bounced: "Hard bounce",
  complained: "Complaint",
  unsubscribed: "Unsubscribed",
  manual: "Blocked",
};

export const suppressedNotes: Record<SuppressedReason, string> = {
  bounced:
    "This address bounced. No email of any kind is sent to it, including transactional email.",
  complained:
    "This person marked an email as spam. No email of any kind is sent to this address, including transactional email.",
  unsubscribed:
    "This person unsubscribed. Campaigns and sequences skip this address. Transactional email still goes out.",
  manual:
    "This address was blocked by hand. No email of any kind is sent to it, including transactional email.",
};

export const originLabels: Record<ContactOrigin, string> = {
  manual: "by hand",
  import: "by an import",
  api: "through the API",
  form: "through a form",
};

export const membershipLabels: Record<MembershipStatus, string> = {
  subscribed: "Subscribed",
  unsubscribed: "Unsubscribed",
};

export const fieldTypeLabels: Record<FieldType, string> = {
  text: "Text",
  number: "Number",
  date: "Date",
  boolean: "Yes or no",
  select: "Choice",
};

export const profileLabels: Record<ProfileKey, string> = {
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
  title: "Contacts",
  description:
    "Everyone in this workspace you can email, with the lists they belong to and the tags you gave them.",
  add: "Add contact",
  import: "Import",
  fields: "Fields",
  searchLabel: "Search contacts",
  searchPlaceholder: "Search email, name or company",
  listLabel: "Filter by list",
  listPlaceholder: "All lists",
  listEmpty: "No list matches. Clear the box to see all.",
  tagLabel: "Filter by tag",
  tagPlaceholder: "All tags",
  tagEmpty: "No tag matches. Clear the box to see all.",
  segmentLabel: "Filter by segment",
  segmentPlaceholder: "Segment",
  segmentEmpty: "No segment matches. Clear the box to see all.",
  segmentNote:
    "This segment's rules decide who is shown, so the other filters are off.",
  editSegment: "Edit segment",
  activeFilters: "Active filters",
  searchChip: (search: string) => `Contains ${search}`,
  listChip: (name: string) => `List: ${name}`,
  tagChip: (name: string) => `Tag: ${name}`,
  segmentChip: (name: string) => `Segment: ${name}`,
  unknownList: "Unknown list",
  unknownTag: "Unknown tag",
  unknownSegment: "Unknown segment",
  removeFilter: (label: string) => `Remove filter: ${label}`,
  clearAll: "Clear all",
  count: contactsCount,
  countLoading: "Counting contacts",
  columns: {
    select: "Select",
    email: "Email",
    name: "Name",
    company: "Company",
    lists: "Lists",
    tags: "Tags",
    added: "Added",
    actions: "Actions",
  },
  days: { today: "Today", yesterday: "Yesterday" },
  none: "-",
  noneLabel: "Not set",
  more: (count: number) => `+${countFormat.format(count)}`,
  unsubscribedNote: "unsubscribed",
  selectAll: "Select all loaded contacts",
  selectRow: (email: string) => `Select ${email}`,
  openRow: (email: string) => `Open ${email}`,
  actionsFor: (email: string) => `Actions for ${email}`,
  edit: "Edit",
  delete: "Delete",
  loadMore: "Load more",
  loadMoreFailed: "Could not load more contacts",
  emptyTitle: "No contacts yet",
  emptyBody:
    "Contacts are the people you email. Add one by hand, or import a CSV file to bring many in at once.",
  noMatchTitle: "No contact matches these filters",
  noMatchBody: "Try a different search, or clear the filters to see everyone.",
  loadFailed: {
    title: "Contacts could not be loaded.",
    body: "Check that the API is running, then try again.",
    retry: "Try again",
  },
  bulk: {
    label: "Bulk actions",
    selected: (count: number) => `${countFormat.format(count)} selected`,
    clear: "Clear selection",
    actions: {
      add_to_lists: "Add to list",
      remove_from_lists: "Remove from list",
      add_tags: "Add tags",
      remove_tags: "Remove tags",
      delete: "Delete",
    } as Record<BulkAction, string>,
    titles: {
      add_to_lists: (count: number) => `Add ${contactsCount(count)} to lists`,
      remove_from_lists: (count: number) =>
        `Remove ${contactsCount(count)} from lists`,
      add_tags: (count: number) => `Add tags to ${contactsCount(count)}`,
      remove_tags: (count: number) =>
        `Remove tags from ${contactsCount(count)}`,
    } as Record<BulkPickAction, (count: number) => string>,
    bodies: {
      add_to_lists:
        "New members join as subscribed. Anyone who unsubscribed from a list stays unsubscribed.",
      remove_from_lists:
        "The contacts are kept. Only their membership of these lists is removed, along with its subscription status.",
      add_tags: "Contacts that already have a tag are left as they are.",
      remove_tags: "The contacts and the tags themselves are kept.",
    } as Record<BulkPickAction, string>,
    pickLabels: {
      add_to_lists: "Lists",
      remove_from_lists: "Lists",
      add_tags: "Tags",
      remove_tags: "Tags",
    } as Record<BulkPickAction, string>,
    confirms: {
      add_to_lists: "Add to lists",
      remove_from_lists: "Remove from lists",
      add_tags: "Add tags",
      remove_tags: "Remove tags",
    } as Record<BulkPickAction, string>,
    missing: {
      add_to_lists: "Choose at least one list.",
      remove_from_lists: "Choose at least one list.",
      add_tags: "Choose at least one tag.",
      remove_tags: "Choose at least one tag.",
    } as Record<BulkPickAction, string>,
    done: {
      add_to_lists: (count: number) => `${contactsCount(count)} added to lists`,
      remove_from_lists: (count: number) =>
        `${contactsCount(count)} removed from lists`,
      add_tags: (count: number) => `Tags added to ${contactsCount(count)}`,
      remove_tags: (count: number) =>
        `Tags removed from ${contactsCount(count)}`,
    } as Record<BulkPickAction, (count: number) => string>,
    failed: "The change could not be applied",
    noLists: "There are no lists yet. Create one on the Lists page first.",
    noTags: "There are no tags yet. Add one from a contact first.",
    cancel: "Cancel",
    deleteTitle: (count: number) => `Delete ${contactsCount(count)}?`,
    deleteBody: (count: number) =>
      `${contactsCount(count)} will be deleted, along with ${count === 1 ? "its" : "their"} list memberships and tags. This cannot be undone. Addresses on the suppression list stay there.`,
    deleteConfirm: (count: number) => `Delete ${contactsCount(count)}`,
    deleted: (count: number) => `${contactsCount(count)} deleted`,
    deleteFailed: "The contacts could not be deleted",
  },
  picker: {
    listsPlaceholder: "Search lists",
    tagsPlaceholder: "Search tags",
    tagsCreatePlaceholder: "Search or create tags",
    listsEmpty: "No list matches.",
    tagsEmpty: "No tag matches.",
    create: (name: string) => `Create tag "${name}"`,
    remove: (name: string) => `Remove ${name}`,
  },
  sheet: {
    addTitle: "Add contact",
    addDescription:
      "Only the email address is required. Everything else can be filled in later.",
    editDescription: "Changes apply when you save.",
    email: "Email",
    emailPlaceholder: "name@example.com",
    emailMissing: "Enter an email address.",
    emailInvalid: "Enter a full email address, like name@example.com.",
    emailTaken: "Another contact already uses this address.",
    profile: "Profile",
    custom: "Custom fields",
    customFailed:
      "Custom fields could not be loaded, so they are not shown here. Reload the page to edit them.",
    timezonePlaceholder: "Search time zones",
    timezoneEmpty: "No time zone matches.",
    selectPlaceholder: "Choose an option",
    selectEmpty: "No option matches.",
    numberInvalid: "Enter a number, like 42 or 3.5.",
    booleanOn: "Yes",
    booleanOff: "No",
    lists: "Lists",
    listsHint: "New members join as subscribed.",
    memberships: "Subscription status by list",
    unsubscribe: "Unsubscribe",
    resubscribe: "Resubscribe",
    resubscribeHint:
      "Only resubscribe someone who asked for it. An unsubscribed member is skipped by every send to that list.",
    newMembership: "Added when you save",
    tags: "Tags",
    tagsHint: "Type a new name and press Enter to create a tag.",
    suppressionLink: "View suppression list",
    added: (date: string, origin: string) => `Added ${date} ${origin}`,
    cancel: "Cancel",
    save: "Save changes",
    create: "Add contact",
    delete: "Delete",
  },
  deleteDialog: {
    title: (email: string) => `Delete ${email}?`,
    body: "The contact is deleted along with its list memberships and tags. This cannot be undone. If the address is on the suppression list, it stays there.",
    cancel: "Cancel",
    confirm: "Delete contact",
  },
  fieldsSheet: {
    title: "Custom fields",
    description:
      "Extra details you keep for every contact. They show in the contact form and can be used in segment rules.",
    counter: (count: number, max: number) =>
      `${countFormat.format(count)} of ${countFormat.format(max)} fields`,
    empty:
      "No custom fields yet. Add one to keep details such as a plan name or a renewal date.",
    add: "Add field",
    addTitle: "New field",
    label: "Label",
    labelPlaceholder: "Plan",
    labelMissing: "Enter a label.",
    type: "Type",
    typePlaceholder: "Search types",
    typeEmpty: "No type matches.",
    typeFixed: "The type cannot be changed after the field is created.",
    options: "Options",
    optionsPlaceholder: "Type an option and press Enter",
    optionsHint: "Separate options with Enter or a comma.",
    optionsList: "Options",
    optionsMissing: "Add at least one option.",
    optionsRemovedHint:
      "Removing an option does not change contacts that already have it.",
    removeOption: (option: string) => `Remove option ${option}`,
    key: "Key",
    keyHint:
      "Used in the API and in imports. It cannot be changed after the field is created.",
    keyInvalid:
      "Use lower-case letters, numbers and underscores, starting with a letter, up to 40 characters.",
    keyTaken: "Another field already uses this key. Choose a different one.",
    limitReached:
      "This workspace has reached 100 custom fields. Delete one to add another.",
    cancel: "Cancel",
    create: "Add field",
    save: "Save",
    rename: "Edit",
    delete: "Delete",
    editTitle: (label: string) => `Edit ${label}`,
    actionsFor: (label: string) => `Actions for ${label}`,
    loadFailed: {
      title: "Custom fields could not be loaded.",
      body: "Check that the API is running, then try again.",
      retry: "Try again",
    },
    deleteTitle: (label: string) => `Delete the field ${label}?`,
    deleteBody:
      "The field is removed from the contact form and from filters. Values already saved on contacts are kept but hidden.",
    deleteConfirm: "Delete field",
  },
  toasts: {
    created: (email: string) => `${email} added`,
    saved: (email: string) => `${email} saved`,
    saveFailed: "The contact could not be saved",
    partial: (email: string) =>
      `${email} was saved, but some list or tag changes were not`,
    deleted: (email: string) => `${email} deleted`,
    deleteFailed: (email: string) => `${email} could not be deleted`,
    tagCreated: (name: string) => `Tag ${name} created`,
    tagFailed: (name: string) => `The tag ${name} could not be created`,
    fieldCreated: (label: string) => `Field ${label} added`,
    fieldSaved: (label: string) => `Field ${label} saved`,
    fieldFailed: "The field could not be saved",
    fieldDeleted: (label: string) => `Field ${label} deleted`,
    fieldDeleteFailed: (label: string) =>
      `The field ${label} could not be deleted`,
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
