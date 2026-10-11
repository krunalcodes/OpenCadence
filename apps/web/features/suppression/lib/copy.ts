import type { BadgeTone } from "@/components/status-badge";
import type {
  AddReason,
  SuppressionOrigin,
  SuppressionReason,
} from "@/features/suppression/lib/suppressions";

const countFormat = new Intl.NumberFormat("en-US");

export const reasonTones: Record<SuppressionReason, BadgeTone> = {
  bounced: "danger",
  complained: "danger",
  unsubscribed: "neutral",
  manual: "neutral",
};

export const reasonLabels: Record<SuppressionReason, string> = {
  bounced: "Hard bounce",
  complained: "Complaint",
  unsubscribed: "Unsubscribed",
  manual: "Blocked by hand",
};

export const originLabels: Record<SuppressionOrigin, string> = {
  user: "Added by a teammate",
  api: "Added by API",
  webhook: "Reported by the provider",
  import: "Imported",
};

export const copy = {
  title: "Suppression list",
  description:
    "Addresses that will not be emailed. Bounces and complaints are added automatically and block every email. Unsubscribes block campaigns and sequences, but not transactional email.",
  add: "Add addresses",
  searchLabel: "Search by email address",
  searchPlaceholder: "Search by email",
  reasonLabel: "Filter by reason",
  reasonPlaceholder: "All reasons",
  reasonEmpty: "No reason matches. Clear the box to see all.",
  activeFilters: "Active filters",
  searchChip: (search: string) => `Starts with ${search}`,
  removeFilter: (label: string) => `Remove filter: ${label}`,
  clearAll: "Clear all",
  count: (shown: number, more: boolean) =>
    more
      ? `Latest ${countFormat.format(shown)} addresses`
      : `${countFormat.format(shown)} ${shown === 1 ? "address" : "addresses"}`,
  columns: {
    email: "Email",
    reason: "Reason",
    origin: "Added by",
    note: "Note",
    added: "Added",
    actions: "Actions",
  },
  days: { today: "Today", yesterday: "Yesterday" },
  actionsFor: (email: string) => `Actions for ${email}`,
  remove: "Remove",
  emptyTitle: "No suppressed addresses yet",
  emptyBody:
    "Addresses that bounce, complain or unsubscribe will appear here, along with any you add by hand or through the API.",
  noMatchTitle: "No addresses match",
  noMatchBody: "Try a different reason or search, or clear the filters.",
  loadMore: "Load more",
  loadMoreFailed: "Could not load more addresses",
  loadFailed: {
    title: "Could not load the suppression list.",
    body: "The server did not answer. Check that the API is running, then try again.",
    retry: "Try again",
  },
  addSheet: {
    title: "Add addresses",
    description:
      "OpenCadence will not email these addresses from this workspace.",
    emails: "Email addresses",
    emailsPlaceholder: "name@example.com",
    emailsHint:
      "Type or paste addresses. Commas, spaces, semicolons and new lines all separate them.",
    emailsList: "Addresses to add",
    removeAddress: (email: string) => `Remove ${email}`,
    counter: (count: number, max: number) =>
      `${countFormat.format(count)} of ${countFormat.format(max)}`,
    missing: "Add at least one address.",
    invalidAddress: "Not a full email address",
    invalidOne: (email: string) =>
      `${email} is not a full email address. Fix it or remove it.`,
    invalidMany: (count: number) =>
      `${countFormat.format(count)} addresses are not full email addresses. They are marked in the list. Fix them or remove them.`,
    overflow: (max: number, dropped: number) =>
      `Only the first ${countFormat.format(max)} addresses were kept. ${countFormat.format(dropped)} more ${dropped === 1 ? "was" : "were"} left out. Add the rest in a second batch.`,
    reason: "What to block",
    reasons: {
      manual: "Block all email",
      unsubscribed: "Unsubscribed",
    } as Record<AddReason, string>,
    reasonHints: {
      manual:
        "No email of any kind goes to these addresses, including transactional email.",
      unsubscribed:
        "Campaigns and sequences skip these addresses. Transactional email still goes out.",
    } as Record<AddReason, string>,
    note: "Note",
    noteOptional: "Optional",
    notePlaceholder: "Why these addresses are blocked",
    noteTooLong: (max: number) => `Use ${max} characters or fewer.`,
    noteCounter: (count: number, max: number) => `${count} / ${max}`,
    submit: "Add addresses",
    cancel: "Cancel",
  },
  removeDialog: {
    title: (email: string) => `Remove ${email}?`,
    body: "OpenCadence will be able to email this address again.",
    warnings: {
      bounced:
        "This address was added after a hard bounce. Sending to it again can hurt your deliverability.",
      complained:
        "This address was added after a spam complaint. Sending to it again can hurt your deliverability.",
    } as Partial<Record<SuppressionReason, string>>,
    confirm: "Remove",
    cancel: "Cancel",
  },
  toasts: {
    added: (added: number, existing: number) =>
      `${countFormat.format(added)} added, ${countFormat.format(existing)} already on the list`,
    addFailed: "Could not add the addresses",
    removed: (email: string) =>
      `${email} was removed from the suppression list`,
    removeFailed: (email: string) => `Could not remove ${email}`,
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
